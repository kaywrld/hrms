// src/utils/paymentSchedule.js
//
// Builds the "Salary/Trade Payments" Excel file that is sent to the bank for
// payment processing. The layout copies the schedules HR already uses
// (Jecca_<Month>_Salary_Schedule.xlsx for USD, ..._ZWG_Salary_Schedule.xlsx
// for ZiG): same columns, same order, same header text, same fonts/borders,
// a blank row after the last payment and a SUM total underneath.

import ExcelJS from "exceljs";
import { getSwiftCode, getBankShortName } from "./banks";

// ── Company-side details printed on every line ───────────────────────────────
// Change these here if the company's paying accounts ever change.
export const PAYMENT_FILE_CONFIG = {
  remitterName: "JECCA ENGINEERING",
  narration: "SALARY",
  remitterAccounts: {
    USD: "2926845670020",   // company USD account
    ZIG: "2926845670010",   // company ZWG account
  },
};

// The page uses "ZIG"; the bank schedules print "ZWG".
const currencyCode = (currency) => (currency === "ZIG" ? "ZWG" : "USD");

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// "2026-09-25" → "25.09.2026"
export function formatPayDate(iso) {
  const [y, m, d] = String(iso || "").split("-");
  return y && m && d ? `${d}.${m}.${y}` : "";
}

// A row is only payable if it has a real account on file. The payroll page
// fills missing banks with placeholder text ("No ZiG bank on file" / "—").
function hasBankOnFile(r) {
  const acct = String(r.bankAccount || "").trim();
  const bank = String(r.bankName || "").trim();
  if (!acct || acct === "—" || acct === "-") return false;
  if (!bank || /^no (usd|zig) bank/i.test(bank)) return false;
  return true;
}

/**
 * Turns the payroll export rows into payment lines.
 *  - `lines`   → rows that go in the file
 *  - `skipped` → people left out, with the reason (shown to HR before download)
 *  - `noSwift` → people included but whose bank has no SWIFT code on record
 */
export function buildPaymentLines(rows, currency) {
  const lines = [];
  const skipped = [];
  const noSwift = [];

  rows.forEach((r) => {
    const name = String(r.fullName || "").replace(/\s+/g, " ").trim() || "—";
    const amount = round2(r.finalPay);

    if (!(amount > 0)) {
      skipped.push({ name, reason: "Nothing payable this month" });
      return;
    }
    if (!hasBankOnFile(r)) {
      skipped.push({ name, reason: `No ${currency === "ZIG" ? "ZiG" : "USD"} bank account on file` });
      return;
    }

    const swift = getSwiftCode(r.bankName);
    if (!swift) noSwift.push({ name, bank: String(r.bankName).trim() });

    lines.push({
      name,
      bank: getBankShortName(r.bankName),
      swift,
      account: String(r.bankAccount).replace(/\s+/g, ""),
      amount,
    });
  });

  return { lines, skipped, noSwift };
}

/** Builds the workbook and triggers the browser download. */
export async function downloadPaymentSchedule({ lines, currency, payDate, batch = 1, filename }) {
  const code = currencyCode(currency);
  const isZig = currency === "ZIG";
  const FONT = { name: "Times New Roman", size: isZig ? 11 : 12, bold: true };
  const thin = { style: "thin" };
  const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
  const ACCOUNTING = '_(* #,##0.00_);_(* \\(#,##0.00\\);_(* "-"??_);_(@_)';
  const ACCOUNTING_USD = '_("$"* #,##0.00_);_("$"* \\(#,##0.00\\);_("$"* "-"??_);_(@_)';

  const wb = new ExcelJS.Workbook();
  wb.creator = "JECCA Engineering HRMS";
  wb.created = new Date();
  const ws = wb.addWorksheet("Sheet1", {
    pageSetup: { orientation: "landscape" },
  });

  // Column widths copied from the example schedules (widened only where bold
  // text would otherwise be cut off).
  const longest = (pick) => lines.reduce((m, l) => Math.max(m, String(pick(l)).length), 0);
  ws.columns = [
    { width: 14.29 },                                          // A Pay Date
    { width: Math.max(10.29, Math.ceil(longest((l) => l.bank) * 1.2) + 2) },    // B Bank
    { width: 14.29 },                                          // C BranchCode
    { width: Math.max(20, Math.ceil(longest((l) => l.account) * 1.2) + 2) },   // D Beneficiary Account
    { width: Math.max(24.29, Math.ceil(longest((l) => l.name) * 1.2) + 2) },   // E Recipient Name
    { width: 15.86 },                                          // F Amount
    { width: 10 },                                             // G Currency
    { width: 17.29 },                                          // H Remiter Account No.
    { width: 19.29 },                                          // I Narration
    { width: 18.29 },                                          // J REMMITER name
  ];

  // Rows 1–2: title + batch
  ws.getCell("A1").value = "Salary/Trade Payments";
  ws.getCell("A2").value = `BATCH ${batch}`;
  ["A1", "A2"].forEach((a) => {
    ws.getCell(a).font = FONT;
    ws.getCell(a).alignment = { horizontal: "left" };
  });

  // Row 3: headers (spelling of "Remiter" / "REMMITER  name" kept exactly as
  // in the existing schedules in case the bank's template matches on it).
  const headers = [
    ["Pay Date", "left"], ["Bank", "left"], ["BranchCode", "left"],
    ["Beneficiary Account", "left"], ["Recipient Name", undefined],
    ["Amount", "left"], ["Currency", "center"], ["Remiter Account No.", "left"],
    ["Narration", "center"], ["REMMITER  name", undefined],
  ];
  headers.forEach(([text, h], i) => {
    const c = ws.getCell(3, i + 1);
    c.value = text;
    c.font = FONT;
    c.border = BORDER;
    if (h) c.alignment = { horizontal: h };
  });

  // Row 4 stays blank (as in the examples). Payments start on row 5.
  const FIRST = 5;
  const dateText = formatPayDate(payDate);
  const remitterAcct = PAYMENT_FILE_CONFIG.remitterAccounts[isZig ? "ZIG" : "USD"];

  lines.forEach((l, i) => {
    const r = FIRST + i;
    const values = [
      dateText, l.bank, l.swift, l.account, l.name, l.amount,
      code, remitterAcct, PAYMENT_FILE_CONFIG.narration, PAYMENT_FILE_CONFIG.remitterName,
    ];
    const aligns = ["left", "left", "left", undefined, undefined, undefined, "center", "left", "center", undefined];
    values.forEach((v, c) => {
      const cell = ws.getCell(r, c + 1);
      cell.value = v;                       // account + date stay text, so leading zeros survive
      cell.font = FONT;
      cell.border = BORDER;
      if (aligns[c]) cell.alignment = { horizontal: aligns[c] };
    });
    ws.getCell(r, 4).numFmt = "@";          // Beneficiary Account as text
    ws.getCell(r, 6).numFmt = ACCOUNTING;   // Amount
  });

  // Blank row, then the total (same position/formula pattern as the examples).
  const last = FIRST + lines.length - 1;
  const totalRow = last + 2;
  const total = round2(lines.reduce((s, l) => s + l.amount, 0));
  const t = ws.getCell(totalRow, 6);
  t.value = { formula: `SUM(F${FIRST}:F${last + 1})`, result: total };
  t.font = FONT;
  t.numFmt = isZig ? ACCOUNTING : ACCOUNTING_USD;
  t.alignment = { horizontal: "left" };

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);

  return { count: lines.length, total };
}