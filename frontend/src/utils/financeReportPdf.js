// src/utils/financeReportPdf.js
//
// Builds the "Payroll Summary Report" PDF (A4 landscape) from the rows returned
// by GET /api/payroll/computed/.
//
//   Page 1 : header + 4 total cards, donut (net pay by department),
//            bar chart (salaries / bonuses / deductions by department),
//            department summary table.
//   Page 2 : same header + totals repeated, then the same breakdown by SITE
//            (ranked bars, bar chart, site summary table).
//   Page 3 : breakdown by TYPE OF PAYABLE - Monthly / Daily (donut, bar chart, table).
//   Page 4 : breakdown by GENDER (donut, bar chart, table).
//   Page 5 : breakdown by JOB TITLE (ranked bars, bar chart, table).
//
// Bar charts use ONE thin bar per category, so every department / site / job
// title fits on the chart. Salaries (blue), bonuses (green) and deductions
// (red) are drawn on top of each other from the baseline, tallest first, so
// every series stays visible whatever its height. The legend tells them apart.
// Category names are written diagonally under the axis to save width. An amber
// "Net Payable" smooth curve runs through the category centres, over the bars.
//
// Everything is drawn with jsPDF's own drawing calls (vector), so the charts
// stay sharp when zoomed or printed. No html2canvas, no extra libraries.

import { jsPDF } from "jspdf";

// ── Palette (blue family) ────────────────────────────────────────────────────
const C = {
  navy:    [10, 42, 94],
  primary: [14, 61, 130],
  mid:     [21, 87, 176],
  header:  [37, 99, 190],
  royal:   [26, 111, 212],
  sky:     [125, 180, 235],
  ocean:   [3, 105, 161],
  pale:    [207, 226, 248],
  tint:    [244, 248, 253],
  band:    [241, 246, 252],
  border:  [219, 230, 245],
  grid:    [226, 232, 240],
  ink:     [30, 41, 59],
  muted:   [100, 116, 139],
  slate:   [148, 163, 184],
  steel:   [71, 102, 150],
  white:   [255, 255, 255],
};

// Donut / ranked-bar colours, in order.
const SLICES = [
  [10, 42, 94], [26, 111, 212], [125, 180, 235], [3, 105, 161],
  [186, 214, 245], [71, 102, 150], [56, 152, 200], [148, 163, 184],
];

// Bar-chart series colours: salaries blue, bonuses green, deductions red.
const SERIES_COLORS = {
  salaries:   [26, 111, 212],
  bonuses:    [34, 165, 94],
  deductions: [220, 68, 68],
};

// Overlay curve colour (net payable trend drawn across the bars).
const LINE_COLOR = [217, 119, 6]; // amber - stands out against blue / green / red
const LINE_DOT = [255, 255, 255];

// Gender codes stored on the employee record -> display label.
const GENDER_LABELS = { M: "Male", F: "Female", O: "Other" };

// ── A4 landscape geometry (mm) ───────────────────────────────────────────────
const PW = 297, M = 10, CW = PW - 2 * M;
const BOTTOM = 197; // nothing but the footer is drawn below this

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ── Small helpers ────────────────────────────────────────────────────────────
// jsPDF's built-in fonts only cover Latin-1, so anything else becomes "-".
const clean = (s) => String(s ?? "").replace(/[^\x20-\xFF]/g, "-").trim();

const fill   = (doc, rgb) => doc.setFillColor(rgb[0], rgb[1], rgb[2]);
const stroke = (doc, rgb) => doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
const ink    = (doc, rgb) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);

function fitText(doc, text, maxW) {
  let t = clean(text);
  if (doc.getTextWidth(t) <= maxW) return t;
  while (t.length > 1 && doc.getTextWidth(t + "...") > maxW) t = t.slice(0, -1);
  return t.trimEnd() + "...";
}

function compactNum(v) {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.0+$/, "")}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, "")}k`;
  return `${Math.round(v)}`;
}

function makeMoney(currency, rate) {
  const isZig = currency === "ZIG";
  const k = isZig ? (parseFloat(rate) || 1) : 1;
  const sym = isZig ? "ZiG " : "$";
  const conv = (v) => (Number(v) || 0) * k;
  // NOTE: num / full / compact all expect values that are ALREADY converted
  // to the report currency (use conv() once, when the rows are read).
  const num = (v, d = 2) =>
    (Number(v) || 0).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  return {
    conv,
    num,                                   // 1,234.50
    full: (v) => `${sym}${num(v)}`,        // $1,234.50
    // axis-style: $1.2M / $350k / $900
    compact: (v) => `${sym}${compactNum(v)}`,
    // same without the currency prefix - used for the small labels above bars
    bare: (v) => compactNum(v),
    sym,
  };
}

// Round the top of an axis to a "nice" number and pick the tick step.
function niceScale(max, ticks = 4) {
  if (!(max > 0)) return { top: ticks, step: 1 };
  const raw = max / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  return { top: Math.ceil(max / step) * step, step };
}

// Groups payroll rows by department or site and totals each group.
function groupRows(rows, keyOf, fallback, conv) {
  const map = new Map();
  for (const r of rows) {
    let name = clean(keyOf(r));
    if (!name || name === "-") name = fallback;
    if (!map.has(name)) map.set(name, { name, employees: 0, salaries: 0, bonuses: 0, deductions: 0, net: 0 });
    const g = map.get(name);
    g.employees += 1;
    g.salaries   += conv(r.net_salary);
    g.bonuses    += conv(r.bonus);
    g.deductions += conv(r.deduction);
    g.net        += conv(r.final_pay);
  }
  return [...map.values()].sort((a, b) => b.net - a.net);
}

// Keeps the biggest `max` groups and folds the rest into one "Other" group,
// so charts never get crowded. The table always shows every group.
function topWithOther(groups, max) {
  if (groups.length <= max) return groups;
  const head = groups.slice(0, max - 1);
  const rest = groups.slice(max - 1);
  const other = rest.reduce(
    (a, g) => ({
      name: `Other (${rest.length})`,
      employees: a.employees + g.employees,
      salaries: a.salaries + g.salaries,
      bonuses: a.bonuses + g.bonuses,
      deductions: a.deductions + g.deductions,
      net: a.net + g.net,
    }),
    { name: "", employees: 0, salaries: 0, bonuses: 0, deductions: 0, net: 0 }
  );
  return [...head, other];
}

// Smooth curve through the points (Catmull-Rom converted to cubic Beziers).
// Control-point heights are clamped to the plot area so the curve never
// overshoots below the baseline or above the top of the chart.
function drawSmoothCurve(doc, pts, minY, maxY) {
  if (pts.length < 2) return;
  const clampY = (v) => Math.min(maxY, Math.max(minY, v));
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = clampY(p1.y + (p2.y - p0.y) / 6);
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = clampY(p2.y - (p3.y - p1.y) / 6);
    // jsPDF bezier segments are relative to the current point (p1)
    segs.push([c1x - p1.x, c1y - p1.y, c2x - p1.x, c2y - p1.y, p2.x - p1.x, p2.y - p1.y]);
  }
  doc.lines(segs, pts[0].x, pts[0].y, [1, 1], "S", false);
}

// ── Drawing blocks ───────────────────────────────────────────────────────────

function drawHeader(doc, { title, tag, period, currencyLabel, logo, compact }) {
  const h = compact ? 15 : 20;
  fill(doc, C.primary);
  doc.rect(0, 0, PW, h, "F");
  fill(doc, C.royal);
  doc.rect(0, h, PW, 1.2, "F");

  let tx = M;
  if (logo && !compact) {
    fill(doc, C.white);
    doc.roundedRect(M, 3, 14, 14, 2, 2, "F");
    try {
      const p = doc.getImageProperties(logo.dataUrl);
      const box = 12, ratio = Math.min(box / p.width, box / p.height);
      const iw = p.width * ratio, ih = p.height * ratio;
      doc.addImage(logo.dataUrl, logo.format, M + 1 + (box - iw) / 2, 4 + (box - ih) / 2, iw, ih);
    } catch { /* logo is optional */ }
    tx = M + 19;
  }

  ink(doc, C.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(compact ? 12 : 16);
  doc.text(title, tx, compact ? 9.5 : 10);
  if (!compact) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    ink(doc, C.pale);
    doc.text(tag, tx, 15.5);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(compact ? 10 : 13);
  ink(doc, C.white);
  doc.text(period, PW - M, compact ? 9.5 : 10, { align: "right" });
  if (!compact) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    ink(doc, C.pale);
    doc.text(currencyLabel, PW - M, 15.5, { align: "right" });
  }
  return h + 1.2;
}

// Coin-stack icon (same idea as the template): 3 slabs + a circle with a glyph.
function drawIcon(doc, x, y, color, glyph) {
  fill(doc, color);
  doc.roundedRect(x, y + 1.5, 10, 2.6, 1.2, 1.2, "F");
  doc.roundedRect(x, y + 5.3, 10, 2.6, 1.2, 1.2, "F");
  doc.roundedRect(x, y + 9.1, 10, 2.6, 1.2, 1.2, "F");
  fill(doc, color);
  stroke(doc, C.white);
  doc.setLineWidth(0.7);
  doc.circle(x + 9.8, y + 10.2, 4.3, "FD");
  ink(doc, C.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(glyph, x + 9.8, y + 13.1, { align: "center" });
}

function drawKpis(doc, y, kpis) {
  const gap = 4, w = (CW - gap * 3) / 4, h = 22;
  kpis.forEach((k, i) => {
    const x = M + i * (w + gap);
    fill(doc, C.tint);
    stroke(doc, C.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, w, h, 2.5, 2.5, "FD");
    fill(doc, k.color);
    doc.roundedRect(x, y + 3, 1.2, h - 6, 0.6, 0.6, "F");

    drawIcon(doc, x + 6, y + 4, k.color, k.glyph);

    ink(doc, k.color);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text(k.label, x + 24, y + 8.5);

    doc.setFontSize(15);
    let fs = 15;
    while (doc.getTextWidth(k.value) > w - 27 && fs > 9) { fs -= 0.5; doc.setFontSize(fs); }
    doc.text(k.value, x + 24, y + 16.5);
  });
  return y + h;
}

function sectionTitle(doc, x, y, text) {
  fill(doc, C.royal);
  doc.roundedRect(x, y - 3.2, 1.4, 4.2, 0.5, 0.5, "F");
  ink(doc, C.ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text(text, x + 3.2, y);
}

function panel(doc, x, y, w, h) {
  stroke(doc, C.border);
  doc.setLineWidth(0.3);
  fill(doc, C.white);
  doc.roundedRect(x, y, w, h, 2.5, 2.5, "FD");
}

function drawSector(doc, cx, cy, r, a0, a1, rgb) {
  const steps = Math.max(2, Math.ceil((a1 - a0) / (Math.PI / 60)));
  const pts = [[cx, cy]];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  const segs = [];
  for (let i = 1; i < pts.length; i++) segs.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
  fill(doc, rgb);
  stroke(doc, C.white);
  doc.setLineWidth(0.6);
  doc.lines(segs, pts[0][0], pts[0][1], [1, 1], "FD", true);
}

// Donut + legend. items: [{ name, value }]
function drawDonut(doc, { x, y, w, h, items, centerTop, centerBottom }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  const r = Math.min(h - 4, 46) / 2, cx = x + r + 4, cy = y + h / 2;
  if (total <= 0) {
    ink(doc, C.muted); doc.setFont("helvetica", "italic"); doc.setFontSize(8);
    doc.text("No data", x + w / 2, cy, { align: "center" });
    return;
  }
  let a = -Math.PI / 2;
  items.forEach((it, i) => {
    const sweep = (it.value / total) * Math.PI * 2;
    if (sweep <= 0) return;
    if (items.filter((q) => q.value > 0).length === 1) {
      fill(doc, SLICES[i % SLICES.length]);
      doc.circle(cx, cy, r, "F");
    } else {
      drawSector(doc, cx, cy, r, a, a + sweep, SLICES[i % SLICES.length]);
    }
    a += sweep;
  });
  fill(doc, C.white);
  doc.circle(cx, cy, r * 0.58, "F");
  ink(doc, C.navy); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
  doc.text(centerTop, cx, cy + 0.5, { align: "center" });
  ink(doc, C.muted); doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
  doc.text(centerBottom, cx, cy + 4, { align: "center" });

  // legend
  const lx = cx + r + 8, lw = x + w - lx - 3;
  const rowH = Math.min(5.6, (h - 4) / items.length);
  let ly = cy - (items.length * rowH) / 2 + rowH * 0.7;
  items.forEach((it, i) => {
    fill(doc, SLICES[i % SLICES.length]);
    doc.roundedRect(lx, ly - 2.6, 3, 3, 0.6, 0.6, "F");
    const pct = ((it.value / total) * 100).toFixed(1) + "%";
    doc.setFont("helvetica", "bold"); doc.setFontSize(7);
    ink(doc, C.ink);
    doc.text(pct, lx + lw, ly, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.text(fitText(doc, it.name, lw - 4.5 - 12), lx + 4.5, ly);
    ly += rowH;
  });
}

// One bar per category: salaries (blue), bonuses (green) and deductions (red)
// are drawn on top of each other from the baseline, tallest first, so the
// smaller values always stay visible in front. A smooth "Net Payable" curve is
// laid over the bars.
// cats: [{name, salaries, bonuses, deductions, net}]
function drawGroupedBars(doc, { x, y, w, h, cats, money }) {
  // x-axis titles are written diagonally (45 degrees) so many categories fit
  // side by side. The space reserved under the axis follows the longest title.
  const LABEL_ANGLE = 45, LABEL_MAX_W = 22, LABEL_FS = 6;
  const SIN = Math.sin((LABEL_ANGLE * Math.PI) / 180), COS = Math.cos((LABEL_ANGLE * Math.PI) / 180);
  doc.setFont("helvetica", "normal"); doc.setFontSize(LABEL_FS);
  const labelTexts = cats.map((c) => fitText(doc, c.name, LABEL_MAX_W));
  const longest = Math.max(0, ...labelTexts.map((t) => doc.getTextWidth(t)));

  const axisW = 17, legendH = 6;
  const labelH = Math.min(longest * SIN + 4, 18);
  const px = x + axisW, py = y + legendH, pw = w - axisW - 2, ph = h - legendH - labelH;
  const keys = ["salaries", "bonuses", "deductions"];
  const names = { salaries: "Salaries", bonuses: "Bonuses", deductions: "Deductions" };

  // legend (top-right) - bar series first, then the "Net Payable" line marker.
  doc.setFont("helvetica", "normal"); doc.setFontSize(7);
  let lx = x + w - 2;
  const lineLabel = "Net Payable";
  lx -= doc.getTextWidth(lineLabel);
  ink(doc, C.ink); doc.text(lineLabel, lx, y + 3);
  lx -= 7;
  stroke(doc, LINE_COLOR); doc.setLineWidth(0.8);
  doc.line(lx - 6, y + 2.1, lx, y + 2.1);
  fill(doc, LINE_COLOR); doc.circle(lx - 3, y + 2.1, 0.9, "F");
  lx -= 9;
  [...keys].reverse().forEach((k) => {
    const tw = doc.getTextWidth(names[k]);
    lx -= tw;
    ink(doc, C.ink); doc.text(names[k], lx, y + 3);
    lx -= 4.2;
    fill(doc, SERIES_COLORS[k]); doc.roundedRect(lx, y + 0.6, 3, 3, 0.6, 0.6, "F");
    lx -= 5;
  });

  const max = Math.max(0, ...cats.flatMap((c) => keys.map((k) => c[k])), ...cats.map((c) => c.net || 0));
  const { top, step } = niceScale(max, 4);
  doc.setLineWidth(0.2);
  for (let v = 0; v <= top + step / 1000; v += step) {
    const gy = py + ph - (v / top) * ph;
    stroke(doc, C.grid); doc.line(px, gy, px + pw, gy);
    ink(doc, C.muted); doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
    doc.text(money.compact(v), px - 1.8, gy + 0.8, { align: "right" });
  }

  const n = cats.length || 1, gw = pw / n;
  const bw = Math.max(1.2, Math.min(gw * 0.7, 7)); // thin bars so every category fits
  const showValues = gw >= 7;                      // value labels only when there is room
  cats.forEach((c, i) => {
    const bx = px + i * gw + (gw - bw) / 2;

    // series for this category, tallest first so the shorter ones sit in front
    const series = keys
      .filter((k) => c[k] > 0)
      .map((k) => ({
        k,
        // tiny values still get a visible sliver
        bh: Math.max(top > 0 ? (c[k] / top) * ph : 0, 0.7),
      }))
      .sort((a, b) => b.bh - a.bh);

    series.forEach((s) => {
      fill(doc, SERIES_COLORS[s.k]);
      stroke(doc, C.white); doc.setLineWidth(0.3);
      doc.rect(bx, py + ph - s.bh, bw, s.bh, "FD");
    });

    // value labels: above each bar, or inside it when two labels would collide
    const placed = [];
    (showValues ? series : []).forEach((s) => {
      const barTop = py + ph - s.bh;
      let ly = barTop - 0.9;
      let inside = false;
      if (placed.some((p) => Math.abs(p - ly) < 2.4)) {
        if (s.bh < 3.4) return; // no room - the table below carries the figure
        ly = barTop + 2.4;
        inside = true;
      }
      ink(doc, inside ? C.white : C.muted);
      doc.setFont("helvetica", "normal"); doc.setFontSize(5.5);
      doc.text(money.bare(c[s.k]), bx + bw / 2, ly, { align: "center" });
      placed.push(ly);
    });

    // category label: diagonal, its end sits just under the bar centre and the
    // text runs down and to the left. Start point is worked out by hand because
    // right-alignment is unreliable together with a rotation angle.
    ink(doc, C.ink); doc.setFont("helvetica", "normal"); doc.setFontSize(LABEL_FS);
    const txt = labelTexts[i];
    const tw = doc.getTextWidth(txt);
    const ax = px + i * gw + gw / 2 + 1;   // anchor (end of the text)
    const ay = py + ph + 2.6;
    doc.text(txt, ax - tw * COS, ay + tw * SIN, { angle: LABEL_ANGLE });
  });
  stroke(doc, C.slate); doc.setLineWidth(0.3);
  doc.line(px, py + ph, px + pw, py + ph);

  // Net-payable trend: one point per category, joined by a smooth curve.
  const linePts = cats.map((c, i) => ({
    x: px + i * gw + gw / 2,
    y: py + ph - (top > 0 ? ((c.net || 0) / top) * ph : 0),
  }));
  if (linePts.length > 1) {
    stroke(doc, LINE_COLOR); doc.setLineWidth(0.7);
    drawSmoothCurve(doc, linePts, py, py + ph);
  }
  linePts.forEach((p) => {
    fill(doc, LINE_COLOR); stroke(doc, LINE_DOT); doc.setLineWidth(0.5);
    doc.circle(p.x, p.y, 1.1, "FD");
  });
}

// Ranked horizontal bars with a light-to-dark blue gradient by rank.
function drawRankedBars(doc, { x, y, w, h, items, money }) {
  if (!items.length) return;
  const labelW = 42, valueW = 26;
  const rowH = Math.min(8, h / items.length);
  const maxV = Math.max(...items.map((i) => i.value), 1);
  const barMax = w - labelW - valueW - 4;
  items.forEach((it, i) => {
    const ry = y + i * rowH;
    doc.setFont("helvetica", "normal"); doc.setFontSize(7);
    ink(doc, C.ink);
    doc.text(fitText(doc, it.name, labelW - 2), x, ry + rowH / 2 + 1);
    fill(doc, C.band);
    doc.roundedRect(x + labelW, ry + 1, barMax, rowH - 2, 1, 1, "F");
    const t = items.length > 1 ? i / (items.length - 1) : 0;
    const rgb = [0, 1, 2].map((k) => Math.round(C.primary[k] + (C.sky[k] - C.primary[k]) * t));
    fill(doc, rgb);
    const bw = Math.max(1.5, (it.value / maxV) * barMax);
    doc.roundedRect(x + labelW, ry + 1, bw, rowH - 2, 1, 1, "F");
    doc.setFont("helvetica", "bold");
    ink(doc, C.navy);
    doc.text(money.full(it.value), x + labelW + barMax + 3, ry + rowH / 2 + 1);
  });
}

// Table with header, banded rows, total row and automatic page continuation.
function drawTable(doc, { x, y, cols, rows, total, rowH = 5.6, headH = 6.6, onNewPage }) {
  const totalW = cols.reduce((s, c) => s + c.w, 0);

  const head = (yy) => {
    fill(doc, C.header);
    doc.rect(x, yy, totalW, headH, "F");
    ink(doc, C.white); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
    let cx = x;
    cols.forEach((c) => {
      if (c.align === "right") doc.text(c.label, cx + c.w - 2.5, yy + 4.4, { align: "right" });
      else doc.text(c.label, cx + 2.5, yy + 4.4);
      cx += c.w;
    });
    return yy + headH;
  };

  const drawRow = (r, yy, opts = {}) => {
    if (opts.total) { fill(doc, C.pale); doc.rect(x, yy, totalW, rowH + 0.6, "F"); }
    else if (opts.band) { fill(doc, C.band); doc.rect(x, yy, totalW, rowH, "F"); }
    ink(doc, opts.total ? C.navy : C.ink);
    doc.setFont("helvetica", opts.total ? "bold" : "normal");
    doc.setFontSize(7.5);
    let cx = x;
    cols.forEach((c) => {
      const txt = String(c.get(r));
      const ty = yy + (opts.total ? rowH + 0.6 : rowH) / 2 + 1.2;
      if (c.align === "right") doc.text(txt, cx + c.w - 2.5, ty, { align: "right" });
      else doc.text(fitText(doc, txt, c.w - 5), cx + 2.5, ty);
      cx += c.w;
    });
    if (!opts.total) { stroke(doc, C.grid); doc.setLineWidth(0.15); doc.line(x, yy + rowH, x + totalW, yy + rowH); }
  };

  let yy = head(y);
  rows.forEach((r, i) => {
    if (yy + rowH > BOTTOM - (i === rows.length - 1 ? rowH + 1 : 0)) {
      yy = onNewPage ? onNewPage() : (doc.addPage(), 20);
      yy = head(yy);
    }
    drawRow(r, yy, { band: i % 2 === 1 });
    yy += rowH;
  });
  if (total) {
    if (yy + rowH + 0.6 > BOTTOM) { yy = onNewPage ? onNewPage() : (doc.addPage(), 20); yy = head(yy); }
    drawRow(total, yy, { total: true });
    yy += rowH + 0.6;
  }
  return yy;
}

function drawFooters(doc, { company, generatedBy, generatedAt }) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    stroke(doc, C.border); doc.setLineWidth(0.3);
    doc.line(M, 202, PW - M, 202);
    ink(doc, C.muted); doc.setFont("helvetica", "normal"); doc.setFontSize(7);
    doc.text(`${company}  |  Confidential - for internal use only`, M, 206);
    doc.text(
      `Generated ${generatedAt}${generatedBy ? ` by ${clean(generatedBy)}` : ""}`,
      PW / 2, 206, { align: "center" }
    );
    doc.text(`Page ${i} of ${n}`, PW - M, 206, { align: "right" });
  }
}

// ── Public API ───────────────────────────────────────────────────────────────
/**
 * @param {object}   opts
 * @param {object[]} opts.rows        rows from /api/payroll/computed/ (all pages)
 * @param {number}   opts.year
 * @param {number}   opts.month       1-12
 * @param {string}   [opts.currency]  "USD" (default) or "ZIG"
 * @param {number}   [opts.zigRate]   1 USD = ? ZiG (only used when currency is "ZIG")
 * @param {string}   [opts.generatedBy]
 * @param {string}   [opts.company]
 * @param {{dataUrl:string, format:string}} [opts.logo]
 * @returns {{ doc: jsPDF, filename: string }}
 */
export function buildFinanceReport({
  rows, year, month, currency = "USD", zigRate = 1,
  generatedBy = "", company = "JECCA ENGINEERING (PVT) LTD", logo = null,
}) {
  const money = makeMoney(currency, zigRate);
  const onPayroll = rows.filter((r) => r.payroll_id != null);
  const periodLabel = `${MONTHS[month - 1]} ${year}`;
  const currencyLabel = currency === "ZIG" ? `Currency: ZiG (1 USD = ${zigRate} ZiG)` : "Currency: USD";
  const now = new Date();
  const generatedAt = now.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  // totals
  const sum = (key) => onPayroll.reduce((s, r) => s + money.conv(r[key]), 0);
  const totals = {
    salaries: sum("net_salary"), bonuses: sum("bonus"),
    deductions: sum("deduction"), net: sum("final_pay"),
  };
  const monthly = onPayroll.filter((r) => !r.is_daily).length;
  const daily = onPayroll.length - monthly;
  const kpis = [
    { label: "TOTAL SALARIES",   value: money.full(totals.salaries),   color: C.navy,  glyph: "$" },
    { label: "TOTAL BONUSES",    value: money.full(totals.bonuses),    color: C.royal, glyph: "+" },
    { label: "TOTAL DEDUCTIONS", value: money.full(totals.deductions), color: C.steel, glyph: "-" },
    { label: "NET PAYABLE",      value: money.full(totals.net),        color: C.ocean, glyph: "=" },
  ];

  const byDept = groupRows(onPayroll, (r) => r.department_name, "Unassigned", money.conv);
  const bySite = groupRows(onPayroll, (r) => r.site_name, "No site assigned", money.conv);
  const byJobTitle = groupRows(onPayroll, (r) => r.job_title, "Unspecified", money.conv);
  const byPayType = groupRows(onPayroll, (r) => (r.is_daily ? "Daily" : "Monthly"), "Unspecified", money.conv);
  const byGender = groupRows(onPayroll, (r) => GENDER_LABELS[r.gender] || "Unspecified", "Unspecified", money.conv);

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setProperties({ title: `Payroll Summary Report - ${periodLabel}`, author: company });

  const tag = (t) => `${clean(company)}  |  ${t}  |  ${onPayroll.length} employees (${monthly} monthly, ${daily} daily)`;

  // label -> first-column header shown in the summary table
  const COL_LABELS = {
    department: "Department", site: "Site", "job title": "Job Title",
    "pay type": "Pay Type", gender: "Gender",
  };
  const cols = (firstLabel) => {
    const share = (r) => (totals.net > 0 ? ((r.net / totals.net) * 100).toFixed(1) + "%" : "0.0%");
    return [
      { label: firstLabel,             w: 70, get: (r) => r.name },
      { label: "Employees",            w: 26, align: "right", get: (r) => r.employees },
      { label: "Total Salaries",       w: 40, align: "right", get: (r) => money.num(r.salaries) },
      { label: "Bonuses",              w: 34, align: "right", get: (r) => money.num(r.bonuses) },
      { label: "Deductions",           w: 34, align: "right", get: (r) => money.num(r.deductions) },
      { label: "Net Payable",          w: 42, align: "right", get: (r) => money.num(r.net) },
      { label: "% of Net Payable",     w: 31, align: "right", get: share },
    ];
  };
  const totalRow = {
    name: "TOTAL", employees: onPayroll.length, salaries: totals.salaries,
    bonuses: totals.bonuses, deductions: totals.deductions, net: totals.net,
  };

  // Builds one full page (header, totals, two charts, table) for a grouping.
  const buildPage = ({ groups, pageTag, label, tableTitle, left }) => {
    let y = drawHeader(doc, {
      title: "Payroll Summary Report", tag: tag(pageTag), period: periodLabel, currencyLabel, logo,
    });
    y = drawKpis(doc, y + 4, kpis);

    // Row A: two chart panels
    const ay = y + 4, ah = 62;
    const lw = 100, rx = M + lw + 4, rw = CW - lw - 4;
    panel(doc, M, ay, lw, ah);
    panel(doc, rx, ay, rw, ah);

    const chartGroups = topWithOther(groups, 8);
    if (left === "donut") {
      sectionTitle(doc, M + 4, ay + 6.5, `Net pay by ${label}`);
      drawDonut(doc, {
        x: M + 2, y: ay + 9, w: lw - 4, h: ah - 12,
        items: chartGroups.map((g) => ({ name: g.name, value: g.net })),
        centerTop: money.compact(totals.net), centerBottom: "net payable",
      });
    } else {
      sectionTitle(doc, M + 4, ay + 6.5, `Net pay by ${label} (ranked)`);
      drawRankedBars(doc, {
        x: M + 4, y: ay + 11, w: lw - 8, h: ah - 15,
        items: topWithOther(groups, 7).map((g) => ({ name: g.name, value: g.net })), money,
      });
    }

    sectionTitle(doc, rx + 4, ay + 6.5, `Salaries, bonuses & deductions by ${label}`);
    drawGroupedBars(doc, {
      x: rx + 4, y: ay + 9, w: rw - 8, h: ah - 11,
      cats: topWithOther(groups, 40), money, // every department / site / title (40 is only a safety cap)
    });

    // Row B: table
    const by = ay + ah + 5;
    sectionTitle(doc, M, by + 1, `${tableTitle} (${currency === "ZIG" ? "ZiG" : "USD"})`);
    drawTable(doc, {
      x: M, y: by + 4, cols: cols(COL_LABELS[label] || label),
      rows: groups, total: totalRow,
      onNewPage: () => {
        doc.addPage();
        const hy = drawHeader(doc, {
          title: "Payroll Summary Report", tag: "", period: periodLabel, currencyLabel, logo: null, compact: true,
        });
        sectionTitle(doc, M, hy + 8, `${tableTitle} (continued)`);
        return hy + 11;
      },
    });
  };

  // Page 1 - by department
  buildPage({
    groups: byDept, pageTag: "Department Breakdown", label: "department",
    tableTitle: "Department payroll summary", left: "donut",
  });

  // Page 2 - by site
  doc.addPage();
  buildPage({
    groups: bySite, pageTag: "Site Breakdown", label: "site",
    tableTitle: "Site payroll summary", left: "ranked",
  });

  // Page 3 - by type of payable (monthly / daily)
  doc.addPage();
  buildPage({
    groups: byPayType, pageTag: "Pay Type Breakdown", label: "pay type",
    tableTitle: "Pay type payroll summary", left: "donut",
  });

  // Page 4 - by gender
  doc.addPage();
  buildPage({
    groups: byGender, pageTag: "Gender Breakdown", label: "gender",
    tableTitle: "Gender payroll summary", left: "donut",
  });

  // Last - by job title (can run onto extra pages when there are many titles)
  doc.addPage();
  buildPage({
    groups: byJobTitle, pageTag: "Job Title Breakdown", label: "job title",
    tableTitle: "Job title payroll summary", left: "ranked",
  });

  drawFooters(doc, { company, generatedBy, generatedAt });

  return { doc, filename: `Finance_Report_${MONTHS[month - 1]}_${year}.pdf` };
}