// ===== Test keys for the JEE portal =====
// Shared by tests.html, admin.html and test-engine.js so keys stay consistent.
// Everything about a test (title, session, duration, marking) is DERIVED from
// its key, so questions-data.js never repeats it.
//
//   JEE paper (one sitting):  jm-2026-04-08-evening = JEE Main, 8 April 2026, evening
//                             jm-2026-04-02-morning = JEE Main, 2 April 2026, morning
//                             (short forms -m / -e are accepted too)
//   Chapter test:             c11-phy-03        = Class 11, Physics, chapter 03

const JEE_CLASSES = [12, 11];

const SUBJECTS = [
  { value: "phy", label: "Physics" },
  { value: "chem", label: "Chemistry" },
  { value: "math", label: "Mathematics" }
];

const SHIFTS = [
  { value: "morning", label: "Morning", number: 1 },
  { value: "evening", label: "Evening", number: 2 }
];

const MARKING_JEE = {
  mcq: { correct: 4, wrong: -1 },
  numerical: { correct: 4, wrong: 0 }
};

// One line per exam. "jm" = JEE Main. Add another exam by adding a line.
const EXAMS = {
  jm: { name: "JEE Main", durationMin: 180, marking: MARKING_JEE }
};

const CHAPTER_TEST = { durationMin: 60, marking: MARKING_JEE };

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

const pad2 = n => String(n).padStart(2, "0");

// Paper:   buildTestKey({ exam: "jm", year: 2026, month: 4, day: 2, shift: "morning" })
// Chapter: buildTestKey({ classNum: 11, subject: "phy", chapter: 3 })
function buildTestKey(o) {
  if (o.classNum) return `c${o.classNum}-${o.subject}-${pad2(o.chapter || 1)}`;
  return `${o.exam || "jm"}-${o.year}-${pad2(o.month)}-${pad2(o.day)}-${o.shift}`;
}

// Returns null for an unrecognised key.
function parseTestKey(key) {
  key = String(key || "").toLowerCase();

  let m = key.match(/^([a-z]+)-(\d{4})-(\d{2})-(\d{2})-(morning|evening|m|e)$/);
  if (m && EXAMS[m[1]]) {
    const exam = EXAMS[m[1]];
    const year = +m[2], month = +m[3], day = +m[4];
    const shift = SHIFTS.find(s => s.value === m[5] || s.value[0] === m[5]);
    const dateLabel = `${day} ${MONTHS[month - 1]} ${year}`;
    return {
      kind: "paper", key, examCode: m[1], examName: exam.name,
      year, month, day, shift: shift.value,
      session: month <= 2 ? "January" : "April",
      dateLabel, shiftLabel: `${shift.label} (Shift ${shift.number})`,
      title: `${exam.name} \u2014 ${dateLabel}, ${shift.label} Shift`,
      durationMin: exam.durationMin, marking: exam.marking
    };
  }

  m = key.match(/^c(11|12)-(phy|chem|math)-(\d{2})$/);
  if (m) {
    const subjectLabel = SUBJECTS.find(s => s.value === m[2]).label;
    return {
      kind: "chapter", key, examName: "JEE Main", classNum: +m[1],
      subject: m[2], subjectLabel, chapterNo: +m[3],
      title: `Class ${m[1]} ${subjectLabel} \u2014 Chapter Test`,
      durationMin: CHAPTER_TEST.durationMin, marking: CHAPTER_TEST.marking
    };
  }
  return null;
}