import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'

import { DocumentHead } from './components/DocumentHead'
import NotFoundPage from './pages/NotFoundPage'
import PrivacyPage from './pages/PrivacyPage'
import ResourcesPage from './pages/ResourcesPage'
import TermsPage from './pages/TermsPage'
import { ScheduleDataProvider } from './ScheduleDataContext'
import { ScheduleView } from './ScheduleView'

const RinksPage = lazy(() => import('./pages/RinksPage'))

export default function App() {
  return (
    <ScheduleDataProvider>
      <DocumentHead />
      <Routes>
        <Route path="/" element={<ScheduleView />} />
        <Route
          path="/rinks"
          element={
            <Suspense
              fallback={
                <main className="page simple-page rinks-page" id="top">
                  <div className="page-wrap status" role="status">
                    Loading rinks…
                  </div>
                </main>
              }
            >
              <RinksPage />
            </Suspense>
          }
        />
        <Route path="/resources" element={<ResourcesPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </ScheduleDataProvider>
  )
}
