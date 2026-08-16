import Setup2FA from './pages/Setup2FA'
import { Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import Login from './pages/Login'
import Signup from './pages/Signup'
import VerifyEmail from "./pages/VerifyEmail";
import Dashboard from './pages/Dashboard'
import AuditLog from './pages/AuditLog'
import './App.css'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/verify/:token" element={<VerifyEmail />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/audit" element={<AuditLog />} />
      <Route path="/setup-2fa" element={<Setup2FA />} />
    </Routes>
  )
}

export default App