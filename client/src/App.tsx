import { Routes, Route } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { DashboardPage } from './pages/DashboardPage'
import { ReportsPage } from './pages/ReportsPage'
import { AuthCallback } from './pages/AuthCallback'
import { ResetPassword } from './pages/ResetPassword'
import { SettingsPage } from '@/components/settings/SettingsPage'

function App() {
  return (
    <div className="min-h-screen bg-background">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/dashboard/reports" element={<ReportsPage />} />
        <Route path="/dashboard/settings" element={<SettingsPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/auth/reset-password" element={<ResetPassword />} />
      </Routes>
    </div>
  )
}

export default App
