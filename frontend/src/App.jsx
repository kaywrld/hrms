// src/App.jsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login          from "./pages/Login";
import ITPortal       from "./pages/ITPortal";
import DeptPortal     from "./pages/DeptPortal";
import HRPortal       from "./pages/HRPortal";
import MDPortal       from "./pages/MDPortal";
import ProtectedRoute from "./components/ProtectedRoute";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />

        {/* IT Portal — full system access */}
        <Route path="/portal/it" element={
          <ProtectedRoute role="IT"><ITPortal /></ProtectedRoute>
        }/>

        {/* Department Admin Portal — HOD & HOD_ACCOUNTS, scoped to their department */}
        <Route path="/portal/hod" element={
          <ProtectedRoute role="HOD"><DeptPortal /></ProtectedRoute>
        }/>
        <Route path="/portal/hod-accounts" element={
          <ProtectedRoute role="HOD_ACCOUNTS"><DeptPortal /></ProtectedRoute>
        }/>

        {/* HR Portal — Human Resource Manager & Standard HR */}
        <Route path="/portal/hrm" element={<ProtectedRoute role="HRM"><HRPortal /></ProtectedRoute>}/>
        <Route path="/portal/hr"  element={<ProtectedRoute role="HR"><HRPortal /></ProtectedRoute>}/>

        {/* Managing Director Portal — read-only executive overview */}
        <Route path="/portal/md"  element={<ProtectedRoute role="MD"><MDPortal /></ProtectedRoute>}/>

        {/* Catch all → back to login */}
        <Route path="*" element={<Login />} />
      </Routes>
    </BrowserRouter>
  );
}