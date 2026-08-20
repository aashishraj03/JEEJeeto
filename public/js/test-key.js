// ===== Shared exam hierarchy data & key builder =====
// Used by select-pyq.html, admin.html, and test-engine.js so the
// key format stays consistent everywhere. Update EXAM_YEARS as new
// papers become available.

const EXAM_YEARS = [2025, 2024, 2023, 2022, 2021, 2020, 2019];

const MAIN_SESSIONS = [
  { value: "jan", label: "January Session" },
  { value: "apr", label: "April Session" }
];

const MAIN_SHIFTS = [
  { value: "1", label: "Shift 1 (Morning)" },
  { value: "2", label: "Shift 2 (Afternoon)" }
];

const ADVANCED_PAPERS = [
  { value: "1", label: "Paper 1" },
  { value: "2", label: "Paper 2" }
];

// Builds the questionBank key from a set of selections.
// Main:     { exam: "main", year, session, shift }      -> "main-2024-apr-shift1"
// Advanced: { exam: "advanced", year, paper }            -> "advanced-2024-paper1"
function buildTestKey({ exam, year, session, shift, paper }) {
  if (exam === "advanced") {
    return `advanced-${year}-paper${paper}`;
  }
  return `main-${year}-${session}-shift${shift}`;
}