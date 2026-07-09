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