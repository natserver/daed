import type { TypedDocumentNode } from '@graphql-typed-document-node/core'
import type { ClientError, RequestDocument, Variables } from 'graphql-request'
import { useStore } from '@nanostores/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GraphQLClient } from 'graphql-request'
import { createContext, use, useMemo } from 'react'
import { toast } from 'sonner'

import { isMockMode, MockGraphQLClient } from '~/mocks'
import { endpointURLAtom, getValidToken, tokenAtom, tokenWithExpiryAtom } from '~/store'

// Define a common interface for GraphQL clients
export interface GQLClientInterface {
  request: <T, V extends Variables = Variables>(
    document: RequestDocument | TypedDocumentNode<T, V>,
    variables?: V,
  ) => Promise<T>
}

// Use an interface type to support both real and mock clients
export type GQLClient = GQLClientInterface

export const GQLClientContext = createContext<GQLClient>(null as unknown as GQLClient)

export function GQLQueryClientProvider({ client, children }: { client: GQLClient; children: React.ReactNode }) {
  return <GQLClientContext value={client}>{children}</GQLClientContext>
}

export const useGQLQueryClient = () => use(GQLClientContext)

type ColorScheme = 'dark' | 'light'
type ThemeMode = 'system' | 'light' | 'dark'

interface ColorSchemeContextValue {
  colorScheme: ColorScheme
  themeMode: ThemeMode
  setThemeMode: (mode: ThemeMode) => void
}

export const ColorSchemeContext = createContext<ColorSchemeContextValue>({
  colorScheme: 'light',
  themeMode: 'system',
  setThemeMode: () => {},
})

export const useColorScheme = () => use(ColorSchemeContext)

interface QueryProviderProps {
  children: React.ReactNode
  colorScheme: ColorScheme
  themeMode: ThemeMode
  setThemeMode: (mode: ThemeMode) => void
}

const GQL_TIMEOUT_MS = 30_000

// Custom fetch wrapper with timeout
async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), GQL_TIMEOUT_MS)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

export function QueryProvider({ children, colorScheme, themeMode, setThemeMode }: QueryProviderProps) {
  const endpointURL = useStore(endpointURLAtom)
  const token = useStore(tokenAtom)

  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 2,
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
            staleTime: 5_000,
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: 1,
            retryDelay: 1_000,
          },
        },
      }),
    [],
  )

  const gqlClient = useMemo<GQLClient>(() => {
    // Use mock client in mock mode
    if (isMockMode()) {
      return new MockGraphQLClient('mock://localhost')
    }

    const validToken = getValidToken()

    // If token expired but atom still has a value, clear it
    if (!validToken && token) {
      tokenAtom.set('')
      tokenWithExpiryAtom.set(null)
    }

    return new GraphQLClient(endpointURL, {
      headers: {
        authorization: validToken ? `Bearer ${validToken}` : '',
      },
      fetch: fetchWithTimeout,
      responseMiddleware: (response) => {
        const error = (response as ClientError).response?.errors?.[0]

        if (error) {
          toast.error(error.message)

          if (error.message === 'access denied') {
            tokenAtom.set('')
            tokenWithExpiryAtom.set(null)
          }
        }
      },
    })
  }, [endpointURL, token])

  const colorSchemeContextValue = useMemo(
    () => ({ colorScheme, themeMode, setThemeMode }),
    [colorScheme, themeMode, setThemeMode],
  )

  return (
    <ColorSchemeContext value={colorSchemeContextValue}>
      <QueryClientProvider client={queryClient}>
        <GQLQueryClientProvider client={gqlClient}>{children}</GQLQueryClientProvider>
      </QueryClientProvider>
    </ColorSchemeContext>
  )
}
