// src/components/HRPortal/EmployeeDetailView.jsx
//
// Shared employee detail view, used by both the HR Dashboard (click an
// employee card) and the Employees page (click an employee row).
// Extracted so both entry points render an identical panel, with the
// "Back" behaviour driven by the caller (dashboard vs employees list).

import { useState, useEffect } from "react";
import { apiFetch } from "../../utils/auth";

export function ContractProgressBar({ contractStart, contractEnd }) {
  if (!contractStart || !contractEnd) return null;

  const start = new Date(contractStart);
  const end   = new Date(contractEnd);
  const now   = new Date();

  const totalMs    = end - start;
  const elapsedMs  = now - start;
  const remainingMs = end - now;

  if (totalMs <= 0) return null;

  const pct = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));
  const remainingMonths = Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24 * 30.44)));

  // Color: green (>50% remaining) → orange (20–50%) → red (<20%)
  const remainingPct = 100 - pct;
  const barColor = remainingPct > 50 ? "#16a34a" : remainingPct > 20 ? "#f59e0b" : "#dc2626";
  const bgColor  = remainingPct > 50 ? "#dcfce7"  : remainingPct > 20 ? "#fef9c3"  : "#fee2e2";
  const textColor = remainingPct > 50 ? "#166534" : remainingPct > 20 ? "#854d0e"  : "#991b1b";

  const label = remainingMs <= 0
    ? "Expired"
    : `${remainingMonths} month${remainingMonths !== 1 ? "s" : ""} left`;

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
        <span style={{ fontSize: 11, color: "#64748b", fontFamily: "'DM Sans',sans-serif" }}>
          Contract Progress
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700, color: textColor,
          background: bgColor, borderRadius: 20, padding: "2px 8px",
          fontFamily: "'DM Sans',sans-serif",
        }}>
          {label}
        </span>
      </div>
      <div style={{
        height: 8, background: "#f1f5f9", borderRadius: 99, overflow: "hidden",
      }}>
        <div style={{
          height: "100%", width: `${pct}%`,
          background: barColor,
          borderRadius: 99,
          transition: "width 0.8s cubic-bezier(.4,0,.2,1)",
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{ fontSize: 10, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif" }}>
          {start.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
        </span>
        <span style={{ fontSize: 10, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif" }}>
          {end.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
        </span>
      </div>
    </div>
  );
}

export default function EmployeeDetailView({ emp, onBack, loadingDetail, onEdit, backLabel = "Back to Dashboard" }) {
  if (!emp) return null;

  const getFullName = (e) => e.full_name || [e.first_name, e.middle_name, e.last_name].filter(Boolean).join(" ") || "—";
  const getPhone    = (e) => e.phone || e.phone_number || "";

  const fullName = getFullName(emp);
  const phone    = getPhone(emp);

  const avatarLetters = fullName.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";

  const genderLabel = { M: "Male", F: "Female", O: "Other" };
  const typeLabel   = { full_time: "Full-Time", part_time: "Part-Time", contract: "Contract" };

  const statusStyle = {
    employed:   { bg: "#dcfce7", color: "#166534" },
    terminated: { bg: "#fee2e2", color: "#991b1b" },
    on_leave:   { bg: "#fef9c3", color: "#854d0e" },
    dismissed:  { bg: "#fee2e2", color: "#991b1b" },
    resigned:   { bg: "#fef9c3", color: "#854d0e" },
    suspended:  { bg: "#fce7f3", color: "#9d174d" },
  };
  const ss = statusStyle[emp.status] || { bg: "#f1f5f9", color: "#475569" };

  const dateJoined = emp.date_joined ? new Date(emp.date_joined) : null;
  const now = new Date();
  let tenureStr = "—";
  if (dateJoined) {
    const totalMonths = (now.getFullYear() - dateJoined.getFullYear()) * 12 + (now.getMonth() - dateJoined.getMonth());
    const years  = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;
    tenureStr = years > 0 ? `${years}y ${months}m` : `${months} month${months !== 1 ? "s" : ""}`;
  }

  // Months worked (from date_joined to now)
  const monthsWorked = dateJoined
    ? Math.max(0, (now.getFullYear() - dateJoined.getFullYear()) * 12 + (now.getMonth() - dateJoined.getMonth()))
    : null;

  // Fetch payroll for this employee (bank + salary details)
  const [payroll, setPayroll] = useState(emp.payroll || null);
  useEffect(() => {
    if (payroll) return; // already have it
    apiFetch(`${import.meta.env.VITE_API_BASE_URL}/api/payroll/employee/${emp.id}/`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setPayroll(d); })
      .catch(() => {});
  }, [emp.id]);

  const InfoRow = ({ label, value, valueColor }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start",
      padding: "10px 0", borderBottom: "1px solid #f1f5f9", gap: 12 }}>
      <span style={{ fontSize: 11.5, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif",
        fontWeight: 600, flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.05em", minWidth: 130 }}>
        {label}
      </span>
      <span style={{ fontSize: 13, color: valueColor || "#0f172a", fontFamily: "'DM Sans',sans-serif",
        fontWeight: 500, textAlign: "right", wordBreak: "break-word" }}>
        {value || "—"}
      </span>
    </div>
  );

  const SectionTitle = ({ children }) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: "#0a2a5e", letterSpacing: "1.2px",
      textTransform: "uppercase", fontFamily: "'DM Sans',sans-serif",
      marginBottom: 4, marginTop: 8, paddingBottom: 8,
      borderBottom: "2px solid #eff6ff" }}>
      {children}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, position: "relative" }}>
      {/* Loading overlay while full data fetches */}
      {loadingDetail && (
        <div style={{
          position: "absolute", inset: 0, background: "rgba(255,255,255,0.7)",
          zIndex: 50, borderRadius: 16,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
          backdropFilter: "blur(2px)",
        }}>
          <div style={{ width: 28, height: 28, border: "3px solid #e8edf8", borderTopColor: "#1557b0",
            borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <span style={{ fontSize: 13, color: "#1557b0", fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>
            Loading full details…
          </span>
        </div>
      )}

      {/* Back button + Edit button */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <button
          onClick={onBack}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "none", border: "1.5px solid #e2e8f0",
            borderRadius: 9, padding: "8px 16px",
            fontSize: 13, color: "#475569", fontFamily: "'DM Sans',sans-serif",
            fontWeight: 500, cursor: "pointer",
            transition: "border-color 0.15s, color 0.15s, background 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#1557b0"; e.currentTarget.style.color = "#1557b0"; e.currentTarget.style.background = "#eff6ff"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.color = "#475569"; e.currentTarget.style.background = "none"; }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {backLabel}
        </button>
        {onEdit && (
          <button
            onClick={() => onEdit(emp)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "9px 18px", borderRadius: 10, border: "none",
              background: "linear-gradient(135deg,#0a2a5e,#1557b0)",
              color: "#fff", fontSize: 13, fontWeight: 600,
              fontFamily: "'DM Sans',sans-serif", cursor: "pointer",
              boxShadow: "0 2px 8px rgba(21,87,176,0.25)",
              transition: "opacity 0.15s, transform 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = "0.88"; e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "none"; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit Employee
          </button>
        )}
      </div>

      {/* Profile header card */}
      <div style={{
        background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0",
        boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
        padding: "28px 32px",
        display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap",
      }}>
        {/* Avatar */}
        <div style={{
          width: 88, height: 88, borderRadius: 22, overflow: "hidden", flexShrink: 0,
          background: "linear-gradient(135deg, #0e3d82, #1a6fd4)",
          display: "flex", alignItems: "center", justifyContent: "center",
          border: "3px solid #eff6ff",
        }}>
          {(emp.profile_picture || emp.photo || emp.avatar) ? (
            <img src={emp.profile_picture || emp.photo || emp.avatar} alt={fullName}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              onError={e => { e.target.style.display = "none"; }} />
          ) : (
            <span style={{ fontSize: 30, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans',sans-serif" }}>
              {avatarLetters}
            </span>
          )}
        </div>

        {/* Name / badges */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 700, color: "#0a2a5e",
            fontFamily: "'Playfair Display',serif", lineHeight: 1.2 }}>
            {fullName}
          </h1>
          {emp.employee_number && (
            <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif", marginBottom: 10 }}>
              #{emp.employee_number}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "4px 12px",
              background: ss.bg, color: ss.color, fontFamily: "'DM Sans',sans-serif" }}>
              {(emp.status || "—").replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 600, borderRadius: 20, padding: "4px 12px",
              background: emp.employment_type === "full_time" ? "#eff6ff" : emp.employment_type === "part_time" ? "#fffbeb" : "#f5f3ff",
              color: emp.employment_type === "full_time" ? "#1557b0" : emp.employment_type === "part_time" ? "#b45309" : "#7c3aed",
              fontFamily: "'DM Sans',sans-serif",
            }}>
              {typeLabel[emp.employment_type] || emp.employment_type || "—"}
            </span>
            {emp.job_title && (
              <span style={{ fontSize: 12, color: "#64748b", fontFamily: "'DM Sans',sans-serif" }}>
                · {emp.job_title || emp.position}
              </span>
            )}
            {emp.department_name && (
              <span style={{ fontSize: 12, color: "#64748b", fontFamily: "'DM Sans',sans-serif" }}>
                · {emp.department_name}
              </span>
            )}
          </div>
        </div>

        {/* Tenure / joined highlight */}
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <div style={{ textAlign: "center", background: "#f8faff", borderRadius: 12,
            border: "1px solid #e2e8f0", padding: "14px 20px", minWidth: 100 }}>
            <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700, letterSpacing: "0.8px",
              textTransform: "uppercase", fontFamily: "'DM Sans',sans-serif", marginBottom: 4 }}>Tenure</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#0a2a5e",
              fontFamily: "'Playfair Display',serif" }}>{tenureStr}</div>
          </div>
          {dateJoined && (
            <div style={{ textAlign: "center", background: "#f8faff", borderRadius: 12,
              border: "1px solid #e2e8f0", padding: "14px 20px", minWidth: 100 }}>
              <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700, letterSpacing: "0.8px",
                textTransform: "uppercase", fontFamily: "'DM Sans',sans-serif", marginBottom: 4 }}>Joined</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#334155",
                fontFamily: "'DM Sans',sans-serif" }}>
                {dateJoined.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Contract progress bar for contract employees */}
      {emp.employment_type === "contract" && (
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0",
          boxShadow: "0 1px 6px rgba(0,0,0,0.05)", padding: "22px 32px" }}>
          <SectionTitle>Contract Status</SectionTitle>
          <div style={{ marginTop: 12 }}>
            <ContractProgressBar
              contractStart={emp.contract_start || emp.date_joined}
              contractEnd={emp.contract_end || emp.contract_expiry}
            />
          </div>
        </div>
      )}

      {/* Detail sections grid */}
      <div className="hr-charts-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>

        {/* Personal Details */}
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0",
          boxShadow: "0 1px 6px rgba(0,0,0,0.05)", padding: "22px 28px" }}>
          <SectionTitle>Personal Details</SectionTitle>
          <InfoRow label="Full Name"     value={fullName} />
          <InfoRow label="Gender"        value={genderLabel[emp.gender] || emp.gender} />
          <InfoRow label="Date of Birth" value={
            (emp.date_of_birth || emp.dob || emp.birth_date)
              ? new Date(emp.date_of_birth || emp.dob || emp.birth_date)
                  .toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
              : null
          } />
          <InfoRow label="National ID"   value={
            emp.national_id || emp.id_number || emp.national_id_number ||
            emp.id_no || emp.nin || emp.passport_number || emp.id
              ? String(emp.national_id || emp.id_number || emp.national_id_number || emp.id_no || emp.nin || emp.passport_number || "")
              : null
          } />
          <InfoRow label="Address"       value={
            emp.address || emp.home_address || emp.residential_address ||
            emp.physical_address || emp.street_address || emp.location
          } />
        </div>

        {/* Contact */}
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0",
          boxShadow: "0 1px 6px rgba(0,0,0,0.05)", padding: "22px 28px" }}>
          <SectionTitle>Contact Information</SectionTitle>
          <InfoRow label="Email"             value={emp.email || emp.email_address} valueColor="#1557b0" />
          <InfoRow label="Phone"             value={phone} />
          <InfoRow label="Alt Phone"         value={emp.alt_phone || emp.alternative_phone || emp.other_phone || emp.phone2} />
          <InfoRow label="Next of Kin"       value={
            emp.nok_full_name || emp.next_of_kin || emp.next_of_keen ||
            emp.emergency_contact || emp.emergency_contact_name || emp.nok_name
          } />
          <InfoRow label="Relationship"      value={emp.nok_relationship} />
          <InfoRow label="Next of Kin Phone" value={
            emp.nok_phone || emp.next_of_kin_phone ||
            emp.emergency_contact_phone || emp.emergency_phone
          } />
        </div>

        {/* Employment Information */}
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0",
          boxShadow: "0 1px 6px rgba(0,0,0,0.05)", padding: "22px 28px" }}>
          <SectionTitle>Employment Information</SectionTitle>
          <InfoRow label="Job Title"    value={emp.job_title || emp.position || emp.role} />
          <InfoRow label="Department"   value={emp.department_name || emp.department} />
          <InfoRow label="Employment Type" value={typeLabel[emp.employment_type] || emp.employment_type} />
          <InfoRow label="Status"       value={(emp.status || "").replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}
            valueColor={ss.color} />
          <InfoRow label="Date Joined"  value={dateJoined
            ? dateJoined.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
            : null} />
          <InfoRow label="Employee No." value={emp.employee_number ? `#${emp.employee_number}` : null} />
          {emp.employment_type === "contract" && (
            <>
              <InfoRow label="Contract Start" value={emp.contract_start
                ? new Date(emp.contract_start).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
                : null} />
              <InfoRow label="Contract End"   value={(emp.contract_end || emp.contract_expiry)
                ? new Date(emp.contract_end || emp.contract_expiry).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
                : null} />
            </>
          )}
        </div>

        {/* Payroll / Bank */}
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0",
          boxShadow: "0 1px 6px rgba(0,0,0,0.05)", padding: "22px 28px" }}>
          <SectionTitle>Payroll &amp; Bank</SectionTitle>
          {payroll ? (
            <>
              {/* Banking Details */}
              <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10,
                padding: "12px 14px", marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#0891b2", letterSpacing: "0.8px",
                  textTransform: "uppercase", fontFamily: "'DM Sans',sans-serif", marginBottom: 10 }}>
                  🏦 Banking Details
                </div>
                <InfoRow label="USD Bank"        value={payroll.bank_name_usd    || emp.bank_name_usd} />
                <InfoRow label="USD Account No." value={payroll.bank_account_usd || emp.bank_account_usd} />
                <InfoRow label="ZiG Bank"        value={payroll.bank_name_zig    || emp.bank_name_zig} />
                <InfoRow label="ZiG Account No." value={payroll.bank_account_zig || emp.bank_account_zig} />
                <InfoRow label="Currency"       value={payroll.currency || "USD"} />
              </div>
              {/* Salary Details */}
              <InfoRow label="Basic Salary"  value={payroll.basic_salary
                ? `$${Number(payroll.basic_salary).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : null} />
              {Number(payroll.allowances) > 0 && (
                <InfoRow label="Allowances"  value={`$${Number(payroll.allowances).toLocaleString("en-US", { minimumFractionDigits: 2 })}`} />
              )}
              {Number(payroll.deductions) > 0 && (
                <InfoRow label="Deductions"  value={`$${Number(payroll.deductions).toLocaleString("en-US", { minimumFractionDigits: 2 })}`} />
              )}
              <InfoRow label="Net Salary"
                value={payroll.basic_salary
                  ? `$${(Number(payroll.basic_salary) + Number(payroll.allowances || 0) - Number(payroll.deductions || 0)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : null}
                valueColor="#166534" />
              {/* Months in Service bar */}
              {monthsWorked !== null && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #f1f5f9" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 11.5, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif",
                      fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Months in Service
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#0a2a5e", fontFamily: "'Playfair Display',serif" }}>
                      {monthsWorked}
                    </span>
                  </div>
                  <div style={{ height: 8, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      width: `${Math.min(100, (monthsWorked / 120) * 100)}%`,
                      background: monthsWorked >= 60 ? "#16a34a" : monthsWorked >= 24 ? "#1557b0" : "#f59e0b",
                      borderRadius: 99, transition: "width 0.8s cubic-bezier(.4,0,.2,1)",
                    }} />
                  </div>
                  <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4, fontFamily: "'DM Sans',sans-serif" }}>
                    {monthsWorked < 12 ? "< 1 year" : `${Math.floor(monthsWorked / 12)} year${Math.floor(monthsWorked / 12) !== 1 ? "s" : ""} of service`}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 0", gap: 8 }}>
              <div style={{ width: 28, height: 28, border: "2.5px solid #e8edf8", borderTopColor: "#1557b0",
                borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              <span style={{ color: "#cbd5e1", fontSize: 12, fontFamily: "'DM Sans',sans-serif" }}>
                Loading payroll…
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Notes / bio — full width */}
      {(emp.notes || emp.bio || emp.remarks) && (
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0",
          boxShadow: "0 1px 6px rgba(0,0,0,0.05)", padding: "22px 28px" }}>
          <SectionTitle>Notes</SectionTitle>
          <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.7,
            fontFamily: "'DM Sans',sans-serif", marginTop: 12 }}>
            {emp.notes || emp.bio || emp.remarks}
          </div>
        </div>
      )}

      {/* Documents — CV + Education Certificate + any attachments */}
      {(() => {
        // Build document list from model fields: cv, highest_education_certificate, plus any attached docs array
        const apiBase = "${import.meta.env.VITE_API_BASE_URL}";
        const docList = [];
        if (emp.cv) {
          const url = emp.cv.startsWith("http") ? emp.cv : `${apiBase}${emp.cv.startsWith("/") ? "" : "/media/"}${emp.cv}`;
          docList.push({ name: "Curriculum Vitae (CV)", url, type: "cv" });
        }
        if (emp.highest_education_certificate) {
          const url = emp.highest_education_certificate.startsWith("http")
            ? emp.highest_education_certificate
            : `${apiBase}${emp.highest_education_certificate.startsWith("/") ? "" : "/media/"}${emp.highest_education_certificate}`;
          docList.push({ name: "Education Certificate", url, type: "cert" });
        }
        // Also include any extra docs array if present
        const extraDocs = emp.documents || emp.files || emp.attachments || [];
        if (Array.isArray(extraDocs)) {
          extraDocs.forEach((doc, i) => {
            const name = doc.name || doc.file_name || doc.filename || doc.title || `Document ${i + 1}`;
            const url  = doc.url  || doc.file_url  || doc.file     || doc.path  || "#";
            docList.push({ name, url, uploaded_at: doc.uploaded_at });
          });
        }
        return (
          <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0",
            boxShadow: "0 1px 6px rgba(0,0,0,0.05)", padding: "22px 28px" }}>
            <SectionTitle>Documents</SectionTitle>
            {docList.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", padding: "28px 0", gap: 10 }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
                  stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span style={{ fontSize: 13, color: "#cbd5e1", fontFamily: "'DM Sans',sans-serif" }}>
                  No documents uploaded
                </span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
                {docList.map((doc, i) => {
                  const name = doc.name;
                  const url  = doc.url || "#";
                  const ext  = name.split(".").pop().toLowerCase();
                  const iconColor = ext === "pdf" ? "#dc2626" : ["doc","docx"].includes(ext) ? "#1557b0" : ["xls","xlsx"].includes(ext) ? "#16a34a" : doc.type === "cv" ? "#7c3aed" : doc.type === "cert" ? "#0891b2" : "#64748b";
                  return (
                    <div key={`doc-${i}`} style={{
                      display: "flex", alignItems: "center", gap: 14,
                      padding: "12px 16px",
                      background: "#fafbff", borderRadius: 10,
                      border: "1px solid #e2e8f0",
                      flexWrap: "wrap",
                    }}>
                      {/* File icon */}
                      <div style={{
                        width: 38, height: 38, borderRadius: 9, flexShrink: 0,
                        background: "#eff6ff",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                          stroke={iconColor} strokeWidth="1.8" strokeLinecap="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                      </div>
                      {/* File name + type */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a",
                          fontFamily: "'DM Sans',sans-serif",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {name}
                        </div>
                        {doc.uploaded_at && (
                          <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif", marginTop: 2 }}>
                            {new Date(doc.uploaded_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                          </div>
                        )}
                      </div>
                      {/* Download button */}
                      <a
                        href={url}
                        download={name}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          padding: "7px 14px",
                          background: "#1557b0", color: "#fff",
                          borderRadius: 8, fontSize: 12, fontWeight: 600,
                          fontFamily: "'DM Sans',sans-serif",
                          textDecoration: "none", flexShrink: 0,
                          transition: "background 0.15s",
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "#0e3d82"}
                        onMouseLeave={e => e.currentTarget.style.background = "#1557b0"}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Download
                      </a>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}