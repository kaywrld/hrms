import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Login from './pages/Login'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/portal/md"           element={<div>MD Portal</div>} />
        <Route path="/portal/hrm"          element={<div>HRM Portal</div>} />
        <Route path="/portal/hr"           element={<div>HR Portal</div>} />
        <Route path="/portal/hod"          element={<div>HOD Portal</div>} />
        <Route path="/portal/hod-accounts" element={<div>Accounts HOD Portal</div>} />
      </Routes>
    </BrowserRouter>
  )
}