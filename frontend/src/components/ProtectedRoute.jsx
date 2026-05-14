// src/components/ProtectedRoute.jsx
//
// Auth check is intentionally synchronous — reading localStorage is instant
// and avoids a null-render window that caused context providers wrapping
// children to be momentarily absent (triggering "must be used inside
// <DeptPortalProvider>" errors from any useDeptPortal() call in children).

import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children, role }) {
  const token = localStorage.getItem("access_token");
  const user  = JSON.parse(localStorage.getItem("user") || "{}");

  const allowed = token && user?.role && (!role || user.role === role);

  if (!allowed) return <Navigate to="/" replace />;
  return children;
}