// src/utils/workingDaysOverride.js
//
// Months where pay is divided over a fixed number of days instead of the usual
// "weekdays minus ZW public holidays" count.
//   October 2026: 26 days. Weekend / holiday days worked are credited against
//   missing days (same "extra day credit" rule as always), so an employee who
//   works through weekends/holidays still reaches a full 26.
//
// To add another special month, add "YYYY-MM": days below AND the same entry in
// backend/payroll/payroll_calc.py (WORKING_DAYS_OVERRIDES).

export const WORKING_DAYS_OVERRIDES = {
    "2026-10": 26,
  };
  
  // month0 is 0-based (Jan = 0), like JS Date. Returns null when there is no override.
  export function workingDaysOverride(year, month0) {
    const v = WORKING_DAYS_OVERRIDES[`${year}-${String(month0 + 1).padStart(2, "0")}`];
    return typeof v === "number" ? v : null;
  }