import { useState, useEffect } from "react";

const ROLE_ROUTES = {
  IT:           "/portal/it",
  MD:           "/portal/md",
  HRM:          "/portal/hrm",
  HR:           "/portal/hr",
  HOD:          "/portal/hod",
  HOD_ACCOUNTS: "/portal/hod-accounts",
};

export default function Login() {
  const [form, setForm]             = useState({ username: "", password: "" });
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [showForgot, setShowForgot] = useState(false);
  const [showPass, setShowPass]     = useState(false);
  const [bgLoaded, setBgLoaded]     = useState(false);
  const [infoMsg, setInfoMsg]       = useState("");

  // Check if we were redirected here due to inactivity or session takeover
  useEffect(() => {
    const reason = sessionStorage.getItem("logout_reason");
    if (reason === "inactivity") {
      setInfoMsg("You were automatically logged out after 10 minutes of inactivity.");
      sessionStorage.removeItem("logout_reason");
    } else if (reason === "session_invalidated") {
      setInfoMsg("Your session was ended because this account was logged in on another device.");
      sessionStorage.removeItem("logout_reason");
    }
  }, []);

  // Preload background image via JS Image object — avoids React DOM attribute warning
  // and works with the service worker cache
  useEffect(() => {
    const img = new Image();
    img.src = "/bg.jpeg";
    img.onload  = () => setBgLoaded(true);
    img.onerror = () => setBgLoaded(true); // show overlay even if bg fails
  }, []);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError("");
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!form.username || !form.password) {
      setError("Please enter both username and password.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("http://127.0.0.1:8000/api/auth/login/", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ username: form.username, password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) {
        // DRF + SimpleJWT surfaces our ValidationError in different shapes
        // depending on the DRF version.  We check the common places:
        //   1. data.detail (string or object with .code)
        //   2. data.non_field_errors[0] (array of strings or objects)
        let errorMsg = "Invalid username or password.";

        const detail = data?.detail;
        const nonField = Array.isArray(data?.non_field_errors)
          ? data.non_field_errors[0]
          : null;

        const candidate = detail ?? nonField;

        if (candidate) {
          if (typeof candidate === "string") {
            errorMsg = candidate;
          } else if (typeof candidate === "object" && candidate.detail) {
            // Our custom shape: { detail: "...", code: "already_logged_in" }
            errorMsg = candidate.detail;
          } else if (typeof candidate === "object" && candidate.message) {
            errorMsg = candidate.message;
          }
        }

        setError(errorMsg);
        setLoading(false);
        return;
      }
      localStorage.setItem("access_token",  data.access);
      localStorage.setItem("refresh_token", data.refresh);
      localStorage.setItem("user",          JSON.stringify(data.user));

      // must_change_password comes from the server — no localStorage guessing.
      // This works across all devices because it's DB-backed.
      if (data.user.must_change_password) {
        localStorage.setItem("dp_must_change_pw", "true");
      } else {
        localStorage.removeItem("dp_must_change_pw");
      }

      // If another session was active, the server kicked it. Tell the user
      // via a banner on the portal (not an error — login still succeeded).
      if (data.user.session_displaced) {
        sessionStorage.setItem("session_displaced_notice", "true");
      }

      const route = ROLE_ROUTES[data.user.role] || "/portal";
      window.location.href = route;
    } catch {
      setError("Unable to connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .hrms-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'DM Sans', sans-serif;
          position: relative;
          overflow: hidden;
          background-color: #0a1a5c;
        }

        .hrms-bg {
          position: fixed;
          inset: 0;
          background-image: url('/bg.jpeg');
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          z-index: 0;
          opacity: 0;
          transition: opacity 0.7s ease;
        }
        .hrms-bg.loaded { opacity: 1; }

        .hrms-overlay {
          position: fixed;
          inset: 0;
          background: linear-gradient(
            135deg,
            rgba(10,20,60,0.88) 0%,
            rgba(15,30,90,0.82) 50%,
            rgba(8,15,50,0.92) 100%
          );
          z-index: 1;
        }

        .hrms-card {
          position: relative;
          z-index: 2;
          background: #ffffff;
          border-radius: 20px;
          width: 100%;
          max-width: 440px;
          padding: 48px 44px 44px;
          box-shadow: 0 32px 80px rgba(0,0,10,0.45), 0 8px 24px rgba(0,0,10,0.2);
          animation: slideUp 0.5s cubic-bezier(0.22,1,0.36,1) both;
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(32px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .logo-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 14px;
          margin-bottom: 28px;
        }

        .logo-img {
          height: 56px;
          width: auto;
          object-fit: contain;
          display: block;
        }

        .logo-fallback {
          width: 52px;
          height: 52px;
          background: linear-gradient(135deg, #0a1a5c 0%, #1a3a9c 100%);
          border-radius: 14px;
          display: none;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .logo-fallback svg { width: 28px; height: 28px; }

        .logo-text { line-height: 1; }
        .logo-main {
          font-family: 'Playfair Display', serif;
          font-weight: 700;
          font-size: 22px;
          color: #0a1a5c;
          letter-spacing: -0.3px;
        }
        .logo-sub {
          font-size: 11px;
          font-weight: 500;
          color: #6b7280;
          letter-spacing: 2px;
          text-transform: uppercase;
          margin-top: 2px;
        }

        .divider {
          height: 1px;
          background: #e5e7eb;
          margin-bottom: 28px;
        }

        .welcome-title {
          font-family: 'Playfair Display', serif;
          font-size: 22px;
          font-weight: 600;
          color: #0f172a;
          margin-bottom: 6px;
          letter-spacing: -0.3px;
        }
        .welcome-sub {
          font-size: 14px;
          color: #6b7280;
          font-weight: 300;
          margin-bottom: 28px;
        }

        .field { margin-bottom: 18px; }
        .field label {
          display: block;
          font-size: 13px;
          font-weight: 500;
          color: #374151;
          margin-bottom: 7px;
          letter-spacing: 0.1px;
        }

        .input-wrap { position: relative; }
        .input-wrap input {
          width: 100%;
          padding: 13px 44px 13px 16px;
          border: 1.5px solid #e5e7eb;
          border-radius: 10px;
          font-size: 15px;
          font-family: 'DM Sans', sans-serif;
          font-weight: 400;
          color: #0f172a;
          background: #fafafa;
          outline: none;
          transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
        }
        .input-wrap input:focus {
          border-color: #0a1a5c;
          background: #fff;
          box-shadow: 0 0 0 3px rgba(10,26,92,0.08);
        }
        .input-wrap input::placeholder { color: #9ca3af; }

        .toggle-pass {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          color: #9ca3af;
          padding: 2px;
          display: flex;
          align-items: center;
          transition: color 0.15s;
        }
        .toggle-pass:hover { color: #374151; }

        .forgot-link {
          display: inline-block;
          margin-top: 6px;
          font-size: 13px;
          color: #0a1a5c;
          font-weight: 500;
          cursor: pointer;
          text-decoration: none;
          border-bottom: 1px solid transparent;
          transition: border-color 0.15s;
        }
        .forgot-link:hover { border-color: #0a1a5c; }

        .error-box {
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 10px;
          padding: 11px 14px;
          font-size: 13.5px;
          color: #b91c1c;
          margin-bottom: 18px;
          display: flex;
          align-items: flex-start;
          gap: 8px;
          animation: fadeIn 0.2s ease;
        }

        .info-box {
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          border-radius: 10px;
          padding: 11px 14px;
          font-size: 13.5px;
          color: #1d4ed8;
          margin-bottom: 18px;
          display: flex;
          align-items: flex-start;
          gap: 8px;
          animation: fadeIn 0.2s ease;
        }

        .device-error-box {
          background: #fff7ed;
          border: 1px solid #fed7aa;
          border-radius: 10px;
          padding: 11px 14px;
          font-size: 13.5px;
          color: #c2410c;
          margin-bottom: 18px;
          display: flex;
          align-items: flex-start;
          gap: 8px;
          animation: fadeIn 0.2s ease;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        .btn-login {
          width: 100%;
          padding: 14px;
          background: linear-gradient(135deg, #0a1a5c 0%, #1a3a9c 100%);
          color: #fff;
          border: none;
          border-radius: 10px;
          font-family: 'DM Sans', sans-serif;
          font-size: 15px;
          font-weight: 500;
          letter-spacing: 0.2px;
          cursor: pointer;
          transition: opacity 0.2s, transform 0.15s;
          margin-top: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .btn-login:hover:not(:disabled) { opacity: 0.92; transform: translateY(-1px); }
        .btn-login:active:not(:disabled) { transform: translateY(0); }
        .btn-login:disabled { opacity: 0.65; cursor: not-allowed; }

        .spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255,255,255,0.35);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          flex-shrink: 0;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .footer-note {
          text-align: center;
          margin-top: 24px;
          font-size: 12px;
          color: #9ca3af;
          letter-spacing: 0.2px;
        }

        .forgot-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(10,20,60,0.6);
          z-index: 200;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: fadeIn 0.2s ease;
        }

        .forgot-modal {
          background: #fff;
          border-radius: 18px;
          padding: 40px 36px;
          max-width: 380px;
          width: 90%;
          box-shadow: 0 24px 64px rgba(0,0,0,0.3);
          animation: slideUp 0.3s cubic-bezier(0.22,1,0.36,1) both;
          text-align: center;
        }

        .forgot-icon-wrap {
          width: 64px;
          height: 64px;
          background: #eff6ff;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px;
        }

        .forgot-modal h2 {
          font-family: 'Playfair Display', serif;
          font-size: 20px;
          font-weight: 600;
          color: #0f172a;
          margin-bottom: 12px;
        }

        .forgot-modal p {
          font-size: 14px;
          color: #4b5563;
          line-height: 1.65;
          margin-bottom: 8px;
        }

        .forgot-modal strong { color: #0a1a5c; font-weight: 500; }

        .contact-badge {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          border-radius: 8px;
          padding: 10px 18px;
          margin: 14px 0 22px;
          font-size: 13.5px;
          color: #1e40af;
          font-weight: 500;
        }

        .btn-close-modal {
          width: 100%;
          padding: 12px;
          background: #0a1a5c;
          color: #fff;
          border: none;
          border-radius: 10px;
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: opacity 0.2s;
        }
        .btn-close-modal:hover { opacity: 0.88; }

        @media (max-width: 480px) {
          .hrms-card { padding: 36px 24px 32px; margin: 16px; border-radius: 16px; }
          .logo-img  { height: 44px; }
        }
      `}</style>

      <div className="hrms-root">
        {/* Background — driven by JS Image() preload, no DOM img needed */}
        <div className={`hrms-bg${bgLoaded ? " loaded" : ""}`} />
        <div className="hrms-overlay" />

        <div className="hrms-card">

          {/* Logo */}
          <div className="logo-wrap">
            <img
              className="logo-img"
              src="/logo.jpeg"
              alt="JECCA Engineering Logo"
              loading="eager"
              decoding="async"
              onError={e => {
                e.target.style.display = "none";
                const fb = document.getElementById("logo-fallback");
                if (fb) fb.style.display = "flex";
              }}
            />
            <div id="logo-fallback" className="logo-fallback">
              <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M14 3L25 8.5V14C25 19.8 20.1 24.4 14 26C7.9 24.4 3 19.8 3 14V8.5L14 3Z"
                  fill="white" fillOpacity="0.15" stroke="white" strokeWidth="1.5"
                />
                <path d="M9 14H19M14 9V19" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="logo-text">
              <div className="logo-main">JECCA</div>
              <div className="logo-sub">Engineering</div>
            </div>
          </div>

          <div className="divider" />

          {/* Headings */}
          <div className="welcome-title">Welcome to JECCA Engineering</div>
          <div className="welcome-sub">Sign in with your details to continue</div>

          {/* Inactivity logout banner */}
          {infoMsg && (
            <div className="info-box" role="status">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
                style={{ flexShrink: 0, marginTop: 1 }}>
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
              </svg>
              {infoMsg}
            </div>
          )}

          {/* Error */}
          {error && (
            error.includes("another device") ? (
              <div className="device-error-box" role="alert">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
                  style={{ flexShrink: 0, marginTop: 1 }}>
                  <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
                </svg>
                {error}
              </div>
            ) : (
              <div className="error-box" role="alert">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
                  style={{ flexShrink: 0, marginTop: 1 }}>
                  <circle cx="8" cy="8" r="7" stroke="#b91c1c" strokeWidth="1.5"/>
                  <path d="M8 5v3.5M8 11h.01" stroke="#b91c1c" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                {error}
              </div>
            )
          )}

          {/* Form */}
          <form onSubmit={handleLogin} noValidate>
            <div className="field">
              <label htmlFor="username">Username</label>
              <div className="input-wrap">
                <input
                  id="username"
                  name="username"
                  type="text"
                  placeholder="Enter your username"
                  value={form.username}
                  onChange={handleChange}
                  autoComplete="username"
                  autoFocus
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <div className="input-wrap">
                <input
                  id="password"
                  name="password"
                  type={showPass ? "text" : "password"}
                  placeholder="Enter your password"
                  value={form.password}
                  onChange={handleChange}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="toggle-pass"
                  onClick={() => setShowPass(!showPass)}
                  aria-label={showPass ? "Hide password" : "Show password"}
                >
                  {showPass ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>

              <span
                className="forgot-link"
                role="button"
                tabIndex={0}
                onClick={() => setShowForgot(true)}
                onKeyDown={e => e.key === "Enter" && setShowForgot(true)}
              >
                Forgot password?
              </span>
            </div>

            <button type="submit" className="btn-login" disabled={loading}>
              {loading
                ? <><div className="spinner" aria-hidden="true" /> Signing in…</>
                : "Sign In"
              }
            </button>
          </form>

          <div className="footer-note">
            JECCA Engineering HRMS &nbsp;·&nbsp; Authorised personnel only
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgot && (
        <div
          className="forgot-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Forgot password"
          onClick={e => e.target === e.currentTarget && setShowForgot(false)}
        >
          <div className="forgot-modal">
            <div className="forgot-icon-wrap">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                stroke="#1e40af" strokeWidth="1.8" strokeLinecap="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>

            <h2>Password Reset</h2>
            <p>
              For security, password resets must be performed by your
              <strong> HR Manager</strong> or the <strong>IT Manager</strong>.
              You cannot reset your own password from here.
            </p>

            <div className="contact-badge">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12 19.79 19.79 0 0 1 1.07 3.4A2 2 0 0 1 3.05 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 16.92z"/>
              </svg>
              Contact HR Manager or IT Manager
            </div>

            <p style={{ fontSize: "13px", color: "#9ca3af" }}>
              They can reset passwords from within the admin portal
              under <strong>Admin Management</strong>.
            </p>

            <button className="btn-close-modal" onClick={() => setShowForgot(false)}>
              Got it, I'll contact HR / IT
            </button>
          </div>
        </div>
      )}
    </>
  );
}