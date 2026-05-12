import { Route, Routes } from 'react-router-dom'

import NotFoundPage from './pages/NotFoundPage'
import PrivacyPage from './pages/PrivacyPage'
import ResourcesPage from './pages/ResourcesPage'
import RinksPage from './pages/RinksPage'
import TermsPage from './pages/TermsPage'
import { ScheduleView } from './ScheduleView'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ScheduleView />} />
      <Route path="/rinks" element={<RinksPage />} />
      <Route path="/resources" element={<ResourcesPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
