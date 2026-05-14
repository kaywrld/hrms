// src/App.jsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login          from "./pages/Login";
import ITPortal       from "./pages/ITPortal";
import DeptPortal     from "./pages/DeptPortal";
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

        {/* Other portals — placeholders until built */}
        <Route path="/portal/hrm" element={<ProtectedRoute role="HRM"><div>HRM Portal</div></ProtectedRoute>}/>
        <Route path="/portal/hr"  element={<ProtectedRoute role="HR"><div>HR Portal</div></ProtectedRoute>}/>
        <Route path="/portal/md"  element={<ProtectedRoute role="MD"><div>MD Portal</div></ProtectedRoute>}/>

        {/* Catch all → back to login */}
        <Route path="*" element={<Login />} />
      </Routes>
    </BrowserRouter>
  );
}