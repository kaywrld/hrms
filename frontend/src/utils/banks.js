// src/utils/banks.js
//
// Single source of truth for the Zimbabwean commercial bank list used by
// every bank-name dropdown in the app (Add Employee, Edit Employee, etc).
// Keep this in sync with the backend's copy in backend/employees/bulk_import.py
// (BANK_ALIASES / ZW_BANKS) so manually-picked names and Excel-imported names
// always resolve to the same canonical strings.

export const ZW_BANKS = [
  "CBZ Bank", "Stanbic Bank Zimbabwe", "Standard Chartered Bank Zimbabwe",
  "Steward Bank", "CABS (Central Africa Building Society)", "FBC Bank",
  "NMB Bank", "ZB Bank", "Nedbank Zimbabwe", "Ecobank Zimbabwe",
  "First Capital Bank", "BancABC (African Banking Corporation)",
  "POSB (People's Own Savings Bank)", "Agribank",
  "Metbank", "National Building Society (NBS)",
];

// ── SWIFT / branch codes ─────────────────────────────────────────────────────
//
// One entry per bank in ZW_BANKS (same order, same canonical `name`).
//   short   → the short label printed in the "Bank" column of the bank
//             payment schedule (matches the schedules HR already sends).
//   swift   → the code printed in the "BranchCode" column.
//   aliases → other spellings/old names that should resolve to this bank
//             (used when a stored bank name isn't exactly the dropdown value).
//
// Source of each code:
//   [schedule] taken from your September USD / ZWG salary schedules
//   [public]   taken from public SWIFT directories — not in your schedules,
//              so confirm these with the bank before the first live payment.
//
// To change a code, edit it here — it is picked up everywhere automatically.
export const BANK_DIRECTORY = [
{ name: "CBZ Bank",                              short: "CBZ",                swift: "COBZZWHA", aliases: ["cbz"] },                                                   // [schedule]
{ name: "Stanbic Bank Zimbabwe",                 short: "STANBIC",            swift: "SBICZWHX", aliases: ["stanbic"] },                                               // [public]
{ name: "Standard Chartered Bank Zimbabwe",      short: "STANDARD CHARTERED", swift: "SCBLZWHX", aliases: ["standard chartered", "stanchart", "scb"] },                // [public]
// TN CyberTech was Steward Bank's former name — your schedules print it with STBLZWHX.
{ name: "Steward Bank",                          short: "STEWARD",            swift: "STBLZWHX", aliases: ["steward", "tn cybertech", "tn cyberbank", "tn bank"] },    // [schedule]
{ name: "CABS (Central Africa Building Society)",short: "CABS",               swift: "CABSZWHA", aliases: ["cabs", "central africa building society"] },               // [schedule]
{ name: "FBC Bank",                              short: "FBC",                swift: "FBCPZWHA", aliases: ["fbc"] },                                                   // [public]
{ name: "NMB Bank",                              short: "NMB",                swift: "NMBLZWHX", aliases: ["nmb"] },                                                   // [schedule]
{ name: "ZB Bank",                               short: "ZB",                 swift: "ZBCOZWHX", aliases: ["zb", "zimbank", "zimbabwe banking corporation"] },         // [schedule]
{ name: "Nedbank Zimbabwe",                      short: "NEDBANK",            swift: "MBCAZWHX", aliases: ["nedbank", "mbca"] },                                       // [schedule]
{ name: "Ecobank Zimbabwe",                      short: "ECOBANK",            swift: "ECOCZWHX", aliases: ["ecobank"] },                                               // [public]
// First Capital Bank was formerly Barclays Zimbabwe — hence the BARC code.
{ name: "First Capital Bank",                    short: "FCB",                swift: "BARCZWHX", aliases: ["fcb", "first capital", "barclays"] },                      // [schedule]
{ name: "BancABC (African Banking Corporation)", short: "BANCABC",            swift: "FMBZZWHX", aliases: ["bancabc", "banc abc", "african banking corporation", "african banking corp"] }, // [schedule]
{ name: "POSB (People's Own Savings Bank)",      short: "POSB",               swift: "PWSBZWHX", aliases: ["posb", "peoples own savings bank", "people s own savings bank"] }, // [schedule]
{ name: "Agribank",                              short: "AGRIBANK",           swift: "AGRZZWHA", aliases: ["agricultural bank of zimbabwe", "agricultural bank"] },    // [public]
{ name: "Metbank",                               short: "METBANK",            swift: "MBOZZWHA", aliases: ["met bank"] },                                              // [public]
{ name: "National Building Society (NBS)",       short: "NBS",                swift: "NABYZWHA", aliases: ["nbs", "national building society"] },                     // [public]
];

// Lower-case, drop punctuation, collapse spaces: "People's Own" → "people s own".
const norm = (s) =>
String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Same, but also removes "(…)" text and filler words, so "NMB Bank Ltd" and
// "Nedbank Zimbabwe Limited" still reduce to something we can match.
const normLoose = (s) =>
norm(String(s || "").replace(/\(.*?\)/g, " "))
  .replace(/\b(bank|zimbabwe|limited|ltd|pvt|the)\b/g, " ")
  .replace(/\s+/g, " ")
  .trim();

// Build the lookup tables once, at load time.
const EXACT = new Map();   // full normalised text  → entry
const LOOSE = new Map();   // loosely normalised    → entry
BANK_DIRECTORY.forEach((b) => {
[b.name, b.short, ...b.aliases].forEach((key) => {
  EXACT.set(norm(key), b);
  const loose = normLoose(key);
  if (loose && !LOOSE.has(loose)) LOOSE.set(loose, b);
});
});

/** Find the directory entry for any stored/typed bank name, or null. */
export function findBank(bankName) {
if (!bankName) return null;
return EXACT.get(norm(bankName)) || LOOSE.get(normLoose(bankName)) || null;
}

/** SWIFT / branch code for a bank name ("" when the bank isn't in the directory). */
export function getSwiftCode(bankName) {
const b = findBank(bankName);
return b ? b.swift : "";
}

/** Short label for the "Bank" column (falls back to the name as typed). */
export function getBankShortName(bankName) {
const b = findBank(bankName);
return b ? b.short : String(bankName || "").trim();
}