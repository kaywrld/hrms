// src/components/HRPortal/PaymentScheduleModal.jsx
//
// "Bank Payment File" dialog for the Payroll page. It loads the payroll rows
// for the month being viewed, shows HR exactly who will (and won't) be in the
// file BEFORE anything is downloaded, then produces the bank-format Excel.

import { useState, useEffect, useMemo } from "react";
import { buildPaymentLines, downloadPaymentSchedule, PAYMENT_FILE_CONFIG } from "../../utils/paymentSchedule";

const FONT = "'DM Sans',sans-serif";

const labelStyle = {
  display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: 0.7, color: "#64748b", marginBottom: 6, fontFamily: FONT,
};
const fieldStyle = {
  width: "100%", padding: "10px 13px", border: "1.5px solid #e2e8f0", borderRadius: 9,
  fontSize: 13.5, fontFamily: FONT, color: "#0f172a", background: "#fafbff",
  outline: "none", boxSizing: "border-box",
};

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function IssueBox({ tone, title, children }) {
  const t = tone === "red"
    ? { bg: "#fef2f2", border: "#fecaca", text: "#991b1b" }
    : { bg: "#fff7ed", border: "#fed7aa", text: "#92400e" };
  return (
    <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: t.text, fontFamily: FONT, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: t.text, fontFamily: FONT, lineHeight: 1.55, maxHeight: 110, overflowY: "auto" }}>
        {children}
      </div>
    </div>
  );
}

export default function PaymentScheduleModal({
  currency,          // "USD" | "ZIG"
  monthName,         // "September"
  monthLabel,        // "September 2026"
  activeFilters,     // string[] of filters currently narrowing the payroll list
  loadRows,          // async () => payroll export rows (the page's buildExportRows)
  onClose,
  showToast,
}) {
  const isZig = currency === "ZIG";
  const code = isZig ? "ZWG" : "USD";

  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [preview, setPreview]   = useState(null);   // { lines, skipped, noSwift }
  const [payDate, setPayDate]   = useState(todayISO());
  const [batch, setBatch]       = useState("1");
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await loadRows();
        if (!cancelled) setPreview(buildPaymentLines(rows, currency));
      } catch {
        if (!cancelled) setError("Could not load payroll data. Please close this and try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // loadRows is intentionally not a dependency: we want one snapshot per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = useMemo(
    () => (preview ? preview.lines.reduce((s, l) => s + l.amount, 0) : 0),
    [preview]
  );
  const money = (n) =>
    `${isZig ? "ZiG " : "$"}${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const batchNum = Math.max(1, parseInt(batch, 10) || 1);
  const canDownload = !loading && !saving && preview && preview.lines.length > 0 && !!payDate;

  const handleDownload = async () => {
    if (!canDownload) return;
    setSaving(true);
    try {
      const filename =
        `Jecca_${monthName}_${isZig ? "ZWG_" : ""}Salary_Schedule${batchNum > 1 ? `_Batch${batchNum}` : ""}.xlsx`;
      await downloadPaymentSchedule({ lines: preview.lines, currency, payDate, batch: batchNum, filename });
      showToast?.(`Payment file downloaded — ${preview.lines.length} payments, ${money(total)}.`);
      onClose();
    } catch {
      showToast?.("Failed to create the payment file.", "err");
      setSaving(false);
    }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(10,26,80,0.52)", zIndex: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={e => e.target === e.currentTarget && !saving && onClose()}
    >
      <div className="pr-modal" style={{ background: "#fff", borderRadius: 18, width: "100%", maxWidth: 520, boxShadow: "0 28px 72px rgba(0,0,0,0.18)", overflow: "hidden", maxHeight: "92vh", overflowY: "auto" }}>
        {/* Header */}
        <div style={{ background: "linear-gradient(135deg,#0a2a5e,#1557b0)", padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 17, fontWeight: 700, color: "#fff" }}>Bank Payment File</span>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2, fontFamily: FONT }}>
              {monthLabel} · {code} · for payment processing
            </div>
          </div>
          <button onClick={onClose} disabled={saving} style={{ width: 30, height: 30, background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div style={{ padding: 24 }}>
          {activeFilters.length > 0 && (
            <IssueBox tone="amber" title="Filters are active — the file will be partial">
              Only employees matching: {activeFilters.join(" · ")}. Clear the filters first if you want everyone in one file.
            </IssueBox>
          )}

          {loading && (
            <div style={{ padding: "28px 0", textAlign: "center", fontSize: 13, color: "#64748b", fontFamily: FONT }}>
              Preparing payments…
            </div>
          )}
          {error && <IssueBox tone="red" title="Something went wrong">{error}</IssueBox>}

          {preview && (
            <>
              {/* Summary tiles */}
              <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1, background: "#eff6ff", borderRadius: 12, padding: "12px 14px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.7, fontFamily: FONT }}>Payments</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#1557b0", fontFamily: FONT }}>{preview.lines.length}</div>
                </div>
                <div style={{ flex: 2, background: "#eff6ff", borderRadius: 12, padding: "12px 14px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.7, fontFamily: FONT }}>Total to pay</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#1557b0", fontFamily: FONT }}>{money(total)}</div>
                </div>
              </div>

              {preview.skipped.length > 0 && (
                <IssueBox tone="red" title={`${preview.skipped.length} left out of the file`}>
                  {preview.skipped.map((s, i) => (
                    <div key={i}>{s.name} — {s.reason}</div>
                  ))}
                </IssueBox>
              )}

              {preview.noSwift.length > 0 && (
                <IssueBox tone="amber" title={`${preview.noSwift.length} with no SWIFT code on record (BranchCode will be blank)`}>
                  {preview.noSwift.map((s, i) => (
                    <div key={i}>{s.name} — “{s.bank}”</div>
                  ))}
                </IssueBox>
              )}

              {preview.lines.length === 0 && !error && (
                <IssueBox tone="red" title="Nothing to export">
                  No employees have a payable amount and a {isZig ? "ZiG" : "USD"} bank account on file for {monthLabel}.
                </IssueBox>
              )}

              {/* Inputs */}
              <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                <div style={{ flex: 2 }}>
                  <label style={labelStyle}>Pay date</label>
                  <input type="date" style={fieldStyle} value={payDate} onChange={e => setPayDate(e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Batch no.</label>
                  <input type="number" min="1" step="1" style={fieldStyle} value={batch} onChange={e => setBatch(e.target.value)} />
                </div>
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 10, fontFamily: FONT, lineHeight: 1.5 }}>
                Paid from {PAYMENT_FILE_CONFIG.remitterName} · account {PAYMENT_FILE_CONFIG.remitterAccounts[currency]} · narration “{PAYMENT_FILE_CONFIG.narration}”
              </div>
            </>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
            <button onClick={onClose} disabled={saving} style={{ padding: "10px 22px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#f1f5f9", color: "#0f172a", fontFamily: FONT, fontSize: 14, fontWeight: 500, cursor: "pointer" }}>Cancel</button>
            <button
              onClick={handleDownload}
              disabled={!canDownload}
              style={{ padding: "10px 22px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#0a2a5e,#1557b0)", color: "#fff", fontFamily: FONT, fontSize: 14, fontWeight: 600, cursor: canDownload ? "pointer" : "not-allowed", opacity: canDownload ? 1 : 0.5 }}
            >
              {saving ? "Creating…" : "Download Excel"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}