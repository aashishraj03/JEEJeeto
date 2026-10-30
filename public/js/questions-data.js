// ===== JEE PORTAL — QUESTION BANK =====
//
// One key = one exam sitting. The key alone says which exam, which date and
// which shift. The value is just the list of questions in paper order.
//
// ---------------------------------------------------------------------
// 1. KEY
// ---------------------------------------------------------------------
//   JEE Main:      "jm-<YYYY>-<MM>-<DD>-<shift>"   "jm-2026-04-02-morning"
//                                                   "jm-2025-04-03-evening"
//   JEE Advanced:  "ja-<YYYY>-<paper>"             "ja-2025-p1"
//
//   shift = "morning" or "evening"  (Advanced: p1 / p2)
//
//   The importer works out everything else from the key:
//     exam (JEE Main / JEE Advanced), date, year, month (session), weekday,
//     shift (Shift 1 / Shift 2), title ("JEE Main 2026 · 2 April · Morning Shift"),
//     duration and marking scheme (rules for JEE Main are built into the importer),
//     and that every paper here is a rewritten variant (the site labels it
//     "JEE-style variant").
//   Do not type any of these again.
//
// ---------------------------------------------------------------------
// 2. QUESTION (only these fields)
// ---------------------------------------------------------------------
// {
//   subject: "Physics" | "Chemistry" | "Mathematics",
//   class: 11 | 12,                  // class the chapter belongs to
//   chapter: "Kinematics",           // exactly as in chapters.js
//   topic: "Motion under gravity",   // exactly as in chapters.js, one topic per question
//   type: "numerical",               // only for numerical-answer questions; leave out for MCQ
//
//   text: "Question text with $LaTeX$ for maths.",
//   image: "data:image/svg+xml;...", // OPTIONAL, only if necessary, SVG data URI only
//
//   options: ["A", "B", "C", "D"],   // MCQ only
//   correctIndex: 1,                 // MCQ only (0 = A ... 3 = D)
//   correctValue: 62,                // numerical only: the single exact answer
//   correctRange: [4.9, 5.1],        // numerical only, use INSTEAD of correctValue when a
//                                    // window of values must be accepted: [min, max] inclusive
//
//   explanation: "Detailed step-by-step solution, every step shown."
// }
//
// Question number = position in the list (paper order: Physics, Chemistry,
// Maths). The importer numbers it and builds the ID from key + number,
// e.g. "jm-2026-04-02-morning-q01". Section A / B follows from the type.
// Never insert or reorder questions in a published paper (it would change IDs
// that bookmarks and analytics use); only append at the end or edit in place.
//
// Chapter tests, subject tests, "this chapter across all years" and custom
// tests are built automatically by filtering on these fields.
//
// ---------------------------------------------------------------------
// 3. FILTERS THE SITE CAN OFFER
// ---------------------------------------------------------------------
//   exam, year, month, date, shift, subject, class, chapter, topic, type
//   e.g. "2025 · April · evening", "Physics · Kinematics · all years"
//
// ---------------------------------------------------------------------
// 4. MATH EXPRESSIONS
// ---------------------------------------------------------------------
//   Wrap LaTeX in single dollar signs: "Find $\\frac{dy}{dx}$ if $y = \\sin(x^2)$"
//   Use a DOUBLE backslash (\\frac, \\sqrt, \\int); this is a JS string.
//   Chemistry: "$\\mathrm{H_2SO_4}$", "$\\mathrm{2H_2 + O_2 \\rightarrow 2H_2O}$".
//
// ---------------------------------------------------------------------
// 5. DATABASE NOTE
// ---------------------------------------------------------------------
//   Index paper_id, exam, date, year, month, shift, qno, subject, class,
//   chapter, topic, type as columns; keep text, options and explanation as JSON/text.
//
// ---------------------------------------------------------------------
// 6. EXAMPLE (placeholder date; not a real paper reference)
// ---------------------------------------------------------------------

const questionBank = {

  "jm-2026-04-02-morning": [
    {
      subject: "Physics",
      class: 11,
      chapter: "Kinematics",
      topic: "Motion under gravity",
      text: "A stone is thrown vertically upward from the ground with a speed of $30\\ \\text{m/s}$. Taking $g = 10\\ \\text{m/s}^2$, the maximum height reached by the stone is:",
      options: ["$30\\ \\text{m}$", "$45\\ \\text{m}$", "$60\\ \\text{m}$", "$90\\ \\text{m}$"],
      correctIndex: 1,
      explanation: "At the highest point the velocity is zero, so use $v^2 = u^2 - 2gh$.\nStep 1: $0 = 30^2 - 2(10)h$.\nStep 2: $20h = 900$.\nStep 3: $h = 45\\ \\text{m}$.\nThe option $90\\ \\text{m}$ comes from forgetting the factor 2 and using $h = u^2/g$; the other wrong options are arithmetic slips."
    },
    {
      subject: "Mathematics",
      class: 11,
      chapter: "Sequences and Series",
      topic: "Arithmetic progression",
      type: "numerical",
      text: "The sum of the first $n$ terms of an arithmetic progression is $S_n = 3n^2 + 5n$. Find its 10th term.",
      correctValue: 62,
      explanation: "The nth term is $a_n = S_n - S_{n-1}$.\nStep 1: $S_{10} = 3(100) + 5(10) = 350$.\nStep 2: $S_9 = 3(81) + 5(9) = 243 + 45 = 288$.\nStep 3: $a_{10} = 350 - 288 = 62$.\nCheck: $a_n = 6n + 2$, so $a_{10} = 62$."
    }
  ],

  "jm-2025-04-03-evening": [
    // add this sitting's questions here, in paper order
  ]

};