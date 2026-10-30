// ===== Shared exam hierarchy data & key builder =====
// Used by tests.html, admin.html, and test-engine.js so the
// key format stays consistent everywhere. Update JEE_CLASSES as
// new tests become available.

const JEE_CLASSES = [12, 11];

// Two test series on the portal:
//   "chapter" - chapter-wise tests for Class 11 and Class 12 (keys start with c11- / c12-)
//   "jee"     - JEE papers, one exam sitting each (keys start with jm- / ja-)
const TEST_SERIES = [
  { value: "chapter", label: "Chapter-wise Test Series (Class 11 & 12)" },
  { value: "jee", label: "JEE Test Series" }
];

const TEST_TYPES = [
  { value: "practice", label: "Chapter Practice Test", series: "chapter" },
  { value: "revision", label: "Unit Revision Mock", series: "chapter" },
  { value: "full", label: "Full Syllabus Grand Mock", series: "chapter" },
  { value: "subject", label: "Subject-Wide Test", series: "chapter" },
  { value: "mock", label: "Random Mixed Mock", series: "chapter" },
  { value: "paper", label: "Full Paper (one exam sitting)", series: "jee" }
];

// Which series a test key belongs to: "jee", "chapter", or null if unrecognised.
function getTestSeries(key) {
  const k = String(key || "").toLowerCase();
  if (/^j[ma]-/.test(k)) return "jee";
  if (/^c\d+-/.test(k)) return "chapter";
  return null;
}

const SUBJECTS = [
  { value: "phy", label: "Physics" },
  { value: "chem", label: "Chemistry" },
  { value: "math", label: "Mathematics" }
];

// Builds the testKey from a set of selections.
// Full Paper (JEE Main):     { type: "paper", exam: "jm", year: 2026, month: 4, day: 2, shift: "morning" } -> "jm-2026-04-02-morning"
// Full Paper (JEE Advanced): { type: "paper", exam: "ja", year: 2025, paperNum: 1 }                       -> "ja-2025-p1"
// Chapter Practice:          { classNum: 11, subject: "phy", type: "practice", chapter: "02" }            -> "c11-phy-02"
// Revision Mock:             { classNum: 11, subject: "chem", type: "revision", testNum: 1 }              -> "c11-chem-rev-01"
// Full Syllabus:             { classNum: 12, subject: "math", type: "full" }                              -> "c12-math-full"
// Subject-wide:              { classNum: 11, subject: "phy", type: "subject" }                            -> "c11-phy-subject"
// Random mixed mock:         { classNum: 12, type: "mock" }                                               -> "c12-mock"
function buildTestKey({ classNum, subject, type = "practice", chapter, testNum = 1, exam, year, month, day, shift, paperNum }) {
  const pad2 = n => String(n).padStart(2, '0');
  const padNum = pad2(testNum);

  // One exam sitting, built from the exam, date and shift.
  if (type === "paper") {
    if (exam === "ja") return `ja-${year}-p${paperNum}`;
    return `jm-${year}-${pad2(month)}-${pad2(day)}-${shift}`;
  }
  if (type === "full") {
    return `c${classNum}-${subject}-full`;
  }
  if (type === "revision") {
    return `c${classNum}-${subject}-rev${chapter ? `-${chapter}` : `-${padNum}`}`;
  }
  // Subject-wide: every chapter question for one class+subject, shuffled server-side.
  if (type === "subject") {
    return `c${classNum}-${subject}-subject`;
  }
  // Random mixed mock: pulls from all subjects for the class, shuffled server-side.
  if (type === "mock") {
    return `c${classNum}-mock`;
  }

  // Default chapter practice test
  return `c${classNum}-${subject}-${chapter || padNum}`;
}