import { createGraphiQLFetcher } from '@graphiql/toolkit'
import { useStore } from '@nanostores/react'
import { GraphiQL } from 'graphiql'

import { endpointURLAtom } from '~/store'

export default function GraphiQLPage() {
  const endpointURL = useStore(endpointURLAtom)

  if (!endpointURL) {
    return <div>No endpoint URL configured</div>
  }

  const fetcher = createGraphiQLFetcher({ url: endpointURL })

  return <GraphiQL fetcher={fetcher} />
}
