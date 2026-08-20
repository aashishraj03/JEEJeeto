// ===== QUESTION BANK =====
// Add your real questions here. Each test set is a key in questionBank,
// and its value is an array of question objects.
//
// Question object format:
// {
//   subject: "Physics" | "Chemistry" | "Mathematics",
//   text: "The question text goes here.",
//   image: "images/questions/q1.png",   // OPTIONAL - only if there's a figure/diagram
//   options: ["Option A text", "Option B text", "Option C text", "Option D text"],
//   correctIndex: 0   // index of the correct option (0 = A, 1 = B, 2 = C, 3 = D)
// }
//
// MATH EXPRESSIONS: wrap any LaTeX math in single dollar signs, e.g.
//   "Solve for x: $x^2 + 5x + 6 = 0$"
//   "Find the value of $\\frac{dy}{dx}$ when $y = \\sin(x^2)$"
// This gets rendered as a real equation automatically (via MathJax).
// If you're not sure how to write the LaTeX for something, just describe
// the expression to Claude and ask for the LaTeX — it's quick to generate.
//
// The "key" for a set matches the exam hierarchy chosen on select-pyq.html:
// JEE Main:     "main-<year>-<session>-shift<shift>"   e.g. "main-2024-jan-shift1"
// JEE Advanced: "advanced-<year>-paper<paper>"          e.g. "advanced-2024-paper1"
// Non-PYQ types use a plain key: "mock", "subject", "chapter"
//
// Replace the sample questions below with your real, sourced questions.
// (Source PYQs from the official NTA archive per the copyright guidance
// you researched — attribute the year/shift on each if you want to keep
// that "Fair Use" paper trail.)

const questionBank = {

  "main-2024-jan-shift1": [
    {
      subject: "Physics",
      text: "A particle moves in a straight line with constant acceleration. Which of the following quantities remains constant during the motion?",
      options: ["Velocity", "Acceleration", "Displacement", "Speed"],
      correctIndex: 1
    },
    {
      subject: "Mathematics",
      text: "If $f(x) = x^2 + 3x + 2$, what is $f'(x)$?",
      options: ["$2x + 3$", "$x^2 + 3$", "$2x + 2$", "$3x + 2$"],
      correctIndex: 0
    },
    {
      subject: "Mathematics",
      text: "Evaluate the integral: $\\int_{0}^{1} x^2 \\, dx$",
      options: ["$\\frac{1}{3}$", "$\\frac{1}{2}$", "$1$", "$\\frac{2}{3}$"],
      correctIndex: 0
    },
    {
      subject: "Chemistry",
      text: "Which of the following is an example of a Lewis acid?",
      options: ["NH3", "BF3", "H2O", "OH-"],
      correctIndex: 1
    },
    {
      subject: "Chemistry",
      text: "The hybridization of carbon in CH4 is:",
      options: ["sp", "sp2", "sp3", "sp3d"],
      correctIndex: 2
    }
  ],

  "mock": [
    {
      subject: "Physics",
      text: "Sample mock question — replace with your own content.",
      options: ["Option A", "Option B", "Option C", "Option D"],
      correctIndex: 0
    }
  ]

};