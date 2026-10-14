// src/components/HRPortal/SplitSalaryModal.jsx
//
// "Split Salary" dialog for the Payroll page. HR enters the % to pay in USD;
// the rest is paid in ZiG automatically at the rate entered. Every employee's
// final pay (after deductions/bonus) is split, and two bank-format Excel
// files are produced: one USD file, one ZWG file (same layout, SWIFT codes).

import { useState, useEffect, useMemo } from "react";
import { buildPaymentLines, downloadPaymentSchedule, PAYMENT_FILE_CONFIG } from "../../utils/paymentSchedule";

const FONT = "'DM Sans',sans-serif";
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

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
      <div style={{ fontSize: 12, color: t.text, fontFamily: FONT, lineHeight: 1.55, maxHeight: 100, overflowY: "auto" }}>{children}</div>
    </div>
  );
}

function InfoBox({ children }) {
  return (
    <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: "#1e40af", fontFamily: FONT, lineHeight: 1.55 }}>
      {children}
    </div>
  );
}

function Tile({ label, count, total, accent }) {
  return (
    <div style={{ flex: 1, background: "#eff6ff", borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.7, fontFamily: FONT }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 700, color: accent, fontFamily: FONT, marginTop: 2 }}>{total}</div>
      <div style={{ fontSize: 11, color: "#64748b", fontFamily: FONT }}>{count} payment{count === 1 ? "" : "s"}</div>
    </div>
  );
}

export default function SplitSalaryModal({
  monthName, monthLabel, isPastMonth, zigRate, activeFilters, loadRows, onSaveRate, onClose, showToast,
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [rows, setRows]       = useState(null);
  const [usdPct, setUsdPct]   = useState("70");
  const [rate, setRate]       = useState(zigRate ? String(zigRate) : "");
  const [usdDate, setUsdDate] = useState(todayISO());
  const [zigDate, setZigDate] = useState(todayISO());
  const [batch, setBatch]     = useState("1");
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await loadRows();
        if (!cancelled) setRows(r);
      } catch {
        if (!cancelled) setError("Could not load payroll data. Please close this and try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pct     = parseFloat(usdPct);
  const pctOk   = Number.isFinite(pct) && pct >= 0 && pct <= 100;
  const zigPct  = pctOk ? round2(100 - pct) : null;
  const rateNum = parseFloat(rate);
  const rateOk  = rateNum > 0;
  const needsRate = pctOk && zigPct > 0;
  const ready   = rows && pctOk && (!needsRate || rateOk);

  // The split itself. For each employee:
  //   USD part  = final pay × USD %            (rounded to cents)
  //   ZiG part  = (final pay − USD part) × rate (so USD + ZiG-in-USD always = final pay)
  const result = useMemo(() => {
    if (!ready) return null;
    const usdRows = [];
    const zigRows = [];
    rows.forEach((r) => {
      const usdAmt   = round2(r.finalPayUSD * pct / 100);
      const zigUsdEq = round2(r.finalPayUSD - usdAmt);
      const zigAmt   = round2(zigUsdEq * (rateOk ? rateNum : 0));
      usdRows.push({ fullName: r.fullName, bankName: r.bankNameUsd, bankAccount: r.bankAccountUsd, finalPay: usdAmt });
      zigRows.push({ fullName: r.fullName, bankName: r.bankNameZig, bankAccount: r.bankAccountZig, finalPay: zigAmt });
    });
    const usd = pct > 0     ? buildPaymentLines(usdRows, "USD") : null;
    const zig = zigPct > 0  ? buildPaymentLines(zigRows, "ZIG") : null;
    const sum = (x) => (x ? round2(x.lines.reduce((s, l) => s + l.amount, 0)) : 0);
    return { usd, zig, usdTotal: sum(usd), zigTotal: sum(zig) };
  }, [ready, rows, pct, zigPct, rateNum, rateOk]);

  const fmt = (n, zig) =>
    `${zig ? "ZiG " : "$"}${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const batchNum = Math.max(1, parseInt(batch, 10) || 1);
  const hasUsd = !!(result?.usd && result.usd.lines.length);
  const hasZig = !!(result?.zig && result.zig.lines.length);
  const canDownload = !saving && (hasUsd || hasZig) && (!hasUsd || usdDate) && (!hasZig || zigDate);

  const fileName = (zig) =>
    `Jecca_${monthName}_${zig ? "ZWG_" : ""}Salary_Schedule${batchNum > 1 ? `_Batch${batchNum}` : ""}.xlsx`;

  const makeUsd = () => downloadPaymentSchedule({ lines: result.usd.lines, currency: "USD", payDate: usdDate, batch: batchNum, filename: fileName(false) });
  const makeZig = () => downloadPaymentSchedule({ lines: result.zig.lines, currency: "ZIG", payDate: zigDate, batch: batchNum, filename: fileName(true) });

  const run = async (which) => {
    if (!canDownload) return;
    setSaving(true);
    try {
      if (needsRate) onSaveRate?.(String(rateNum));   // remember this month's rate
      if (which === "usd" || which === "both") if (hasUsd) await makeUsd();
      // browsers handle two downloads better with a short gap between them
      if (which === "both" && hasUsd && hasZig) await new Promise((r) => setTimeout(r, 600));
      if (which === "zig" || which === "both") if (hasZig) await makeZig();
      showToast?.(which === "both" ? "USD and ZWG payment files downloaded." : "Payment file downloaded.");
      setSaving(false);
    } catch {
      showToast?.("Failed to create the payment file.", "err");
      setSaving(false);
    }
  };

  const allSkipped = result
    ? [
        ...(result.usd ? result.usd.skipped.map((s) => ({ ...s, file: "USD" })) : []),
        ...(result.zig ? result.zig.skipped.map((s) => ({ ...s, file: "ZWG" })) : []),
      ]
    : [];
  const allNoSwift = result
    ? [...(result.usd?.noSwift || []), ...(result.zig?.noSwift || [])]
    : [];
  const noSwiftUnique = allNoSwift.filter((x, i, a) => a.findIndex((y) => y.name === x.name && y.bank === x.bank) === i);

  const btn = (primary, enabled) => ({
    padding: "10px 18px", borderRadius: 10, fontFamily: FONT, fontSize: 13.5, fontWeight: 600,
    cursor: enabled ? "pointer" : "not-allowed", opacity: enabled ? 1 : 0.5,
    ...(primary
      ? { border: "none", background: "linear-gradient(135deg,#0a2a5e,#1557b0)", color: "#fff" }
      : { border: "1.5px solid #1557b0", background: "#fff", color: "#1557b0" }),
  });

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(10,26,80,0.52)", zIndex: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={(e) => e.target === e.currentTarget && !saving && onClose()}
    >
      <div className="pr-modal" style={{ background: "#fff", borderRadius: 18, width: "100%", maxWidth: 560, boxShadow: "0 28px 72px rgba(0,0,0,0.18)", overflow: "hidden", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ background: "linear-gradient(135deg,#0a2a5e,#1557b0)", padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 17, fontWeight: 700, color: "#fff" }}>Split Salary</span>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2, fontFamily: FONT }}>
              {monthLabel} · pay part in USD, the rest in ZiG
            </div>
          </div>
          <button onClick={onClose} disabled={saving} style={{ width: 30, height: 30, background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div style={{ padding: 24 }}>
          {activeFilters.length > 0 && (
            <IssueBox tone="amber" title="Filters are active — the files will be partial">
              Only employees matching: {activeFilters.join(" · ")}. Clear the filters first if you want everyone.
            </IssueBox>
          )}
          {isPastMonth && (
            <InfoBox>
              You're viewing <b>{monthLabel}</b>, a previous month. The totals below show what would be paid if that month's payroll were split this way. Downloading is optional, and a rate you type here won't replace that month's saved rate.
            </InfoBox>
          )}
          {loading && <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, color: "#64748b", fontFamily: FONT }}>Loading payroll…</div>}
          {error && <IssueBox tone="red" title="Something went wrong">{error}</IssueBox>}

          {rows && (
            <>
              {/* Step 1: percentage */}
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Pay in USD (%)</label>
                  <input type="number" min="0" max="100" step="any" style={fieldStyle} value={usdPct} onChange={(e) => setUsdPct(e.target.value)} placeholder="e.g. 70" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Pay in ZiG (%) — automatic</label>
                  <input style={{ ...fieldStyle, background: "#f1f5f9", color: "#475569" }} value={zigPct === null ? "" : zigPct} readOnly tabIndex={-1} />
                </div>
              </div>
              {!pctOk && usdPct !== "" && (
                <div style={{ fontSize: 12, color: "#b91c1c", marginTop: 6, fontFamily: FONT }}>Enter a percentage between 0 and 100.</div>
              )}

              {/* Step 2: rate (only needed when something is paid in ZiG) */}
              {needsRate && (
                <div style={{ marginTop: 14 }}>
                  <label style={labelStyle}>ZiG rate (1 USD = ? ZiG)</label>
                  <input type="number" min="0" step="any" style={fieldStyle} value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Enter today's rate" />
                </div>
              )}

              {/* Step 3: results */}
              {result && (
                <>
                  <div style={{ display: "flex", gap: 12, margin: "18px 0 14px" }}>
                    {result.usd && <Tile label={`USD file · ${pct}%`} count={result.usd.lines.length} total={fmt(result.usdTotal, false)} accent="#1557b0" />}
                    {result.zig && <Tile label={`ZWG file · ${zigPct}%`} count={result.zig.lines.length} total={fmt(result.zigTotal, true)} accent="#0f766e" />}
                  </div>

                  {allSkipped.length > 0 && (
                    <IssueBox tone="red" title={`${allSkipped.length} left out of a file`}>
                      {allSkipped.map((s, i) => <div key={i}>{s.name} — {s.reason} ({s.file} file)</div>)}
                    </IssueBox>
                  )}
                  {noSwiftUnique.length > 0 && (
                    <IssueBox tone="amber" title={`${noSwiftUnique.length} with no SWIFT code on record (BranchCode will be blank)`}>
                      {noSwiftUnique.map((s, i) => <div key={i}>{s.name} — “{s.bank}”</div>)}
                    </IssueBox>
                  )}

                  <div style={{ display: "flex", gap: 12 }}>
                    {hasUsd && (
                      <div style={{ flex: 1 }}>
                        <label style={labelStyle}>USD pay date</label>
                        <input type="date" style={fieldStyle} value={usdDate} onChange={(e) => setUsdDate(e.target.value)} />
                      </div>
                    )}
                    {hasZig && (
                      <div style={{ flex: 1 }}>
                        <label style={labelStyle}>ZWG pay date</label>
                        <input type="date" style={fieldStyle} value={zigDate} onChange={(e) => setZigDate(e.target.value)} />
                      </div>
                    )}
                    <div style={{ width: 90 }}>
                      <label style={labelStyle}>Batch no.</label>
                      <input type="number" min="1" step="1" style={fieldStyle} value={batch} onChange={(e) => setBatch(e.target.value)} />
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 10, fontFamily: FONT, lineHeight: 1.5 }}>
                    Paid from {PAYMENT_FILE_CONFIG.remitterName} · narration “{PAYMENT_FILE_CONFIG.narration}”. Each ZiG amount is the part left after the USD share, × the rate.
                  </div>
                </>
              )}
            </>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 10, marginTop: 22 }}>
            <button onClick={onClose} disabled={saving} style={{ padding: "10px 18px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#f1f5f9", color: "#0f172a", fontFamily: FONT, fontSize: 13.5, fontWeight: 500, cursor: "pointer" }}>Cancel</button>
            {hasUsd && hasZig && (
              <>
                <button onClick={() => run("usd")} disabled={!canDownload} style={btn(false, canDownload)}>USD file</button>
                <button onClick={() => run("zig")} disabled={!canDownload} style={btn(false, canDownload)}>ZWG file</button>
              </>
            )}
            <button onClick={() => run("both")} disabled={!canDownload} style={btn(true, canDownload)}>
              {saving ? "Creating…" : hasUsd && hasZig ? "Download both" : hasUsd ? "Download USD file" : "Download ZWG file"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}