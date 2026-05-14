import { Route, Routes } from 'react-router-dom'

import './App.css'

import { DocumentHead } from './components/DocumentHead'
import NotFoundPage from './pages/NotFoundPage'
import PrivacyPage from './pages/PrivacyPage'
import ResourcesPage from './pages/ResourcesPage'
import RinksPage from './pages/RinksPage'
import TermsPage from './pages/TermsPage'
import YouthOrganizationsPage from './pages/YouthOrganizationsPage'
import { ScheduleDataProvider } from './ScheduleDataContext'
import { ScheduleView } from './ScheduleView'

export default function App() {
  return (
    <ScheduleDataProvider>
      <DocumentHead />
      <Routes>
        <Route path="/" element={<ScheduleView />} />
        <Route path="/rinks" element={<RinksPage />} />
        <Route path="/youth-organizations" element={<YouthOrganizationsPage />} />
        <Route path="/resources" element={<ResourcesPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </ScheduleDataProvider>
  )
}
