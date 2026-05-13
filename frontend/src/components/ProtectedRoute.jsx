// src/components/ProtectedRoute.jsx
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children, role }) {
  const [checked, setChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    const user  = JSON.parse(localStorage.getItem("user") || "{}");

    if (!token || !user?.role) {
      setAllowed(false);
    } else if (role && user.role !== role) {
      setAllowed(false);
    } else {
      setAllowed(true);
    }
    setChecked(true);
  }, [role]);

  if (!checked) return null; // avoid flash
  if (!allowed) return <Navigate to="/" replace />;
  return children;
}