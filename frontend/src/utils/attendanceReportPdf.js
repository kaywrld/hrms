// src/utils/attendanceReportPdf.js
//
// Builds the "Attendance Report" PDF (A4 landscape) for a DAILY, WEEKLY or
// MONTHLY period. Same look and layout as the Finance report - it reuses the
// drawing helpers exported from financeReportPdf.js.
//
//   Page 1 : header + 4 KPI cards, donut (attended days by department),
//            bar chart (present / late / absent days by department with an
//            attendance-% trend line), department summary table.
//   Page 2 : same, by SITE        (ranked attendance-% bars)
//   Page 3 : same, by GENDER      (donut)
//   Page 4 : same, by JOB TITLE   (ranked attendance-% bars)
//   Last   : employee detail
//              daily   -> one row per employee (status, arrival time, location, reason)
//              weekly  -> Mon-Sun grid of P / L / H / V / A per employee
//              monthly -> per-employee totals and attendance %
//
// Definitions (also printed at the bottom of every page):
//   * Working day      = Mon-Fri that is not a ZW public holiday (same rule as the
//                        Mark Register and Payroll pages). Future days and days
//                        before an employee's join date are not counted.
//   * A day that was marked on a weekend / holiday is still counted.
//   * Not Marked       = a working day with no attendance record. It counts
//                        against attendance so gaps in the register stay visible.
//   * Attendance %     = (Present + Late + 0.5 x Half Day) / days counted.

import { jsPDF } from "jspdf";
import {
  C, M, CW, MONTHS, clean, fill, stroke, ink, fitText, niceScale, drawSmoothCurve,
  drawHeader, drawKpis, sectionTitle, panel, drawDonut, drawRankedBars, drawTable, drawFooters,
} from "./financeReportPdf";

// ── Colours specific to this report ──────────────────────────────────────────
const SERIES = {
  present: [26, 111, 212],  // blue
  late:    [245, 158, 11],  // amber
  absent:  [220, 68, 68],   // red
};
const RATE_LINE = [10, 42, 94]; // navy trend line for attendance %

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON_SHORT = MONTHS.map((m) => m.slice(0, 3));
const GENDER_LABELS = { M: "Male", F: "Female", O: "Other" };

const KEYS = ["present", "late", "half_day", "leave", "absent", "not_marked"];
const KNOWN = new Set(["present", "late", "half_day", "leave", "absent"]);

const STATUS_LABEL = {
  present: "Present", late: "Late", half_day: "Half Day", leave: "On Leave",
  absent: "Absent", not_marked: "Not Marked",
  off: "Off Day", future: "Upcoming", prejoin: "Not Joined",
};
const STATUS_CODE = {
  present: "P", late: "L", half_day: "H", leave: "V", absent: "A", not_marked: "-",
};

// ── Date helpers (all LOCAL time, never toISOString, so Harare's UTC+2 can't
//    shift a date back a day) ─────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, "0");
export const toYmd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s) => {
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const fmtShort = (d, withYear) =>
  `${pad(d.getDate())} ${MON_SHORT[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ""}`;

// ── Zimbabwe public holidays ─────────────────────────────────────────────────
// Same logic as the Mark Register (AttendancePage) and Payroll pages, so the
// working-day count here always matches what those pages show.
const ZW_PUBLIC_HOLIDAYS_RECURRING = [
  "01-01", "02-21", "04-18", "05-01", "05-25",
  "08-11", "08-12", "09-15", "12-22", "12-25", "12-26",
];

function getZwPublicHolidays(year, month) {
  const holidays = new Set();
  for (const mmdd of ZW_PUBLIC_HOLIDAYS_RECURRING) {
    const [m, d] = mmdd.split("-").map(Number);
    if (m - 1 === month) {
      const dow = new Date(year, month, d).getDay();
      if (dow !== 0 && dow !== 6) holidays.add(`${year}-${pad(month + 1)}-${pad(d)}`);
    }
  }
  // Easter (Good Friday + Easter Monday)
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d2 = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d2 - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m2 = Math.floor((a + 11 * h + 22 * l) / 451);
  const easterMonth = Math.floor((h + l - 7 * m2 + 114) / 31) - 1;
  const easterDay = ((h + l - 7 * m2 + 114) % 31) + 1;
  const goodFriday = new Date(year, easterMonth, easterDay - 2);
  if (goodFriday.getMonth() === month) holidays.add(toYmd(goodFriday));
  const easterMonday = new Date(year, easterMonth, easterDay + 1);
  if (easterMonday.getMonth() === month) holidays.add(toYmd(easterMonday));
  return holidays;
}

// ── Period ───────────────────────────────────────────────────────────────────
/**
 * @param {{type:"daily"|"weekly"|"monthly", date?:string, year?:number, month?:number}} p
 *        date = "YYYY-MM-DD" (daily / weekly: any day inside the week), month = 0-11
 */
export function resolvePeriod({ type, date, year, month }) {
  let start, end, label, file;
  if (type === "monthly") {
    start = new Date(year, month, 1);
    end = new Date(year, month + 1, 0);
    label = `${MONTHS[month]} ${year}`;
    file = `${MONTHS[month]}_${year}`;
  } else if (type === "weekly") {
    const d = parseYmd(date);
    start = addDays(d, -((d.getDay() + 6) % 7)); // back to Monday
    end = addDays(start, 6);                     // Sunday
    const cross = start.getFullYear() !== end.getFullYear();
    label = `${fmtShort(start, cross)} - ${fmtShort(end, true)}`;
    file = `${toYmd(start)}_to_${toYmd(end)}`;
  } else {
    start = end = parseYmd(date);
    label = `${DAYS[start.getDay()]} ${fmtShort(start, true)}`;
    file = toYmd(start);
  }
  return { type, start, end, startStr: toYmd(start), endStr: toYmd(end), label, file };
}

// ── Number formatting ────────────────────────────────────────────────────────
const fmtDays = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const fmtPct = (v) => `${(Number(v) || 0).toFixed(1)}%`;
const compactCount = (v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1).replace(/\.0$/, "")}k` : `${Math.round(v)}`);

// ── Per-employee numbers ─────────────────────────────────────────────────────
function compute({ employees, records, period, today }) {
  const todayStr = toYmd(today);

  const holCache = new Map();
  const isHoliday = (d) => {
    const k = `${d.getFullYear()}-${d.getMonth()}`;
    if (!holCache.has(k)) holCache.set(k, getZwPublicHolidays(d.getFullYear(), d.getMonth()));
    return holCache.get(k).has(toYmd(d));
  };

  const days = [];
  for (let d = new Date(period.start); d <= period.end; d = addDays(d, 1)) {
    const dow = d.getDay();
    days.push({
      str: toYmd(d), dow, dom: d.getDate(),
      working: dow !== 0 && dow !== 6 && !isHoliday(d),
    });
  }

  // employee id -> (date -> record)
  const byEmp = new Map();
  for (const r of records) {
    const id = typeof r.employee === "object" ? r.employee?.id : r.employee;
    if (id == null || !KNOWN.has(r.status)) continue;
    if (!byEmp.has(id)) byEmp.set(id, new Map());
    byEmp.get(id).set(String(r.date).slice(0, 10), r);
  }

  const rows = employees.map((emp) => {
    const recs = byEmp.get(emp.id) || new Map();
    const joined = emp.date_joined ? String(emp.date_joined).slice(0, 10) : "";
    const counts = { present: 0, late: 0, half_day: 0, leave: 0, absent: 0, not_marked: 0 };
    const dayStatus = {};
    let countable = 0;

    for (const d of days) {
      const rec = recs.get(d.str);
      if (rec) {
        counts[rec.status] += 1;
        countable += 1;
        dayStatus[d.str] = rec.status;
      } else if (!d.working) {
        dayStatus[d.str] = "off";
      } else if (d.str > todayStr) {
        dayStatus[d.str] = "future";
      } else if (joined && d.str < joined) {
        dayStatus[d.str] = "prejoin";
      } else {
        counts.not_marked += 1;
        countable += 1;
        dayStatus[d.str] = "not_marked";
      }
    }

    const attended = counts.present + counts.late + counts.half_day * 0.5;
    return {
      emp,
      name: clean(`${emp.first_name || ""} ${emp.last_name || ""}`) || "-",
      department: clean(emp.department_name) || "Unassigned",
      site: clean(emp.site_name) || "No site assigned",
      jobTitle: clean(emp.job_title) || "Unspecified",
      gender: GENDER_LABELS[emp.gender] || "Unspecified",
      counts, countable, attended, dayStatus,
      rate: countable > 0 ? (attended / countable) * 100 : 0,
      rec: recs.get(days[0].str) || null, // used by the daily detail table
    };
  });

  return { days, rows, workingDays: days.filter((d) => d.working && d.str <= todayStr).length };
}

// ── Grouping ─────────────────────────────────────────────────────────────────
const newGroup = (name) => ({
  name, employees: 0, present: 0, late: 0, half_day: 0, leave: 0, absent: 0,
  not_marked: 0, countable: 0, attended: 0,
});
function addRow(g, r) {
  g.employees += 1;
  KEYS.forEach((k) => { g[k] += r.counts[k]; });
  g.countable += r.countable;
  g.attended += r.attended;
}
const rateOf = (g) => (g.countable > 0 ? (g.attended / g.countable) * 100 : 0);

function groupRows(rows, keyOf) {
  const map = new Map();
  for (const r of rows) {
    const name = keyOf(r);
    if (!map.has(name)) map.set(name, newGroup(name));
    addRow(map.get(name), r);
  }
  return [...map.values()].sort((a, b) => b.attended - a.attended || a.name.localeCompare(b.name));
}

// Keeps the biggest `max` groups and folds the rest into one "Other" group.
function topWithOther(groups, max) {
  if (groups.length <= max) return groups;
  const head = groups.slice(0, max - 1);
  const rest = groups.slice(max - 1);
  const other = newGroup(`Other (${rest.length})`);
  rest.forEach((g) => {
    other.employees += g.employees;
    KEYS.forEach((k) => { other[k] += g[k]; });
    other.countable += g.countable;
    other.attended += g.attended;
  });
  return [...head, other];
}

// ── Bar chart: present / late / absent days + attendance-% trend line ───────
// Same construction as the Finance chart (one thin bar per category, series
// stacked from the baseline tallest-first, diagonal category names). The
// attendance % runs on its own 0-100% axis on the right.
function drawStatusBars(doc, { x, y, w, h, cats }) {
  const LABEL_ANGLE = 45, LABEL_MAX_W = 22, LABEL_FS = 6;
  const SIN = Math.sin((LABEL_ANGLE * Math.PI) / 180), COS = Math.cos((LABEL_ANGLE * Math.PI) / 180);
  doc.setFont("helvetica", "normal"); doc.setFontSize(LABEL_FS);
  const labelTexts = cats.map((c) => fitText(doc, c.name, LABEL_MAX_W));
  const longest = Math.max(0, ...labelTexts.map((t) => doc.getTextWidth(t)));

  const axisW = 12, rightW = 11, legendH = 6;
  const labelH = Math.min(longest * SIN + 4, 18);
  const px = x + axisW, py = y + legendH, pw = w - axisW - rightW, ph = h - legendH - labelH;
  const keys = ["present", "late", "absent"];
  const names = { present: "Present", late: "Late", absent: "Absent" };

  // legend (top-right): bar series, then the attendance-% line marker
  doc.setFont("helvetica", "normal"); doc.setFontSize(7);
  let lx = x + w - 2;
  const lineLabel = "Attendance %";
  lx -= doc.getTextWidth(lineLabel);
  ink(doc, C.ink); doc.text(lineLabel, lx, y + 3);
  lx -= 7;
  stroke(doc, RATE_LINE); doc.setLineWidth(0.8);
  doc.line(lx - 6, y + 2.1, lx, y + 2.1);
  fill(doc, RATE_LINE); doc.circle(lx - 3, y + 2.1, 0.9, "F");
  lx -= 9;
  [...keys].reverse().forEach((k) => {
    lx -= doc.getTextWidth(names[k]);
    ink(doc, C.ink); doc.text(names[k], lx, y + 3);
    lx -= 4.2;
    fill(doc, SERIES[k]); doc.roundedRect(lx, y + 0.6, 3, 3, 0.6, 0.6, "F");
    lx -= 5;
  });

  // left axis = day counts (whole numbers only)
  const max = Math.max(0, ...cats.flatMap((c) => keys.map((k) => c[k])));
  let { top, step } = niceScale(max, 4);
  if (step < 1) { step = 1; top = Math.max(1, Math.ceil(max)); }
  doc.setLineWidth(0.2);
  for (let v = 0; v <= top + step / 1000; v += step) {
    const gy = py + ph - (v / top) * ph;
    stroke(doc, C.grid); doc.line(px, gy, px + pw, gy);
    ink(doc, C.muted); doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
    doc.text(compactCount(v), px - 1.8, gy + 0.8, { align: "right" });
  }
  // right axis = attendance %
  [0, 50, 100].forEach((p) => {
    const gy = py + ph - (p / 100) * ph;
    ink(doc, RATE_LINE); doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
    doc.text(`${p}%`, px + pw + 1.8, gy + 0.8);
  });

  const n = cats.length || 1, gw = pw / n;
  const bw = Math.max(1.2, Math.min(gw * 0.7, 7));
  const showValues = gw >= 7;
  cats.forEach((c, i) => {
    const bx = px + i * gw + (gw - bw) / 2;
    const series = keys
      .filter((k) => c[k] > 0)
      .map((k) => ({ k, bh: Math.max(top > 0 ? (c[k] / top) * ph : 0, 0.7) }))
      .sort((a, b) => b.bh - a.bh);

    series.forEach((s) => {
      fill(doc, SERIES[s.k]);
      stroke(doc, [255, 255, 255]); doc.setLineWidth(0.3);
      doc.rect(bx, py + ph - s.bh, bw, s.bh, "FD");
    });

    const placed = [];
    (showValues ? series : []).forEach((s) => {
      const barTop = py + ph - s.bh;
      let ly = barTop - 0.9;
      let inside = false;
      if (placed.some((p) => Math.abs(p - ly) < 2.4)) {
        if (s.bh < 3.4) return;
        ly = barTop + 2.4;
        inside = true;
      }
      ink(doc, inside ? [255, 255, 255] : C.muted);
      doc.setFont("helvetica", "normal"); doc.setFontSize(5.5);
      doc.text(compactCount(c[s.k]), bx + bw / 2, ly, { align: "center" });
      placed.push(ly);
    });

    ink(doc, C.ink); doc.setFont("helvetica", "normal"); doc.setFontSize(LABEL_FS);
    const txt = labelTexts[i];
    const tw = doc.getTextWidth(txt);
    const ax = px + i * gw + gw / 2 + 1;
    const ay = py + ph + 2.6;
    doc.text(txt, ax - tw * COS, ay + tw * SIN, { angle: LABEL_ANGLE });
  });
  stroke(doc, C.slate); doc.setLineWidth(0.3);
  doc.line(px, py + ph, px + pw, py + ph);

  // attendance-% trend
  const pts = cats.map((c, i) => ({
    x: px + i * gw + gw / 2,
    y: py + ph - (Math.min(100, Math.max(0, c.rate)) / 100) * ph,
  }));
  if (pts.length > 1) {
    stroke(doc, RATE_LINE); doc.setLineWidth(0.7);
    drawSmoothCurve(doc, pts, py, py + ph);
  }
  pts.forEach((p) => {
    fill(doc, RATE_LINE); stroke(doc, [255, 255, 255]); doc.setLineWidth(0.5);
    doc.circle(p.x, p.y, 1.1, "FD");
  });
}

// ── Public API ───────────────────────────────────────────────────────────────
/**
 * @param {object}   opts
 * @param {object[]} opts.employees   employees to report on (already filtered, e.g. status "employed")
 * @param {object[]} opts.records     attendance records for the period (all pages)
 * @param {object}   opts.period      from resolvePeriod()
 * @param {string}   [opts.generatedBy]
 * @param {string}   [opts.company]
 * @param {{dataUrl:string, format:string}} [opts.logo]
 * @param {Date}     [opts.today]
 * @returns {{ doc: jsPDF, filename: string }}
 */
export function buildAttendanceReport({
  employees, records, period, generatedBy = "",
  company = "JECCA ENGINEERING (PVT) LTD", logo = null, today = new Date(),
}) {
  const { days, rows, workingDays } = compute({ employees, records, period, today });

  const kind = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" }[period.type] || "Daily";
  const isDaily = period.type === "daily";
  const reportTitle = `${kind} Attendance Report`;
  const generatedAt = today.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  // totals
  const totals = newGroup("TOTAL");
  rows.forEach((r) => addRow(totals, r));
  const kpis = [
    { label: "ATTENDANCE RATE", value: fmtPct(rateOf(totals)), color: C.navy,  glyph: "%" },
    { label: isDaily ? "PRESENT" : "PRESENT DAYS", value: fmtDays(totals.present), color: C.royal, glyph: "+" },
    { label: isDaily ? "LATE"    : "LATE DAYS",    value: fmtDays(totals.late),    color: C.steel, glyph: "!" },
    { label: isDaily ? "ABSENT"  : "ABSENT DAYS",  value: fmtDays(totals.absent),  color: C.ocean, glyph: "-" },
  ];

  const byDept  = groupRows(rows, (r) => r.department);
  const bySite  = groupRows(rows, (r) => r.site);
  const byGender = groupRows(rows, (r) => r.gender);
  const byTitle = groupRows(rows, (r) => r.jobTitle);

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setProperties({ title: `${reportTitle} - ${period.label}`, author: company });

  const tag = (t) =>
    `${clean(company)}  |  ${t}  |  ${rows.length} employees  |  ${workingDays} working day${workingDays === 1 ? "" : "s"}`;
  const header = (pageTag) =>
    drawHeader(doc, { title: reportTitle, tag: tag(pageTag), period: period.label, currencyLabel: `${kind} report`, logo });
  const continuedHeader = (title) => {
    doc.addPage();
    const hy = drawHeader(doc, {
      title: reportTitle, tag: "", period: period.label, currencyLabel: `${kind} report`, logo: null, compact: true,
    });
    sectionTitle(doc, M, hy + 8, `${title} (continued)`);
    return hy + 11;
  };

  const groupCols = (firstLabel) => [
    { label: firstLabel,      w: 62, get: (r) => r.name },
    { label: "Employees",     w: 24, align: "right", get: (r) => r.employees },
    { label: "Present",       w: 28, align: "right", get: (r) => fmtDays(r.present) },
    { label: "Late",          w: 24, align: "right", get: (r) => fmtDays(r.late) },
    { label: "Half Day",      w: 26, align: "right", get: (r) => fmtDays(r.half_day) },
    { label: "On Leave",      w: 24, align: "right", get: (r) => fmtDays(r.leave) },
    { label: "Absent",        w: 26, align: "right", get: (r) => fmtDays(r.absent) },
    { label: "Not Marked",    w: 30, align: "right", get: (r) => fmtDays(r.not_marked) },
    { label: "Attendance %",  w: 33, align: "right", get: (r) => fmtPct(rateOf(r)) },
  ];

  const pctMoney = { full: (v) => fmtPct(v) };

  // One full page (header, KPIs, two charts, summary table) for a grouping.
  const buildPage = ({ groups, pageTag, label, firstLabel, tableTitle, left }) => {
    let y = header(pageTag);
    y = drawKpis(doc, y + 4, kpis);

    const ay = y + 4, ah = 62;
    const lw = 100, rx = M + lw + 4, rw = CW - lw - 4;
    panel(doc, M, ay, lw, ah);
    panel(doc, rx, ay, rw, ah);

    if (left === "donut") {
      sectionTitle(doc, M + 4, ay + 6.5, `Days attended by ${label}`);
      drawDonut(doc, {
        x: M + 2, y: ay + 9, w: lw - 4, h: ah - 12,
        items: topWithOther(groups, 8).map((g) => ({ name: g.name, value: g.attended })),
        centerTop: fmtDays(totals.attended), centerBottom: isDaily ? "attended" : "days attended",
      });
    } else {
      sectionTitle(doc, M + 4, ay + 6.5, `Attendance % by ${label} (ranked)`);
      const ranked = topWithOther([...groups].sort((a, b) => rateOf(b) - rateOf(a)), 7)
        .map((g) => ({ name: g.name, value: rateOf(g) }));
      drawRankedBars(doc, {
        x: M + 4, y: ay + 11, w: lw - 8, h: ah - 15, items: ranked, money: pctMoney,
      });
    }

    sectionTitle(doc, rx + 4, ay + 6.5, `Present, late & absent ${isDaily ? "employees" : "days"} by ${label}`);
    drawStatusBars(doc, {
      x: rx + 4, y: ay + 9, w: rw - 8, h: ah - 11,
      cats: topWithOther(groups, 40).map((g) => ({
        name: g.name, present: g.present, late: g.late, absent: g.absent, rate: rateOf(g),
      })),
    });

    const by = ay + ah + 5;
    sectionTitle(doc, M, by + 1, tableTitle);
    drawTable(doc, {
      x: M, y: by + 4, cols: groupCols(firstLabel), rows: groups, total: totals,
      onNewPage: () => continuedHeader(tableTitle),
    });
  };

  buildPage({ groups: byDept,   pageTag: "Department Breakdown", label: "department", firstLabel: "Department", tableTitle: "Department attendance summary", left: "donut" });
  doc.addPage();
  buildPage({ groups: bySite,   pageTag: "Site Breakdown",       label: "site",       firstLabel: "Site",       tableTitle: "Site attendance summary",       left: "ranked" });
  doc.addPage();
  buildPage({ groups: byGender, pageTag: "Gender Breakdown",     label: "gender",     firstLabel: "Gender",     tableTitle: "Gender attendance summary",     left: "donut" });
  doc.addPage();
  buildPage({ groups: byTitle,  pageTag: "Job Title Breakdown",  label: "job title",  firstLabel: "Job Title",  tableTitle: "Job title attendance summary",  left: "ranked" });

  // ── Employee detail (last pages) ──
  const lastOf = (r) => String(r.emp.last_name || "").toLowerCase();
  const sorted = [...rows].sort(
    (a, b) => a.department.localeCompare(b.department) || lastOf(a).localeCompare(lastOf(b)) || a.name.localeCompare(b.name)
  );

  let detailCols, detailTitle;
  if (isDaily) {
    const dayStr = days[0].str;
    detailTitle = "Daily register - all employees";
    detailCols = [
      { label: "Emp No",        w: 28, get: (r) => r.emp.employee_number || "" },
      { label: "Name",          w: 58, get: (r) => r.name },
      { label: "Department",    w: 42, get: (r) => r.department },
      { label: "Site",          w: 38, get: (r) => r.site },
      { label: "Status",        w: 22, get: (r) => STATUS_LABEL[r.dayStatus[dayStr]] || "" },
      { label: "Arrival",       w: 18, get: (r) => (r.rec && r.rec.arrival_time) || "" },
      { label: "Work Location", w: 34, get: (r) => (r.rec && r.rec.work_location) || "" },
      { label: "Reason / Notes", w: 37, get: (r) => (r.rec && (r.rec.absence_reason || r.rec.notes)) || "" },
    ];
  } else if (period.type === "weekly") {
    detailTitle = "Weekly register (P present, L late, H half day, V leave, A absent, - not marked)";
    detailCols = [
      { label: "Emp No",     w: 24, get: (r) => r.emp.employee_number || "" },
      { label: "Name",       w: 52, get: (r) => r.name },
      { label: "Department", w: 38, get: (r) => r.department },
      ...days.map((d) => ({
        label: `${DAYS[d.dow]} ${d.dom}`, w: 16, align: "center",
        get: (r) => STATUS_CODE[r.dayStatus[d.str]] || "",
      })),
      { label: "Present", w: 13, align: "right", get: (r) => r.counts.present },
      { label: "Late",    w: 11, align: "right", get: (r) => r.counts.late },
      { label: "Absent",  w: 13, align: "right", get: (r) => r.counts.absent },
      { label: "Rate",    w: 14, align: "right", get: (r) => fmtPct(r.rate) },
    ];
  } else {
    detailTitle = "Monthly attendance summary - all employees";
    detailCols = [
      { label: "Emp No",       w: 26, get: (r) => r.emp.employee_number || "" },
      { label: "Name",         w: 56, get: (r) => r.name },
      { label: "Department",   w: 42, get: (r) => r.department },
      { label: "Present",      w: 17, align: "right", get: (r) => r.counts.present },
      { label: "Late",         w: 15, align: "right", get: (r) => r.counts.late },
      { label: "Half",         w: 15, align: "right", get: (r) => r.counts.half_day },
      { label: "Leave",        w: 15, align: "right", get: (r) => r.counts.leave },
      { label: "Absent",       w: 17, align: "right", get: (r) => r.counts.absent },
      { label: "Not Marked",   w: 21, align: "right", get: (r) => r.counts.not_marked },
      { label: "Days",         w: 22, align: "right", get: (r) => r.countable },
      { label: "Attendance %", w: 31, align: "right", get: (r) => fmtPct(r.rate) },
    ];
  }

  doc.addPage();
  const dy = header("Employee Detail");
  sectionTitle(doc, M, dy + 8, detailTitle);
  drawTable(doc, {
    x: M, y: dy + 11, cols: detailCols, rows: sorted,
    onNewPage: () => continuedHeader(detailTitle),
  });

  drawFooters(doc, { company, generatedBy, generatedAt });

  // Definitions line, just above the footer rule on every page.
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    ink(doc, C.muted); doc.setFont("helvetica", "italic"); doc.setFontSize(6.3);
    doc.text(
      "Attendance % = (Present + Late + 0.5 x Half Day) / days counted. Working days exclude weekends and ZW public holidays; "
      + "working days with no record show as Not Marked and count against attendance.",
      M, 200.2
    );
  }

  return { doc, filename: `Attendance_Report_${kind}_${period.file}.pdf` };
}