// src/components/MDPortal/PayrollPage.jsx
//
// Payroll overview page for the MD Portal — READ-ONLY view.
// UPDATED: Full mobile responsiveness (phones, tablets, desktop).

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { apiFetch } from "../../utils/auth";
import { useMDPortal } from "../../context/MDPortalContext";

const API = `${import.meta.env.VITE_API_BASE_URL}/api`;

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  navy:      "#0a2a5e",
  mid:       "#1557b0",
  light:     "#1a6fd4",
  accent:    "#7fb3e8",
  bg:        "#f8faff",
  card:      "#ffffff",
  border:    "#e2e8f0",
  text:      "#0f172a",
  muted:     "#64748b",
  dim:       "#94a3b8",
  green:     "#16a34a",
  greenBg:   "#dcfce7",
  amber:     "#d97706",
  amberBg:   "#fef3c7",
  red:       "#dc2626",
  redBg:     "#fee2e2",
  violet:    "#7c3aed",
  violetBg:  "#f5f3ff",
  teal:      "#0891b2",
  tealBg:    "#e0f2fe",
  gold:      "#b45309",
  goldBg:    "#fef9c3",
};

// ─── Zimbabwe public holidays ─────────────────────────────────────────────────
const ZW_HOLIDAYS_MMDD = [
  "01-01","02-21","04-18","05-01","05-25",
  "08-11","08-12","12-22","12-25","12-26",
];
function getZwHolidays(year, month) {
  const set = new Set();
  ZW_HOLIDAYS_MMDD.forEach(mmdd => {
    const [m, d] = mmdd.split("-").map(Number);
    if (m - 1 === month) {
      const dt = new Date(year, month, d);
      if (dt.getDay() !== 0 && dt.getDay() !== 6)
        set.add(`${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`);
    }
  });
  const a=year%19,b=Math.floor(year/100),c=year%100;
  const d2=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25);
  const g=Math.floor((b-f+1)/3),h=(19*a+b-d2-g+15)%30;
  const i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7;
  const m2=Math.floor((a+11*h+22*l)/451);
  const em=Math.floor((h+l-7*m2+114)/31)-1;
  const ed=((h+l-7*m2+114)%31)+1;
  [new Date(year,em,ed-2), new Date(year,em,ed+1)].forEach(dt => {
    if (dt.getMonth()===month && dt.getDay()!==0 && dt.getDay()!==6) {
      set.add(`${year}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`);
    }
  });
  return set;
}
function workingDaysInMonth(year, month) {
  const holidays = getZwHolidays(year, month);
  const end = new Date(year, month+1, 0).getDate();
  let c = 0;
  for (let d = 1; d <= end; d++) {
    const dt = new Date(year, month, d);
    const key = `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    if (dt.getDay()!==0 && dt.getDay()!==6 && !holidays.has(key)) c++;
  }
  return c;
}

// ─── Format helpers ───────────────────────────────────────────────────────────
const fmtUSD = (n) => {
  if (n == null || isNaN(n)) return "—";
  return `$${Number(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
};
const fmtZIG = (n, rate) => {
  if (n == null || isNaN(n) || !rate) return null;
  const v = Number(n) * parseFloat(rate);
  return `ZiG ${v.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
};

// ─── Spinner ──────────────────────────────────────────────────────────────────
function Spinner({ size=26 }) {
  return (
    <div style={{width:size,height:size,border:"3px solid #e8edf8",borderTopColor:C.mid,borderRadius:"50%",animation:"pr-spin .75s linear infinite",flexShrink:0}} />
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ emp, size=38 }) {
  const name = emp.full_name || [emp.first_name,emp.last_name].filter(Boolean).join(" ") || "?";
  const letters = name.split(" ").filter(Boolean).slice(0,2).map(w=>w[0]).join("").toUpperCase();
  const src = emp.profile_picture || emp.photo || emp.avatar;
  return (
    <div style={{width:size,height:size,borderRadius:10,overflow:"hidden",flexShrink:0,background:"linear-gradient(135deg,#0e3d82,#1a6fd4)",display:"flex",alignItems:"center",justifyContent:"center",border:"2px solid #eff6ff"}}>
      {src
        ? <img src={src} alt={name} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>e.target.style.display="none"} />
        : <span style={{fontSize:size*0.35,fontWeight:700,color:"#fff",fontFamily:"'DM Sans',sans-serif"}}>{letters}</span>
      }
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, subColor, color, bg, icon, loading }) {
  return (
    <div style={{flex:"1 1 140px",minWidth:130,background:bg,borderRadius:14,padding:"14px 16px",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",right:12,top:12,fontSize:20,opacity:0.18}}>{icon}</div>
      <div style={{fontSize:9,fontWeight:700,color,letterSpacing:"0.9px",textTransform:"uppercase",fontFamily:"'DM Sans',sans-serif",opacity:0.7,marginBottom:4}}>{label}</div>
      {loading
        ? <div style={{height:26,width:70,background:"rgba(0,0,0,0.07)",borderRadius:6,animation:"pr-pulse 1.2s ease infinite"}} />
        : <div style={{fontSize:20,fontWeight:700,color,fontFamily:"'Playfair Display',serif",lineHeight:1.1,wordBreak:"break-word"}}>{value}</div>
      }
      {sub && !loading && (
        <div style={{fontSize:10,color:subColor||color,opacity:0.75,marginTop:4,fontFamily:"'DM Sans',sans-serif",wordBreak:"break-word"}}>{sub}</div>
      )}
    </div>
  );
}

// ─── Month Calendar Picker ────────────────────────────────────────────────────
function MonthPicker({ year, month, onChange, maxYear, maxMonth }) {
  const [open, setOpen] = useState(false);
  const [vy, setVy]     = useState(year);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  useEffect(() => { setVy(year); }, [year]);

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const isDisabled = (m) => vy > maxYear || (vy === maxYear && m > maxMonth);
  const isCurrent  = (m) => vy === year && m === month;

  return (
    <div ref={ref} style={{position:"relative",flexShrink:0}}>
      <button
        onClick={() => setOpen(o=>!o)}
        title="Jump to month"
        style={{height:36,width:36,borderRadius:9,border:`1.5px solid ${open?C.mid:C.border}`,background:open?"#eff6ff":"#fff",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:open?C.mid:C.muted,transition:"all .15s",flexShrink:0,touchAction:"manipulation"}}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      </button>
      {open && (
        <div style={{position:"fixed",top:"auto",right:8,zIndex:9999,background:"#fff",borderRadius:14,border:`1.5px solid ${C.border}`,boxShadow:"0 8px 40px rgba(10,42,94,0.18)",padding:"14px",width:"min(260px, calc(100vw - 24px))",animation:"pr-fadeIn .15s ease"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <button onClick={()=>setVy(y=>y-1)} style={{width:32,height:32,borderRadius:7,border:`1px solid ${C.border}`,background:"#f8faff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:C.muted,touchAction:"manipulation"}}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span style={{fontSize:14,fontWeight:700,color:C.navy,fontFamily:"'DM Sans',sans-serif"}}>{vy}</span>
            <button onClick={()=>{ if(vy<maxYear) setVy(y=>y+1); }} disabled={vy>=maxYear} style={{width:32,height:32,borderRadius:7,border:`1px solid ${C.border}`,background:"#f8faff",cursor:vy>=maxYear?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:vy>=maxYear?C.dim:C.muted,touchAction:"manipulation"}}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5}}>
            {MONTHS.map((ml,mi) => {
              const dis = isDisabled(mi);
              const sel = isCurrent(mi);
              return (
                <button key={mi} disabled={dis} onClick={()=>{ onChange(vy,mi); setOpen(false); }}
                  style={{padding:"9px 4px",borderRadius:8,border:"none",background:sel?C.mid:"transparent",color:dis?"#cbd5e1":sel?"#fff":C.text,fontSize:13,fontWeight:sel?700:400,fontFamily:"'DM Sans',sans-serif",cursor:dis?"not-allowed":"pointer",touchAction:"manipulation"}}
                >{ml}</button>
              );
            })}
          </div>
          <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"flex-end"}}>
            <button onClick={()=>{onChange(new Date().getFullYear(),new Date().getMonth());setOpen(false);}}
              style={{fontSize:12,fontWeight:600,color:C.mid,fontFamily:"'DM Sans',sans-serif",background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:7,padding:"6px 12px",cursor:"pointer",touchAction:"manipulation"}}>
              This month
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ZiG Badge ────────────────────────────────────────────────────────────────
function ZigBadge({ usdAmount, rate, small }) {
  const zig = fmtZIG(usdAmount, rate);
  if (!zig) return null;
  return (
    <span style={{display:"inline-block",fontSize:small?9:10,fontWeight:600,color:C.gold,background:C.goldBg,borderRadius:20,padding:small?"1px 6px":"2px 8px",border:"1px solid #fde68a",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap",marginTop:2}}>
      {zig}
    </span>
  );
}

// ─── Employee History Detail View ─────────────────────────────────────────────
function EmployeeHistoryView({ emp, payrollRecord, allAttendance, onBack, zigRate }) {
  const name = emp.full_name || [emp.first_name,emp.last_name].filter(Boolean).join(" ") || "—";
  const basicSalary = parseFloat(payrollRecord?.basic_salary) || 0;

  const months = useMemo(() => {
    const empAtt = (allAttendance||[]).filter(r => r.employee === emp.id);
    const byMonth = {};
    empAtt.forEach(r => {
      if (!r.date) return;
      const key = r.date.slice(0,7);
      if (!byMonth[key]) byMonth[key] = [];
      byMonth[key].push(r);
    });
    return Object.entries(byMonth)
      .sort((a,b) => b[0].localeCompare(a[0]))
      .map(([key, recs]) => {
        const [y,m] = key.split("-").map(Number);
        const wd = workingDaysInMonth(y, m-1);
        const present = recs.filter(r => ["present","late","half_day"].includes(r.status)).length;
        const halfDays = recs.filter(r => r.status==="half_day").length;
        const effectiveDays = present - halfDays*0.5;
        const deductionRec = recs.find(r => r.deduction_amount) || null;
        const deduction = parseFloat(deductionRec?.deduction_amount)||0;
        let lsDeduction = 0;
        try {
          const lsKey = `payroll_${emp.id}_${y}_${String(m).padStart(2,"0")}`;
          const stored = localStorage.getItem(lsKey);
          if (stored) { const p = JSON.parse(stored); lsDeduction = parseFloat(p.deduction)||0; }
        } catch {}
        const totalDeduction = deduction || lsDeduction;
        const netSalary = wd > 0 ? (basicSalary / wd) * effectiveDays - totalDeduction : 0;
        const label = new Date(y, m-1, 1).toLocaleString("default",{month:"long",year:"numeric"});
        return { key, label, y, m: m-1, wd, present, halfDays, effectiveDays, netSalary, totalDeduction, basicSalary };
      });
  }, [allAttendance, emp.id, basicSalary]);

  const totalEarned = months.reduce((s,mo) => s + Math.max(0, mo.netSalary), 0);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16,animation:"pr-fadeIn .25s ease"}}>
      {/* Back */}
      <button onClick={onBack}
        style={{display:"inline-flex",alignItems:"center",gap:8,background:"none",border:`1.5px solid ${C.border}`,borderRadius:9,padding:"10px 16px",fontSize:13,color:C.muted,fontFamily:"'DM Sans',sans-serif",fontWeight:500,cursor:"pointer",alignSelf:"flex-start",touchAction:"manipulation",minHeight:44}}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        Back to Payroll
      </button>

      {/* Profile card */}
      <div style={{background:C.card,borderRadius:16,border:`1px solid ${C.border}`,boxShadow:"0 1px 6px rgba(0,0,0,0.05)",padding:"18px 16px",display:"flex",flexDirection:"column",gap:16}}>
        {/* Top: avatar + name + summary */}
        <div style={{display:"flex",alignItems:"flex-start",gap:14,flexWrap:"wrap"}}>
          <Avatar emp={emp} size={56} />
          <div style={{flex:1,minWidth:160}}>
            <h2 style={{margin:"0 0 2px",fontSize:18,fontWeight:700,color:C.navy,fontFamily:"'Playfair Display',serif",lineHeight:1.2}}>{name}</h2>
            {emp.employee_number && <div style={{fontSize:11,color:C.dim,fontFamily:"'DM Sans',sans-serif",marginBottom:4}}>#{emp.employee_number}</div>}
            <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
              {emp.job_title && <span style={{fontSize:12,color:C.muted,fontFamily:"'DM Sans',sans-serif"}}>{emp.job_title}</span>}
              {emp.department_name && <span style={{fontSize:12,color:C.dim,fontFamily:"'DM Sans',sans-serif"}}>· {emp.department_name}</span>}
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <div style={{flex:"1 1 130px",background:"#f8faff",borderRadius:10,border:`1px solid ${C.border}`,padding:"12px 14px"}}>
            <div style={{fontSize:9,color:C.dim,fontWeight:700,letterSpacing:"0.8px",textTransform:"uppercase",fontFamily:"'DM Sans',sans-serif",marginBottom:3}}>Basic Salary</div>
            <div style={{fontSize:18,fontWeight:700,color:C.navy,fontFamily:"'Playfair Display',serif"}}>{fmtUSD(basicSalary)}</div>
            {zigRate && <ZigBadge usdAmount={basicSalary} rate={zigRate} />}
          </div>
          <div style={{flex:"1 1 130px",background:"#f0fdf4",borderRadius:10,border:`1px solid #bbf7d0`,padding:"12px 14px"}}>
            <div style={{fontSize:9,color:C.dim,fontWeight:700,letterSpacing:"0.8px",textTransform:"uppercase",fontFamily:"'DM Sans',sans-serif",marginBottom:3}}>Total Earned</div>
            <div style={{fontSize:18,fontWeight:700,color:C.green,fontFamily:"'Playfair Display',serif"}}>{fmtUSD(totalEarned)}</div>
            {zigRate && <ZigBadge usdAmount={totalEarned} rate={zigRate} />}
            <div style={{fontSize:10,color:C.dim,fontFamily:"'DM Sans',sans-serif",marginTop:2}}>{months.length} month{months.length!==1?"s":""} on record</div>
          </div>
        </div>
      </div>

      {/* History */}
      <div style={{background:C.card,borderRadius:16,border:`1px solid ${C.border}`,boxShadow:"0 1px 6px rgba(0,0,0,0.05)",overflow:"hidden"}}>
        <div style={{padding:"14px 16px",borderBottom:`1px solid ${C.border}`,background:"#fafbff"}}>
          <div style={{fontSize:13,fontWeight:700,color:C.navy,fontFamily:"'DM Sans',sans-serif"}}>Salary History</div>
          <div style={{fontSize:11,color:C.dim,fontFamily:"'DM Sans',sans-serif",marginTop:1}}>{months.length} months on record</div>
        </div>

        {months.length === 0 ? (
          <div style={{textAlign:"center",padding:"40px 24px",color:C.dim,fontFamily:"'DM Sans',sans-serif"}}>
            <div style={{fontSize:32,marginBottom:8}}>📋</div>
            <div style={{fontSize:14,fontWeight:600,color:C.muted}}>No payroll records found</div>
          </div>
        ) : (
          <>
            {/* Desktop table — hidden on small screens */}
            <div className="pr-hist-table">
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontFamily:"'DM Sans',sans-serif"}}>
                  <thead>
                    <tr style={{background:"#fafbff",borderBottom:`1.5px solid ${C.border}`}}>
                      {["Month","Working Days","Days Attended","Basic Salary","Deduction","Net Salary"].map(h => (
                        <th key={h} style={{padding:"10px 16px",textAlign:"left",fontSize:10,fontWeight:700,color:C.muted,letterSpacing:"0.8px",textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {months.map(mo => {
                      const net = Math.max(0, mo.netSalary);
                      return (
                        <tr key={mo.key} style={{borderBottom:"1px solid #f1f5f9"}}>
                          <td style={{padding:"11px 16px",fontSize:13,fontWeight:600,color:C.navy,fontFamily:"'DM Sans',sans-serif"}}>{mo.label}</td>
                          <td style={{padding:"11px 16px",fontSize:13,color:C.text,fontFamily:"'DM Sans',sans-serif"}}>{mo.wd}</td>
                          <td style={{padding:"11px 16px"}}>
                            <span style={{fontSize:13,fontWeight:600,color:mo.present>=mo.wd*0.9?C.green:mo.present>=mo.wd*0.7?C.amber:C.red,fontFamily:"'DM Sans',sans-serif"}}>{mo.present}</span>
                            <span style={{fontSize:12,color:C.dim}}>/{mo.wd}</span>
                            {mo.halfDays > 0 && <span style={{fontSize:10,color:C.teal,background:C.tealBg,borderRadius:20,padding:"1px 6px",marginLeft:6,fontWeight:600}}>½×{mo.halfDays}</span>}
                          </td>
                          <td style={{padding:"11px 16px"}}>
                            <div style={{fontSize:13,fontWeight:600,color:C.navy,fontFamily:"'Playfair Display',serif"}}>{fmtUSD(mo.basicSalary)}</div>
                            {zigRate && <ZigBadge usdAmount={mo.basicSalary} rate={zigRate} small />}
                          </td>
                          <td style={{padding:"11px 16px"}}>
                            {mo.totalDeduction > 0
                              ? <div><div style={{fontSize:13,color:C.red,fontWeight:600}}>−{fmtUSD(mo.totalDeduction)}</div>{zigRate && <ZigBadge usdAmount={mo.totalDeduction} rate={zigRate} small />}</div>
                              : <span style={{fontSize:12,color:C.dim}}>—</span>}
                          </td>
                          <td style={{padding:"11px 16px"}}>
                            <div style={{fontSize:14,fontWeight:700,color:net>0?C.green:C.dim,fontFamily:"'Playfair Display',serif"}}>{net>0?fmtUSD(net):"—"}</div>
                            {zigRate && net>0 && <ZigBadge usdAmount={net} rate={zigRate} small />}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{background:"#fafbff",borderTop:`2px solid ${C.border}`}}>
                      <td colSpan={5} style={{padding:"11px 16px",fontSize:11,fontWeight:700,color:C.muted,fontFamily:"'DM Sans',sans-serif",textAlign:"right",textTransform:"uppercase"}}>Total Earned</td>
                      <td style={{padding:"11px 16px"}}>
                        <div style={{fontSize:14,fontWeight:700,color:C.green,fontFamily:"'Playfair Display',serif"}}>{fmtUSD(totalEarned)}</div>
                        {zigRate && <ZigBadge usdAmount={totalEarned} rate={zigRate} small />}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Mobile cards — shown only on small screens */}
            <div className="pr-hist-cards">
              {months.map(mo => {
                const net = Math.max(0, mo.netSalary);
                return (
                  <div key={mo.key} style={{padding:"14px 16px",borderBottom:`1px solid ${C.border}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                      <div style={{fontSize:13,fontWeight:700,color:C.navy,fontFamily:"'DM Sans',sans-serif"}}>{mo.label}</div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:15,fontWeight:700,color:net>0?C.green:C.dim,fontFamily:"'Playfair Display',serif"}}>{net>0?fmtUSD(net):"—"}</div>
                        {zigRate && net>0 && <ZigBadge usdAmount={net} rate={zigRate} small />}
                      </div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                      <div style={{background:"#f8faff",borderRadius:8,padding:"8px 10px"}}>
                        <div style={{fontSize:9,color:C.dim,fontWeight:700,letterSpacing:"0.7px",textTransform:"uppercase",marginBottom:3}}>Attendance</div>
                        <span style={{fontSize:13,fontWeight:700,color:mo.present>=mo.wd*0.9?C.green:mo.present>=mo.wd*0.7?C.amber:C.red}}>{mo.present}</span>
                        <span style={{fontSize:12,color:C.dim}}>/{mo.wd} days</span>
                      </div>
                      <div style={{background:"#f8faff",borderRadius:8,padding:"8px 10px"}}>
                        <div style={{fontSize:9,color:C.dim,fontWeight:700,letterSpacing:"0.7px",textTransform:"uppercase",marginBottom:3}}>Basic Salary</div>
                        <div style={{fontSize:13,fontWeight:600,color:C.navy,fontFamily:"'Playfair Display',serif"}}>{fmtUSD(mo.basicSalary)}</div>
                      </div>
                      {mo.totalDeduction > 0 && (
                        <div style={{background:C.redBg,borderRadius:8,padding:"8px 10px",gridColumn:"1/-1"}}>
                          <div style={{fontSize:9,color:C.red,fontWeight:700,letterSpacing:"0.7px",textTransform:"uppercase",marginBottom:3}}>Deduction</div>
                          <div style={{fontSize:13,fontWeight:600,color:C.red}}>−{fmtUSD(mo.totalDeduction)}</div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div style={{padding:"12px 16px",borderTop:`2px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",background:"#fafbff"}}>
                <span style={{fontSize:11,fontWeight:700,color:C.muted,fontFamily:"'DM Sans',sans-serif",textTransform:"uppercase"}}>Total Earned</span>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:15,fontWeight:700,color:C.green,fontFamily:"'Playfair Display',serif"}}>{fmtUSD(totalEarned)}</div>
                  {zigRate && <ZigBadge usdAmount={totalEarned} rate={zigRate} small />}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PayrollPage() {
  const { employees, allAttendance, loading } = useMDPortal();

  const now = new Date();
  const [viewYear,  setViewYear]  = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const [payrolls,      setPayrolls]      = useState([]);
  const [payrollLoading, setPayrollLoading] = useState(true);
  const [monthAtt,    setMonthAtt]    = useState([]);
  const [attLoading,  setAttLoading]  = useState(true);
  const [zigRate, setZigRate] = useState("");
  const [search,   setSearch]   = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [selectedEmp, setSelectedEmp] = useState(null);

  useEffect(() => {
    apiFetch(`${API}/payroll/settings/`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.zig_rate) setZigRate(String(d.zig_rate));
        else if (d?.exchange_rate) setZigRate(String(d.exchange_rate));
      })
      .catch(() => {});
    try {
      const stored = localStorage.getItem("hr_zig_rate") || localStorage.getItem("zigRate");
      if (stored) setZigRate(stored);
    } catch {}
  }, []);

  useEffect(() => {
    setPayrollLoading(true);
    apiFetch(`${API}/payroll/`)
      .then(r => r.ok ? r.json() : [])
      .then(d => { setPayrolls(Array.isArray(d) ? d : (d.results||[])); setPayrollLoading(false); })
      .catch(() => { setPayrolls([]); setPayrollLoading(false); });
  }, []);

  useEffect(() => {
    setAttLoading(true);
    setMonthAtt([]);
    const monthStart = `${viewYear}-${String(viewMonth+1).padStart(2,"0")}-01`;
    const lastDay = new Date(viewYear, viewMonth+1, 0).getDate();
    const monthEnd = `${viewYear}-${String(viewMonth+1).padStart(2,"0")}-${String(lastDay).padStart(2,"0")}`;
    apiFetch(`${API}/attendance/?date_after=${monthStart}&date_before=${monthEnd}&page_size=5000`)
      .then(r => r.ok ? r.json() : [])
      .then(d => { setMonthAtt(Array.isArray(d) ? d : (d.results||[])); setAttLoading(false); })
      .catch(() => { setMonthAtt([]); setAttLoading(false); });
  }, [viewYear, viewMonth]);

  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth();
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleString("default",{month:"long",year:"numeric"});
  const wdInMonth = useMemo(() => workingDaysInMonth(viewYear, viewMonth), [viewYear, viewMonth]);

  const payrollMap = useMemo(() => {
    const m = {};
    payrolls.forEach(p => { m[p.employee] = p; });
    return m;
  }, [payrolls]);

  const attMap = useMemo(() => {
    const m = {};
    monthAtt.forEach(r => {
      if (!m[r.employee]) m[r.employee] = { present: 0, halfDays: 0 };
      if (["present","late","half_day"].includes(r.status)) m[r.employee].present++;
      if (r.status === "half_day") m[r.employee].halfDays++;
    });
    return m;
  }, [monthAtt]);

  const deptOptions = useMemo(() => {
    const s = new Set();
    (employees||[]).forEach(e => { if (e.department_name) s.add(e.department_name); });
    return [...s].sort();
  }, [employees]);

  const allRows = useMemo(() => {
    if (!employees) return [];
    return employees
      .filter(e => e.status === "employed")
      .map(emp => {
        const pr        = payrollMap[emp.id];
        const basic     = parseFloat(pr?.basic_salary) || 0;
        const attRec    = attMap[emp.id] || { present: 0, halfDays: 0 };
        const effective = attRec.present - attRec.halfDays * 0.5;
        let deduction = 0, bonus = 0;
        try {
          const lsKey = `payroll_${emp.id}_${viewYear}_${String(viewMonth+1).padStart(2,"0")}`;
          const stored = localStorage.getItem(lsKey);
          if (stored) { const p = JSON.parse(stored); deduction = parseFloat(p.deduction)||0; bonus = parseFloat(p.bonus)||0; }
        } catch {}
        const prorated  = wdInMonth > 0 ? (basic / wdInMonth) * effective : 0;
        const net       = Math.max(0, prorated - deduction + bonus);
        return { emp, pr, basic, attRec, effective, deduction, bonus, prorated, net };
      });
  }, [employees, payrollMap, attMap, viewYear, viewMonth, wdInMonth]);

  const rows = useMemo(() => {
    let list = allRows;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(({ emp }) => {
        const n = (emp.full_name||[emp.first_name,emp.last_name].filter(Boolean).join(" ")).toLowerCase();
        return n.includes(q);
      });
    }
    if (deptFilter) {
      list = list.filter(({ emp }) => emp.department_name === deptFilter);
    }
    return list;
  }, [allRows, search, deptFilter]);

  const totalPayableMonth = useMemo(() => allRows.reduce((s,r) => s + r.net, 0), [allRows]);
  const totalDeductionsMonth = useMemo(() => allRows.reduce((s,r) => s + r.deduction, 0), [allRows]);

  const totalAllTime = useMemo(() => {
    if (!employees || !payrolls.length || !allAttendance) return null;
    const pmMap = {};
    payrolls.forEach(p => { pmMap[p.employee] = parseFloat(p.basic_salary)||0; });
    const empMonthMap = {};
    (allAttendance||[]).forEach(r => {
      if (!r.employee || !r.date) return;
      const key = `${r.employee}__${r.date.slice(0,7)}`;
      if (!empMonthMap[key]) empMonthMap[key] = { emp: r.employee, ym: r.date.slice(0,7), recs: [] };
      empMonthMap[key].recs.push(r);
    });
    let total = 0;
    Object.values(empMonthMap).forEach(({ emp: eid, ym, recs }) => {
      const [y,m] = ym.split("-").map(Number);
      const wd = workingDaysInMonth(y, m-1);
      const basic = pmMap[eid] || 0;
      const present = recs.filter(r=>["present","late","half_day"].includes(r.status)).length;
      const half = recs.filter(r=>r.status==="half_day").length;
      const effective = present - half*0.5;
      let ded = 0;
      try {
        const lsKey = `payroll_${eid}_${y}_${String(m).padStart(2,"0")}`;
        const stored = localStorage.getItem(lsKey);
        if (stored) { const p = JSON.parse(stored); ded = parseFloat(p.deduction)||0; }
      } catch {}
      const net = wd > 0 ? Math.max(0, (basic/wd)*effective - ded) : 0;
      total += net;
    });
    return total;
  }, [employees, payrolls, allAttendance]);

  const isLoading = payrollLoading || attLoading || loading.employees;
  const hasFilters = search.trim() || deptFilter;

  const goPrev = () => {
    if (viewMonth === 0) { setViewYear(y=>y-1); setViewMonth(11); }
    else setViewMonth(m=>m-1);
  };
  const goNext = () => {
    if (isCurrentMonth) return;
    if (viewMonth === 11) { setViewYear(y=>y+1); setViewMonth(0); }
    else setViewMonth(m=>m+1);
  };

  const openHistory = useCallback((emp) => {
    const pr = payrollMap[emp.id] || null;
    setSelectedEmp({ emp, pr });
  }, [payrollMap]);

  if (selectedEmp) {
    return (
      <>
        <style>{`
          @keyframes pr-spin{to{transform:rotate(360deg)}}
          @keyframes pr-fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
          @keyframes pr-pulse{0%,100%{opacity:1}50%{opacity:0.45}}
          /* History view: table on ≥600px, cards on <600px */
          .pr-hist-table{display:block}
          .pr-hist-cards{display:none}
          @media(max-width:600px){
            .pr-hist-table{display:none!important}
            .pr-hist-cards{display:block!important}
          }
        `}</style>
        <EmployeeHistoryView
          emp={selectedEmp.emp}
          payrollRecord={selectedEmp.pr}
          allAttendance={allAttendance}
          onBack={() => setSelectedEmp(null)}
          zigRate={zigRate}
        />
      </>
    );
  }

  return (
    <>
      <style>{`
        /* ── Keyframes ─────────────────────────────────────────────────────── */
        @keyframes pr-spin    { to { transform:rotate(360deg); } }
        @keyframes pr-fadeIn  { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
        @keyframes pr-pulse   { 0%,100%{opacity:1} 50%{opacity:.45} }

        /* ── Page shell ────────────────────────────────────────────────────── */
        .pr-page {
          display: flex;
          flex-direction: column;
          gap: 16px;
          animation: pr-fadeIn .3s ease;
          /* Prevent horizontal overflow on the whole page */
          max-width: 100%;
          overflow-x: hidden;
        }

        /* ── Focus styles ──────────────────────────────────────────────────── */
        .pr-search:focus  { outline:none; border-color:#1557b0!important; box-shadow:0 0 0 3px rgba(21,87,176,.1); }
        select:focus      { outline:none; border-color:#1557b0!important; box-shadow:0 0 0 3px rgba(21,87,176,.1); }

        /* ── Table row hover ───────────────────────────────────────────────── */
        .pr-row:hover { background:#f0f6ff!important; }

        /* ═══════════════════════════════════════════════════════════════════ */
        /*  MONTH NAVIGATOR                                                    */
        /* ═══════════════════════════════════════════════════════════════════ */
        .pr-nav-section {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .pr-month-label {
          padding: 8px 14px;
          border-radius: 9px;
          background: #f0f6ff;
          border: 1.5px solid #bfdbfe;
          font-size: 13px;
          font-weight: 600;
          color: #0a2a5e;
          font-family: 'DM Sans', sans-serif;
          text-align: center;
          white-space: nowrap;
          /* Shrink gracefully on very small screens */
          flex: 1 1 auto;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        /* Touch-friendly nav buttons */
        .pr-nav-btn {
          width: 36px;
          height: 36px;
          min-width: 36px;
          border-radius: 9px;
          border: 1.5px solid #e2e8f0;
          background: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: #64748b;
          transition: all .15s;
          flex-shrink: 0;
          touch-action: manipulation;
        }
        .pr-nav-btn:disabled { background:#f8faff; color:#cbd5e1; cursor:not-allowed; }

        /* ═══════════════════════════════════════════════════════════════════ */
        /*  HEADER / TITLE ROW                                                 */
        /* ═══════════════════════════════════════════════════════════════════ */
        .pr-header-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 14px;
        }

        /* ═══════════════════════════════════════════════════════════════════ */
        /*  STAT CARDS                                                         */
        /* ═══════════════════════════════════════════════════════════════════ */
        .pr-stats {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        /* On very small phones, make two cards per row */
        @media(max-width:480px) {
          .pr-stats > div { flex: 1 1 calc(50% - 5px) !important; min-width: 120px !important; }
        }

        /* ═══════════════════════════════════════════════════════════════════ */
        /*  FILTER ROW                                                         */
        /* ═══════════════════════════════════════════════════════════════════ */
        .pr-filter-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 14px;
          border-bottom: 1px solid #e2e8f0;
          background: #fafcff;
          flex-wrap: wrap;
        }
        .pr-filter-row .pr-search-wrap {
          flex: 1 1 160px;
          min-width: 140px;
          position: relative;
        }
        .pr-filter-row .pr-dept-wrap {
          flex: 1 1 140px;
          min-width: 130px;
          position: relative;
        }
        /* Stack filters vertically on small phones */
        @media(max-width:400px) {
          .pr-filter-row { flex-direction: column; align-items: stretch; }
          .pr-filter-row .pr-search-wrap,
          .pr-filter-row .pr-dept-wrap { flex: unset; width: 100%; min-width: unset; }
          .pr-filter-row select { width: 100%; }
        }

        /* ═══════════════════════════════════════════════════════════════════ */
        /*  MAIN TABLE  (visible ≥ 640px)                                      */
        /* ═══════════════════════════════════════════════════════════════════ */
        .pr-table-wrap { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .pr-table tr:last-child td { border-bottom: none; }

        /* ═══════════════════════════════════════════════════════════════════ */
        /*  MOBILE CARD LIST  (visible < 640px)                               */
        /* ═══════════════════════════════════════════════════════════════════ */
        .pr-mobile-list { display: none; flex-direction: column; }

        /* ── Breakpoint: hide table, show cards ──────────────────────────── */
        @media(max-width:640px) {
          .pr-table-wrap  { display: none !important; }
          .pr-mobile-list { display: flex !important; }
        }

        /* ── Medium tablets: allow horizontal scroll on table ────────────── */
        @media(max-width:900px) {
          .pr-table-wrap { -webkit-overflow-scrolling: touch; }
        }

        /* ═══════════════════════════════════════════════════════════════════ */
        /*  HISTORY VIEW                                                       */
        /* ═══════════════════════════════════════════════════════════════════ */
        .pr-hist-table { display: block; }
        .pr-hist-cards { display: none; }
        @media(max-width:600px){
          .pr-hist-table { display:none!important; }
          .pr-hist-cards { display:block!important; }
        }

        /* ═══════════════════════════════════════════════════════════════════ */
        /*  MISC TOUCH HELPERS                                                 */
        /* ═══════════════════════════════════════════════════════════════════ */
        /* All interactive elements: minimum 44×44 touch target */
        button { touch-action: manipulation; }
        input[type="text"] { -webkit-appearance: none; appearance: none; }
        select { -webkit-appearance: none; appearance: none; }
      `}</style>

      <div className="pr-page">

        {/* ── Header card ─────────────────────────────────────────────────── */}
        <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:"16px 14px",boxShadow:"0 1px 6px rgba(0,0,0,0.05)"}}>

          {/* Title + nav */}
          <div className="pr-header-row">
            <div>
              <h1 style={{margin:0,fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:C.navy}}>Payroll</h1>
              <div style={{fontSize:11.5,color:C.dim,fontFamily:"'DM Sans',sans-serif",marginTop:2}}>
                {wdInMonth} working days · {monthLabel}
              </div>
            </div>

            {/* Month navigator */}
            <div className="pr-nav-section">
              <button className="pr-nav-btn" onClick={goPrev} title="Previous month">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>

              <div className="pr-month-label">
                {isCurrentMonth ? "This month — " : ""}{monthLabel}
              </div>

              <button className="pr-nav-btn" onClick={goNext} disabled={isCurrentMonth} title="Next month">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>

              <MonthPicker year={viewYear} month={viewMonth} maxYear={now.getFullYear()} maxMonth={now.getMonth()}
                onChange={(y,m) => { setViewYear(y); setViewMonth(m); }} />

              {!isCurrentMonth && (
                <button onClick={()=>{setViewYear(now.getFullYear());setViewMonth(now.getMonth());}}
                  style={{padding:"8px 12px",borderRadius:9,border:"1.5px solid #bfdbfe",background:"#eff6ff",color:C.mid,fontSize:12,fontWeight:600,fontFamily:"'DM Sans',sans-serif",cursor:"pointer",whiteSpace:"nowrap",minHeight:36,touchAction:"manipulation"}}>
                  Today
                </button>
              )}
            </div>
          </div>

          {/* ZiG rate notice */}
          {zigRate ? (
            <div style={{display:"flex",alignItems:"center",gap:6,background:C.goldBg,border:"1px solid #fde68a",borderRadius:8,padding:"7px 12px",marginBottom:14,fontSize:11.5,fontWeight:600,color:C.gold,fontFamily:"'DM Sans',sans-serif",flexWrap:"wrap"}}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{flexShrink:0}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              ZiG rate: 1 USD = {parseFloat(zigRate).toFixed(2)} ZiG (set by HR)
            </div>
          ) : (
            <div style={{display:"flex",alignItems:"center",gap:6,background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:8,padding:"7px 12px",marginBottom:14,fontSize:11.5,color:C.amber,fontFamily:"'DM Sans',sans-serif",flexWrap:"wrap"}}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{flexShrink:0}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              No ZiG exchange rate set — ZiG equivalents appear once HR sets the rate
            </div>
          )}

          {/* Stat cards */}
          <div className="pr-stats">
            <StatCard
              label="Total paid (all time)" icon="💰"
              value={totalAllTime != null ? fmtUSD(totalAllTime) : "—"}
              sub={zigRate && totalAllTime != null ? fmtZIG(totalAllTime, zigRate) : undefined}
              subColor={C.gold} color={C.green} bg={C.greenBg}
              loading={isLoading || totalAllTime == null}
            />
            <StatCard
              label={isCurrentMonth ? "Payable this month" : `Payable — ${monthLabel}`} icon="📅"
              value={fmtUSD(totalPayableMonth)}
              sub={zigRate ? fmtZIG(totalPayableMonth, zigRate) : "ZiG rate not set"}
              subColor={zigRate ? C.gold : C.amber} color={C.mid} bg="#eff6ff"
              loading={isLoading}
            />
            <StatCard
              label="Total deductions" icon="➖"
              value={totalDeductionsMonth > 0 ? fmtUSD(totalDeductionsMonth) : "None"}
              sub={totalDeductionsMonth > 0 && zigRate ? fmtZIG(totalDeductionsMonth, zigRate) : undefined}
              subColor={C.gold} color={C.red} bg={C.redBg}
              loading={isLoading}
            />
            <StatCard
              label="Working days" icon="📆"
              value={wdInMonth}
              sub={`in ${monthLabel}`}
              color={C.teal} bg={C.tealBg}
              loading={false}
            />
          </div>
        </div>

        {/* ── Table card ──────────────────────────────────────────────────── */}
        <div style={{background:C.card,borderRadius:16,border:`1px solid ${C.border}`,boxShadow:"0 1px 6px rgba(0,0,0,0.05)",overflow:"hidden"}}>

          {/* Filter row */}
          <div className="pr-filter-row">
            {/* Search */}
            <div className="pr-search-wrap">
              <div style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.dim,pointerEvents:"none",zIndex:1}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </div>
              <input
                className="pr-search"
                type="text"
                placeholder="Search employees…"
                value={search}
                onChange={e=>setSearch(e.target.value)}
                style={{width:"100%",height:40,paddingLeft:32,paddingRight:search?30:12,border:`1.5px solid ${search?C.mid:C.border}`,borderRadius:9,background:search?"#eff6ff":"#fff",color:C.text,fontSize:14,fontFamily:"'DM Sans',sans-serif",boxSizing:"border-box",transition:"all .15s"}}
              />
              {search && (
                <button onClick={()=>setSearch("")}
                  style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:C.dim,display:"flex",padding:6,touchAction:"manipulation"}}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </div>

            {/* Department filter */}
            <div className="pr-dept-wrap">
              <div style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",pointerEvents:"none",color:C.muted,zIndex:1}}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
              </div>
              <select
                value={deptFilter}
                onChange={e=>setDeptFilter(e.target.value)}
                style={{width:"100%",height:40,paddingLeft:30,paddingRight:28,border:`1.5px solid ${deptFilter?C.mid:C.border}`,borderRadius:9,background:deptFilter?"#eff6ff":"#fff",color:deptFilter?C.mid:C.muted,fontSize:14,fontFamily:"'DM Sans',sans-serif",cursor:"pointer",outline:"none",transition:"all .15s",boxSizing:"border-box"}}
              >
                <option value="">All Departments</option>
                {deptOptions.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <div style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",pointerEvents:"none",color:deptFilter?C.mid:C.dim}}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
              </div>
            </div>

            {/* Clear */}
            {hasFilters && (
              <button
                onClick={()=>{setSearch("");setDeptFilter("");}}
                style={{height:40,padding:"0 12px",borderRadius:9,border:"1.5px solid #fca5a5",background:"#fff1f2",color:C.red,fontSize:12,fontWeight:600,fontFamily:"'DM Sans',sans-serif",cursor:"pointer",display:"flex",alignItems:"center",gap:5,whiteSpace:"nowrap",flexShrink:0,touchAction:"manipulation"}}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                Clear
              </button>
            )}

            {hasFilters && !isLoading && (
              <span style={{fontSize:12,color:C.muted,fontFamily:"'DM Sans',sans-serif",flexShrink:0,marginLeft:"auto",whiteSpace:"nowrap"}}>
                {rows.length} of {allRows.length}
              </span>
            )}
          </div>

          {/* Loading */}
          {isLoading && (
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,padding:"52px 0"}}>
              <Spinner />
              <span style={{fontSize:13,color:C.dim,fontFamily:"'DM Sans',sans-serif"}}>Loading payroll data…</span>
            </div>
          )}

          {/* Empty */}
          {!isLoading && rows.length === 0 && (
            <div style={{textAlign:"center",padding:"44px 24px",color:C.dim,fontFamily:"'DM Sans',sans-serif"}}>
              <div style={{fontSize:36,marginBottom:10}}>{hasFilters?"🔍":"💼"}</div>
              <div style={{fontSize:14,fontWeight:600,color:C.muted}}>{hasFilters?"No employees match your filters":"No payroll data for this month"}</div>
              {hasFilters && (
                <button onClick={()=>{setSearch("");setDeptFilter("");}}
                  style={{marginTop:8,color:C.mid,background:"none",border:"none",cursor:"pointer",fontSize:13,fontFamily:"'DM Sans',sans-serif",fontWeight:600,minHeight:44,touchAction:"manipulation"}}>
                  Clear filters
                </button>
              )}
            </div>
          )}

          {/* ── Desktop table (≥640px) ───────────────────────────────────── */}
          {!isLoading && rows.length > 0 && (
            <>
              <div className="pr-table-wrap">
                <table className="pr-table" style={{width:"100%",borderCollapse:"collapse",fontFamily:"'DM Sans',sans-serif"}}>
                  <thead>
                    <tr style={{background:"#fafbff",borderBottom:`1.5px solid ${C.border}`}}>
                      {["Employee","Job Title","Attendance","Basic Salary","Deductions","Net Salary"].map(h => (
                        <th key={h} style={{padding:"10px 16px",textAlign:"left",fontSize:10,fontWeight:700,color:C.muted,letterSpacing:"0.8px",textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                      <th style={{width:28}} />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ emp, pr, basic, attRec, deduction, net }) => {
                      const name = emp.full_name || [emp.first_name,emp.last_name].filter(Boolean).join(" ") || "—";
                      const pct = wdInMonth > 0 ? attRec.present / wdInMonth : 0;
                      const attColor = pct >= 0.9 ? C.green : pct >= 0.7 ? C.amber : C.red;
                      return (
                        <tr key={emp.id} className="pr-row" onClick={() => openHistory(emp)}
                          style={{cursor:"pointer",transition:"background .12s",borderBottom:"1px solid #f1f5f9",background:"transparent"}}>
                          <td style={{padding:"11px 16px"}}>
                            <div style={{display:"flex",alignItems:"center",gap:10}}>
                              <Avatar emp={emp} size={34} />
                              <div>
                                <div style={{fontWeight:600,fontSize:13,color:C.navy,fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap"}}>{name}</div>
                                {emp.employee_number && <div style={{fontSize:10,color:C.dim,marginTop:1}}>#{emp.employee_number}</div>}
                              </div>
                            </div>
                          </td>
                          <td style={{padding:"11px 16px"}}>
                            <div style={{fontSize:12.5,color:"#334155",fontFamily:"'DM Sans',sans-serif",fontWeight:500,whiteSpace:"nowrap"}}>{emp.job_title||emp.position||"—"}</div>
                            {emp.department_name && <div style={{fontSize:11,color:C.dim,marginTop:1}}>{emp.department_name}</div>}
                          </td>
                          <td style={{padding:"11px 16px",whiteSpace:"nowrap"}}>
                            <div style={{display:"flex",flexDirection:"column",gap:3}}>
                              <span>
                                <span style={{fontSize:13,fontWeight:700,color:attColor,fontFamily:"'Playfair Display',serif"}}>{attRec.present}</span>
                                <span style={{fontSize:11,color:C.dim}}>/{wdInMonth}</span>
                                {attRec.halfDays > 0 && <span style={{fontSize:10,color:C.teal,background:C.tealBg,borderRadius:20,padding:"1px 6px",marginLeft:6,fontWeight:600}}>½×{attRec.halfDays}</span>}
                              </span>
                              <div style={{width:60,height:4,background:"#e8edf8",borderRadius:99,overflow:"hidden"}}>
                                <div style={{height:"100%",borderRadius:99,width:`${Math.min(pct*100,100)}%`,background:attColor,transition:"width .5s ease"}} />
                              </div>
                            </div>
                          </td>
                          <td style={{padding:"11px 16px"}}>
                            <div style={{fontSize:13,fontWeight:600,color:C.navy,fontFamily:"'Playfair Display',serif"}}>{basic > 0 ? fmtUSD(basic) : <span style={{color:C.dim,fontSize:12}}>Not set</span>}</div>
                            {zigRate && basic > 0 && <ZigBadge usdAmount={basic} rate={zigRate} small />}
                          </td>
                          <td style={{padding:"11px 16px"}}>
                            {deduction > 0
                              ? <div><div style={{fontSize:13,color:C.red,fontWeight:600}}>−{fmtUSD(deduction)}</div>{zigRate && <ZigBadge usdAmount={deduction} rate={zigRate} small />}</div>
                              : <span style={{fontSize:12,color:C.dim}}>—</span>}
                          </td>
                          <td style={{padding:"11px 16px"}}>
                            {basic > 0
                              ? <div><div style={{fontSize:14,fontWeight:700,color:net>0?C.green:C.dim,fontFamily:"'Playfair Display',serif"}}>{fmtUSD(net)}</div>{zigRate && net > 0 && <ZigBadge usdAmount={net} rate={zigRate} small />}</div>
                              : <span style={{fontSize:12,color:C.dim}}>—</span>}
                          </td>
                          <td style={{padding:"11px 12px",width:28}}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.dim} strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{background:"#fafbff",borderTop:`2px solid ${C.border}`}}>
                      <td colSpan={2} style={{padding:"11px 16px",fontSize:10,fontWeight:700,color:C.muted,fontFamily:"'DM Sans',sans-serif",textTransform:"uppercase",letterSpacing:"0.5px"}}>
                        {rows.length} employee{rows.length!==1?"s":""}{hasFilters?" (filtered)":""}
                      </td>
                      <td style={{padding:"11px 16px"}} />
                      <td style={{padding:"11px 16px"}}>
                        <div style={{fontSize:13,fontWeight:700,color:C.navy,fontFamily:"'Playfair Display',serif"}}>{fmtUSD(rows.reduce((s,r)=>s+r.basic,0))}</div>
                        {zigRate && <ZigBadge usdAmount={rows.reduce((s,r)=>s+r.basic,0)} rate={zigRate} small />}
                      </td>
                      <td style={{padding:"11px 16px"}}>
                        <div style={{fontSize:13,fontWeight:700,color:C.red,fontFamily:"'DM Sans',sans-serif"}}>{rows.some(r=>r.deduction>0)?`−${fmtUSD(rows.reduce((s,r)=>s+r.deduction,0))}`:"—"}</div>
                      </td>
                      <td style={{padding:"11px 16px"}}>
                        <div style={{fontSize:14,fontWeight:700,color:C.green,fontFamily:"'Playfair Display',serif"}}>{fmtUSD(rows.reduce((s,r)=>s+r.net,0))}</div>
                        {zigRate && <ZigBadge usdAmount={rows.reduce((s,r)=>s+r.net,0)} rate={zigRate} small />}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* ── Mobile card list (<640px) ───────────────────────────── */}
              <div className="pr-mobile-list">
                {rows.map(({ emp, attRec, basic, deduction, net }) => {
                  const name = emp.full_name || [emp.first_name,emp.last_name].filter(Boolean).join(" ") || "—";
                  const pct = wdInMonth > 0 ? attRec.present / wdInMonth : 0;
                  const attColor = pct >= 0.9 ? C.green : pct >= 0.7 ? C.amber : C.red;
                  return (
                    <div key={emp.id} onClick={()=>openHistory(emp)}
                      style={{padding:"14px",borderBottom:`1px solid ${C.border}`,cursor:"pointer",display:"flex",flexDirection:"column",gap:10,WebkitTapHighlightColor:"transparent"}}
                      onTouchStart={e=>e.currentTarget.style.background="#f0f6ff"}
                      onTouchEnd={e=>e.currentTarget.style.background="transparent"}
                      onMouseEnter={e=>e.currentTarget.style.background="#f0f6ff"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}
                    >
                      {/* Name row */}
                      <div style={{display:"flex",alignItems:"center",gap:10,justifyContent:"space-between"}}>
                        <div style={{display:"flex",alignItems:"center",gap:10,flex:1,minWidth:0}}>
                          <Avatar emp={emp} size={40} />
                          <div style={{minWidth:0}}>
                            <div style={{fontWeight:600,fontSize:14,color:C.navy,fontFamily:"'DM Sans',sans-serif",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</div>
                            <div style={{fontSize:11.5,color:C.muted,fontFamily:"'DM Sans',sans-serif",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{emp.job_title||"—"}{emp.department_name?` · ${emp.department_name}`:""}</div>
                          </div>
                        </div>
                        <div style={{textAlign:"right",flexShrink:0}}>
                          <div style={{fontSize:15,fontWeight:700,color:net>0?C.green:C.dim,fontFamily:"'Playfair Display',serif"}}>{basic>0?fmtUSD(net):"—"}</div>
                          {zigRate && net > 0 && <ZigBadge usdAmount={net} rate={zigRate} small />}
                        </div>
                      </div>

                      {/* Detail chips row */}
                      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                        {/* Attendance chip */}
                        <div style={{display:"flex",alignItems:"center",gap:5,background:"#f8faff",borderRadius:8,padding:"5px 10px",fontSize:12,fontFamily:"'DM Sans',sans-serif"}}>
                          <span style={{color:attColor,fontWeight:700}}>{attRec.present}</span>
                          <span style={{color:C.dim}}>/ {wdInMonth} days</span>
                          {attRec.halfDays > 0 && <span style={{fontSize:10,color:C.teal,background:C.tealBg,borderRadius:20,padding:"1px 5px",fontWeight:600}}>½×{attRec.halfDays}</span>}
                        </div>
                        {/* Basic chip */}
                        {basic > 0 && (
                          <div style={{display:"flex",alignItems:"center",gap:4,background:"#f8faff",borderRadius:8,padding:"5px 10px",fontSize:12,fontFamily:"'DM Sans',sans-serif",color:C.muted}}>
                            <span>Basic: </span><span style={{fontWeight:600,color:C.navy}}>{fmtUSD(basic)}</span>
                          </div>
                        )}
                        {/* Deduction chip */}
                        {deduction > 0 && (
                          <div style={{display:"flex",alignItems:"center",gap:4,background:C.redBg,borderRadius:8,padding:"5px 10px",fontSize:12,fontFamily:"'DM Sans',sans-serif",color:C.red,fontWeight:600}}>
                            −{fmtUSD(deduction)}
                          </div>
                        )}
                      </div>

                      {/* Attendance progress bar */}
                      <div style={{width:"100%",height:4,background:"#e8edf8",borderRadius:99,overflow:"hidden"}}>
                        <div style={{height:"100%",borderRadius:99,width:`${Math.min(pct*100,100)}%`,background:attColor,transition:"width .5s ease"}} />
                      </div>
                    </div>
                  );
                })}

                {/* Mobile footer totals */}
                <div style={{padding:"12px 14px",borderTop:`2px solid ${C.border}`,background:"#fafbff",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                  <span style={{fontSize:11,color:C.muted,fontFamily:"'DM Sans',sans-serif",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.4px"}}>
                    {rows.length} employee{rows.length!==1?"s":""}
                  </span>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:14,fontWeight:700,color:C.green,fontFamily:"'Playfair Display',serif"}}>
                      {fmtUSD(rows.reduce((s,r)=>s+r.net,0))}
                    </div>
                    {zigRate && <ZigBadge usdAmount={rows.reduce((s,r)=>s+r.net,0)} rate={zigRate} small />}
                  </div>
                </div>
              </div>

              {/* Footer hint */}
              <div style={{padding:"9px 14px",borderTop:"1px solid #f1f5f9",fontSize:11,color:C.dim,fontFamily:"'DM Sans',sans-serif",textAlign:"right"}}>
                {rows.length} employee{rows.length!==1?"s":""}{hasFilters&&allRows.length!==rows.length?` (filtered from ${allRows.length})`:""}
                {" · tap any row to view salary history"}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}