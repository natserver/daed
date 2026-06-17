import { lazy, Suspense } from 'react'
import { BrowserRouter, HashRouter, Route, Routes } from 'react-router-dom'

import { MainLayout, OrchestratePage, SetupPage } from '~/pages'

const GraphiQLPage = lazy(() => import('~/pages/GraphiQLPage'))

export function Router() {
  const RouterType = import.meta.env.DEV ? BrowserRouter : HashRouter

  return (
    <RouterType>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<OrchestratePage />} />
        </Route>

        <Route path="/setup" element={<SetupPage />} />

        {import.meta.env.DEV && (
          <Route
            path="/graphiql"
            element={
              <Suspense fallback={<div>Loading...</div>}>
                <GraphiQLPage />
              </Suspense>
            }
          />
        )}
      </Routes>
    </RouterType>
  )
}
