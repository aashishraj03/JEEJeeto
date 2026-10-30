// ===== Parse Test Key from URL =====
const urlParams = new URLSearchParams(window.location.search);
const testParam = urlParams.get("test");
const paperParam = urlParams.get("paper");
const typeParam = urlParams.get("type") || "mock";

let setKey = testParam || paperParam || typeParam;

// ===== Test duration =====
// Full Syllabus tests ("c11-phy-full", "c12-math-full", ...) run for 3 hours.
// Every other test keeps the 60-minute limit it has always had.
const FULL_TEST_RE = /^c(\d+)-(phy|chem|math)-full$/i;
const isFullTest = FULL_TEST_RE.test(setKey || "");
const DEFAULT_TEST_MINUTES = 60;
const FULL_TEST_MINUTES = 180;

// Unit Test / Mid-term Revision ("c11-phy-revision"): the student builds it on
// tests.html, and the choices travel in the page address:
//   ?test=c11-phy-revision&chapters=1,3,5&basic=15&moderate=15&advanced=10&mins=75
const REVISION_TEST_RE = /^c(\d+)-(phy|chem|math)-revision$/i;
const isRevisionTest = REVISION_TEST_RE.test(setKey || "");
const REVISION_MIN_MINUTES = 30;
const REVISION_MAX_MINUTES = 180;

// A full exam sitting (one paper): "jm-2026-04-02-morning" (JEE Main) or
// "ja-2025-p1" (JEE Advanced). Runs for 3 hours with the real paper's order.
const JM_PAPER_RE = /^jm-(\d{4})-(\d{2})-(\d{2})-(morning|evening)$/i;
const JA_PAPER_RE = /^ja-(\d{4})-p([12])$/i;
const isPaperTest = JM_PAPER_RE.test(setKey || "") || JA_PAPER_RE.test(setKey || "");
const PAPER_TEST_MINUTES = 180;

const SUBJECT_NAMES = { phy: "Physics", chem: "Chemistry", math: "Mathematics" };
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

// Title of a paper, worked out from its key alone.
function getPaperTitle(key) {
  const k = String(key || "").toLowerCase();
  let m = k.match(JM_PAPER_RE);
  if (m) {
    const shift = m[4] === "morning" ? "Morning" : "Evening";
    return `JEE Main ${m[1]} \u00b7 ${parseInt(m[3], 10)} ${MONTH_NAMES[parseInt(m[2], 10) - 1] || ""} \u00b7 ${shift} Shift`;
  }
  m = k.match(JA_PAPER_RE);
  if (m) return `JEE Advanced ${m[1]} \u00b7 Paper ${m[2]}`;
  return null;
}

// Both kinds span several chapters: fixed title, and the paper is saved so a
// refresh or crash can be resumed.
const isMultiChapterTest = isFullTest || isRevisionTest || isPaperTest;

function getRevisionMinutes() {
  const mins = parseInt(urlParams.get("mins"), 10);
  if (!Number.isFinite(mins)) return DEFAULT_TEST_MINUTES;
  return Math.min(Math.max(mins, REVISION_MIN_MINUTES), REVISION_MAX_MINUTES);
}

// Only the known builder fields are passed on to the server.
function getRevisionQuery() {
  if (!isRevisionTest) return "";
  const out = new URLSearchParams();
  ["chapters", "basic", "moderate", "advanced"].forEach(k => {
    const v = urlParams.get(k);
    if (v !== null) out.set(k, v);
  });
  const q = out.toString();
  return q ? `?${q}` : "";
}

// Identifies one specific paper: the test plus (for revision) the chosen setup,
// so two different custom setups never share a saved copy.
const progressId = setKey + getRevisionQuery();

function getTestDurationSeconds() {
  if (isRevisionTest) return getRevisionMinutes() * 60;
  if (isPaperTest) return PAPER_TEST_MINUTES * 60;
  return (isFullTest ? FULL_TEST_MINUTES : DEFAULT_TEST_MINUTES) * 60;
}

// ===== Fast Click & Touch Handler Helper =====
function bindFastClick(element, handler) {
  if (!element) return;
  element.addEventListener('click', handler);
}

// ===== Dynamically Update Exam Header & Page Title =====
function setDynamicExamTitle(key) {
  const examTitleEl = document.getElementById("exam-title");
  const normalizedKey = (key || "").toLowerCase();

  // Full Syllabus test: the title is known from the key alone, and must not be
  // replaced later by the name of whichever chapter the first question is from.
  const paperTitle = getPaperTitle(normalizedKey);
  if (paperTitle) {
    if (examTitleEl) examTitleEl.textContent = paperTitle;
    document.title = `${paperTitle} - JEE Portal`;
    return;
  }

  const fullMatch = normalizedKey.match(FULL_TEST_RE);
  if (fullMatch) {
    const subjectName = SUBJECT_NAMES[fullMatch[2]] || "";
    const fullTitle = `Class ${fullMatch[1]} ${subjectName} \u2014 Full Syllabus Test`;
    if (examTitleEl) examTitleEl.textContent = fullTitle;
    document.title = `${fullTitle} - JEE Portal`;
    return;
  }

  const revisionMatch = normalizedKey.match(REVISION_TEST_RE);
  if (revisionMatch) {
    const subjectName = SUBJECT_NAMES[revisionMatch[2]] || "";
    const revisionTitle = `Class ${revisionMatch[1]} ${subjectName} \u2014 Unit Test / Revision`;
    if (examTitleEl) examTitleEl.textContent = revisionTitle;
    document.title = `${revisionTitle} - JEE Portal`;
    return;
  }

  let examName = "JEE Practice Arena";
  if (normalizedKey.includes("c12")) examName = "Class 12 JEE Test";
  else if (normalizedKey.includes("c11")) examName = "Class 11 JEE Test";

  // Deliberately NOT guessing a chapter name from the raw key here — that
  // guess is what used to flash on screen before the real chapter name
  // (loaded from the DB a moment later) replaced it. A plain "loading"
  // state has nothing wrong-looking to flash.
  if (examTitleEl) {
    examTitleEl.textContent = `${examName} — loading…`;
  }

  document.title = `${examName} - JEE Portal`;
}

// ===== 75-Question JEE Blueprint Generator =====
function generateFoundationQuestions(loadedQuestions = []) {
  if (loadedQuestions.length > 0) {
    return loadedQuestions;
  }

  // Fallback generator: 75 demo questions (Physics, Chemistry, Mathematics)
  const fullSet = [];
  const subjects = [
    { name: "Physics", start: 1, end: 25 },
    { name: "Chemistry", start: 26, end: 50 },
    { name: "Mathematics", start: 51, end: 75 }
  ];

  subjects.forEach(subj => {
    for (let i = subj.start; i <= subj.end; i++) {
      fullSet.push({
        subject: subj.name,
        chapter: `${subj.name} Basics`,
        num: i,
        text: `[${subj.name} Q${i}] Evaluate the basic concept and select the correct option for this problem.`,
        options: [
          `Option A: Basic Concept Solution 1`,
          `Option B: Basic Concept Solution 2`,
          `Option C: Basic Concept Solution 3`,
          `Option D: None of these`
        ],
        correctIndex: 0
      });
    }
  });

  return fullSet;
}

// ===== Load Question Set from Server or Question Bank =====
async function loadQuestionSet(key) {
  try {
    const res = await fetch("/api/questions/" + encodeURIComponent(key) + getRevisionQuery(), { credentials: "include" });

    if (res.status === 401) {
      // Not logged in (or session expired) — no test content should ever
      // reach the page. Send them to log in, then straight back here.
      const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `login.html?redirect=${returnTo}`;
      return new Promise(() => {}); // halt here — navigation is in flight, nothing after this should run
    }

    if (res.status === 403) {
      document.querySelector(".nta-main-layout").innerHTML = `
        <div style="flex:1; padding: 60px 20px; text-align: center; background:#fff;">
          <h2 style="color:#E11D48; font-size:26px; margin-bottom:12px;">🔒 Paper Locked</h2>
          <p style="font-size:15px; color:#555; max-width:480px; margin:0 auto 24px;">
            This paper requires an active subscription. If your 3-day free trial has ended, subscribe to keep practising.
          </p>
          <a href="subscription.html" class="nta-btn btn-save-next" style="display:inline-block; line-height:34px; padding:0 20px; text-decoration:none; background:#F59E0B; color:#0F172A; border-radius:4px;">View Subscription Plans</a>
        </div>
      `;
      return null; // nothing to run: the page below must not start a timer
    }

    // A custom paper that cannot be built (bad setup, or not enough questions yet)
    if (res.status === 400 || res.status === 422) {
      let message = "This test could not be created with those settings.";
      try { message = (await res.json()).message || message; } catch (e) {}
      const safeMessage = message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      document.querySelector(".nta-main-layout").innerHTML = `
        <div style="flex:1; padding: 60px 20px; text-align: center; background:#fff;">
          <h2 style="color:#E11D48; font-size:24px; margin-bottom:12px;">Couldn't build this test</h2>
          <p style="font-size:15px; color:#555; max-width:520px; margin:0 auto 24px; line-height:1.6;">${safeMessage}</p>
          <a href="tests.html" class="nta-btn btn-save-next" style="display:inline-block; line-height:34px; padding:0 20px; text-decoration:none; background:#F59E0B; color:#0F172A; border-radius:4px;">Back to Tests</a>
        </div>
      `;
      return null;
    }

    if (res.ok) {
      const rows = await res.json();
      if (rows.length > 0) {
        return rows.map((r, idx) => ({
          id: r.id,
          subject: r.subject,
          chapter: r.chapter || `${r.subject} Unit`,
          text: r.question_text,
          image: r.image_path || undefined,
          type: r.question_type === "numerical" ? "numerical" : "mcq",
          options: [r.option_a, r.option_b, r.option_c, r.option_d],
          correctIndex: r.correct_index,
          correctValue: (r.correct_value !== null && r.correct_value !== undefined) ? Number(r.correct_value) : undefined,
          correctRange: (r.correct_min !== null && r.correct_min !== undefined && r.correct_max !== null && r.correct_max !== undefined)
            ? [Number(r.correct_min), Number(r.correct_max)] : undefined,
          explanation: r.explanation || null,
          num: idx + 1
        }));
      }
    }
  } catch (e) {
    console.warn("Couldn't reach server, falling back to static questions.", e);
  }

  const fallback = (typeof questionBank !== "undefined" && questionBank[key]) ? questionBank[key] : [];
  return fallback;
}

// ===== State Management & Telemetry Trackers =====
let questions = [];
let totalQuestions = 75;
let currentQuestion = 1;
const questionStatus = {};             
const answers = {};            
const timeSpent = {};          
const answerChangedFlags = {}; 
const markedHistory = {};      
let testIsSubmitted = false;

// Active per-question time ticker
setInterval(() => {
  if (!testIsSubmitted && currentQuestion) {
    timeSpent[currentQuestion] = (timeSpent[currentQuestion] || 0) + 1;
  }
}, 1000);

// Helper: Format seconds to M:SS or H:MM:SS
function formatDuration(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return `${h}h ${remM}m ${s}s`;
  }
  return `${m}m ${s < 10 ? '0' : ''}${s}s`;
}

// ===== Subject Switching =====
// Jumps to the first question of a subject (works for any subject in the paper).
function switchSubject(subjectName) {
  const idx = questions.findIndex(q => (q.subject || "").toLowerCase() === String(subjectName).toLowerCase());
  if (idx >= 0) goToQuestion(idx + 1);
}

// Builds one tab per subject that is actually in this test, in paper order.
function buildSubjectTabs() {
  const bar = document.querySelector(".subject-nav-bar");
  if (!bar) return;
  bar.innerHTML = "";
  const seen = [];
  questions.forEach(q => {
    const name = (q.subject || "").trim();
    if (name && !seen.includes(name)) seen.push(name);
  });
  seen.forEach(name => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sub-tab-btn";
    btn.dataset.subject = name;
    btn.textContent = name;
    btn.addEventListener("click", () => switchSubject(name));
    bar.appendChild(btn);
  });
  bar.style.display = seen.length > 1 ? "" : "none";
}

// ===== Update Live Legend Counts =====
function updateLegendCounts() {
  let answered = 0, notAnswered = 0, notVisited = 0, marked = 0, ansMarked = 0;

  for (let i = 1; i <= totalQuestions; i++) {
    const st = questionStatus[i];
    if (st === "answered") answered++;
    else if (st === "not-answered") notAnswered++;
    else if (st === "marked") marked++;
    else if (st === "answered-marked") ansMarked++;
    else notVisited++;
  }

  const elAns = document.getElementById("count-answered");
  const elNotAns = document.getElementById("count-not-answered");
  const elNotVis = document.getElementById("count-not-visited");
  const elMarked = document.getElementById("count-marked");
  const elAnsMarked = document.getElementById("count-ans-marked");

  if (elAns) elAns.textContent = answered;
  if (elNotAns) elNotAns.textContent = notAnswered;
  if (elNotVis) elNotVis.textContent = notVisited;
  if (elMarked) elMarked.textContent = marked;
  if (elAnsMarked) elAnsMarked.textContent = ansMarked;
}

// ===== Render Current Question =====
function renderQuestion() {
  if (questions.length === 0) return;
  const q = questions[currentQuestion - 1];

  const qNumEl = document.getElementById("q-number");
  if (qNumEl) qNumEl.textContent = `Question No. ${currentQuestion} (${q.subject})`;

  document.querySelectorAll(".sub-tab-btn").forEach(b => {
    b.classList.toggle("active", (b.dataset.subject || "").toLowerCase() === (q.subject || "").toLowerCase());
  });

  const qTextEl = document.getElementById("q-text");
  if (qTextEl) qTextEl.innerHTML = q.text;

  const figureDiv = document.getElementById("q-figure");
  if (figureDiv) {
    figureDiv.innerHTML = "";
    if (q.image) {
      const img = document.createElement("img");
      img.src = q.image;
      img.alt = "Question Diagram";
      img.className = "question-figure";
      figureDiv.appendChild(img);
    }
  }

  const optionsDiv = document.getElementById("q-options");
  if (optionsDiv && q.type === "numerical") {
    // Numerical-answer question: a typed answer instead of options
    optionsDiv.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "numerical-answer";
    const label = document.createElement("label");
    label.htmlFor = "numerical-input";
    label.textContent = "Enter your answer (numerical value)";
    const input = document.createElement("input");
    input.type = "text";
    input.id = "numerical-input";
    input.inputMode = "decimal";
    input.autocomplete = "off";
    input.placeholder = "Type your answer";
    if (answers[currentQuestion] !== undefined) input.value = answers[currentQuestion];
    input.oninput = () => {
      const cleaned = input.value.replace(/[^0-9.\-]/g, "");
      if (cleaned !== input.value) input.value = cleaned;
      if (cleaned === "") {
        delete answers[currentQuestion];
      } else {
        if (answers[currentQuestion] !== undefined && answers[currentQuestion] !== cleaned) {
          answerChangedFlags[currentQuestion] = true;
        }
        answers[currentQuestion] = cleaned;
      }
      persistProgress();
    };
    wrap.appendChild(label);
    wrap.appendChild(input);
    optionsDiv.appendChild(wrap);
  } else if (optionsDiv) {
    optionsDiv.innerHTML = "";
    q.options.forEach((optText, i) => {
      const label = document.createElement("label");
      label.className = "option-item";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = "nta_option";
      input.value = i;
      if (answers[currentQuestion] === i) input.checked = true;

      input.onchange = () => {
        if (answers[currentQuestion] !== undefined && answers[currentQuestion] !== i) {
          answerChangedFlags[currentQuestion] = true;
        }
        answers[currentQuestion] = i;
        persistProgress();
      };

      const span = document.createElement("span");
      span.innerHTML = optText;

      label.appendChild(input);
      label.appendChild(span);
      optionsDiv.appendChild(label);
    });
  }

  const MATH_RE = /\$|\\\(|\\\[/;
  const hasMath = MATH_RE.test(q.text || "") || (q.options || []).some(o => MATH_RE.test(String(o)));
  if (hasMath && window.MathJax && window.MathJax.typesetPromise) {
    MathJax.typesetPromise([qTextEl, optionsDiv]).catch(() => {});
  }

  updateLegendCounts();
}

// ===== Render Palette Buttons =====
function renderPalette() {
  const grid = document.getElementById("palette-grid");
  if (!grid) return;
  if (grid.children.length !== totalQuestions) {
    grid.innerHTML = "";
    for (let i = 1; i <= totalQuestions; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = i;
      btn.dataset.q = i;
      grid.appendChild(btn);
    }
    // one delegated listener instead of 75 separate ones
    grid.addEventListener("click", e => {
      const b = e.target.closest("button[data-q]");
      if (b) goToQuestion(parseInt(b.dataset.q, 10));
    });
  }
  for (let i = 1; i <= totalQuestions; i++) {
    grid.children[i - 1].className = `q-btn q-${questionStatus[i]}`;
  }

  // renderPalette runs after every status change (save, mark, clear, navigate),
  // so this keeps the saved copy of a Full Syllabus test up to date.
  persistProgress();
}

// On phones (<=768px, same breakpoint as the CSS) the palette sits ABOVE the
// question and the whole page scrolls. After Save & Next the scroll position
// stayed down at the buttons, so the new question was off-screen and it looked
// like nothing happened. Bring the question card back into view.
// NOTE: the CSS gives both <html> and <body> overflow:auto + height:100%, which
// makes <body> the scroller, so window.scrollTo() would do nothing here;
// scrollIntoView() scrolls whichever ancestor is actually scrolling.
// Desktop is a fixed, non-scrolling layout and is deliberately left untouched.
function scrollQuestionToTop() {
  if (!window.matchMedia("(max-width: 768px)").matches) return;
  const content = document.querySelector(".question-content-scroll");
  if (content) content.scrollTop = 0;
  const card = document.querySelector(".nta-question-container");
  if (card && card.scrollIntoView) card.scrollIntoView({ block: "start", inline: "nearest" });
}

function goToQuestion(num) {
  currentQuestion = num;
  if (questionStatus[num] === "not-visited") {
    questionStatus[num] = "not-answered";
  }
  renderQuestion();
  renderPalette();
  scrollQuestionToTop();
}

function goToPrevQuestion() {
  if (currentQuestion > 1) {
    goToQuestion(currentQuestion - 1);
  }
}

// ===== Countdown Timer =====
// The clock is based on a fixed END TIME rather than counting down once per
// tick. Browsers slow timers in background tabs, so a tick-counting timer
// would drift badly over a 3-hour test; an end time is always correct.
let endsAt = 0;
let timerHandle = null;

function updateTimer() {
  const secondsLeft = Math.max(0, Math.round((endsAt - Date.now()) / 1000));

  const h = String(Math.floor(secondsLeft / 3600)).padStart(2, "0");
  const m = String(Math.floor((secondsLeft % 3600) / 60)).padStart(2, "0");
  const s = String(secondsLeft % 60).padStart(2, "0");

  const timerEl = document.getElementById("timer");
  if (timerEl) {
    timerEl.textContent = `${h}:${m}:${s}`;
  }

  if (secondsLeft <= 0) {
    clearInterval(timerHandle);
    if (!testIsSubmitted) submitTest();
  }
}

// ===== Saved progress for the Full Syllabus test =====
// A 3-hour paper must survive a refresh, a dropped connection or a closed tab:
// same questions, same end time, same answers. Only used for "-full" tests.
let progressKey = null;
let persistEnabled = false;

// Debounced: the old version serialised the whole 75-question paper into
// localStorage synchronously on every tap, which freezes phones for a moment.
let persistTimer = null;
function persistProgress() {
  if (!persistEnabled || testIsSubmitted) return;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 400);
}

function persistNow() {
  if (!persistEnabled || testIsSubmitted || !progressKey) return;
  try {
    localStorage.setItem(progressKey, JSON.stringify({
      v: 1,
      testKey: progressId,
      endsAt,
      currentQuestion,
      // explanations are not needed during the test and can be large
      questions: questions.map(({ explanation, ...rest }) => rest),
      answers,
      questionStatus,
      markedHistory,
      answerChangedFlags,
      timeSpent
    }));
  } catch (e) {
    persistEnabled = false; // storage full or blocked: carry on without resume
  }
}

function loadSavedProgress() {
  try {
    const raw = localStorage.getItem(progressKey);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (saved && saved.v === 1 && saved.testKey === progressId &&
        Array.isArray(saved.questions) && saved.questions.length > 0 &&
        typeof saved.endsAt === "number") {
      return saved;
    }
  } catch (e) { /* corrupted entry: ignore it */ }
  return null;
}

function clearSavedProgress() {
  try { if (progressKey) localStorage.removeItem(progressKey); } catch (e) {}
}

// ===== Current answer on screen =====
// MCQ: the chosen option index. Numerical: the typed text. undefined = nothing entered.
function readCurrentSelection() {
  const q = questions[currentQuestion - 1];
  if (q && q.type === "numerical") {
    const el = document.getElementById("numerical-input");
    const v = el ? el.value.trim() : "";
    return v === "" ? undefined : v;
  }
  const selected = document.querySelector('input[name="nta_option"]:checked');
  return selected ? parseInt(selected.value, 10) : undefined;
}

// Is a typed numerical answer correct? A window (correctRange) is used when the
// question has one, otherwise the single exact value.
function isNumericalCorrect(q, typed) {
  const n = Number(typed);
  if (typed === undefined || typed === "" || !Number.isFinite(n)) return false;
  if (Array.isArray(q.correctRange) && q.correctRange.length === 2) {
    return n >= q.correctRange[0] && n <= q.correctRange[1];
  }
  if (typeof q.correctValue === "number" && Number.isFinite(q.correctValue)) {
    return Math.abs(n - q.correctValue) <= 1e-9 * Math.max(1, Math.abs(q.correctValue));
  }
  return false;
}

// ===== Direct Action Handlers with Fast-Click =====
function initActionHandlers() {
  const saveBtn = document.getElementById("saveNextBtn");
  const markBtn = document.getElementById("markBtn");
  const clearBtn = document.getElementById("clearBtn");
  const prevBtn = document.getElementById("prevBtn");
  const submitBtn = document.getElementById("submitBtn");

  bindFastClick(saveBtn, () => {
    const selected = readCurrentSelection();
    if (selected !== undefined) {
      if (answers[currentQuestion] !== undefined && answers[currentQuestion] !== selected) {
        answerChangedFlags[currentQuestion] = true;
      }
      answers[currentQuestion] = selected;
      questionStatus[currentQuestion] = "answered";
    } else if (answers[currentQuestion] !== undefined) {
      questionStatus[currentQuestion] = "answered";
    } else {
      questionStatus[currentQuestion] = "not-answered";
    }

    if (currentQuestion < totalQuestions) {
      goToQuestion(currentQuestion + 1);
    } else {
      renderPalette();
      updateLegendCounts();
    }
  });

  bindFastClick(markBtn, () => {
    markedHistory[currentQuestion] = true;
    const selected = readCurrentSelection();
    if (selected !== undefined) {
      if (answers[currentQuestion] !== undefined && answers[currentQuestion] !== selected) {
        answerChangedFlags[currentQuestion] = true;
      }
      answers[currentQuestion] = selected;
      questionStatus[currentQuestion] = "answered-marked";
    } else if (answers[currentQuestion] !== undefined) {
      questionStatus[currentQuestion] = "answered-marked";
    } else {
      questionStatus[currentQuestion] = "marked";
    }

    if (currentQuestion < totalQuestions) {
      goToQuestion(currentQuestion + 1);
    } else {
      renderPalette();
      updateLegendCounts();
    }
  });

  bindFastClick(clearBtn, () => {
    delete answers[currentQuestion];
    questionStatus[currentQuestion] = "not-answered";
    document.querySelectorAll('input[name="nta_option"]').forEach(el => (el.checked = false));
    const numInput = document.getElementById("numerical-input");
    if (numInput) numInput.value = "";
    renderPalette();
    updateLegendCounts();
  });

  bindFastClick(prevBtn, () => {
    goToPrevQuestion();
  });

  bindFastClick(submitBtn, () => {
    const confirmSubmit = confirm("Are you sure you want to submit the test?");
    if (confirmSubmit) {
      submitTest();
    }
  });
}

// ===== Submit Test Logic =====
async function submitTest() {
  testIsSubmitted = true;
  if (timerHandle) clearInterval(timerHandle);

  // Marking: MCQ +4 / -1, numerical +4 / 0
  let correct = 0, wrong = 0, unattempted = 0, mcqWrong = 0;
  const responsesPayload = [];

  questions.forEach((q, i) => {
    const qNum = i + 1;
    const userChoice = answers[qNum];
    const qTime = timeSpent[qNum] || 0;
    const isNum = q.type === "numerical";
    const isAtt = userChoice !== undefined;
    const isCorr = isAtt && (isNum ? isNumericalCorrect(q, userChoice) : userChoice === q.correctIndex);

    if (!isAtt) unattempted++;
    else if (isCorr) correct++;
    else { wrong++; if (!isNum) mcqWrong++; }

    responsesPayload.push({
      questionId: q.id || null,
      questionNum: qNum,
      questionType: isNum ? "numerical" : "mcq",
      subject: q.subject,
      chapter: q.chapter || `${q.subject} General`,
      selectedOption: (!isNum && userChoice !== undefined) ? userChoice : null,
      correctOption: isNum ? null : q.correctIndex,
      selectedValue: (isNum && userChoice !== undefined) ? String(userChoice) : null,
      correctValue: isNum && typeof q.correctValue === "number" ? q.correctValue : null,
      correctRange: isNum && Array.isArray(q.correctRange) ? q.correctRange : null,
      isCorrect: isCorr,
      timeSpent: qTime,
      markedForReview: !!markedHistory[qNum],
      answerChanged: !!answerChangedFlags[qNum]
    });
  });

  const totalScore = (correct * 4) - (mcqWrong * 1);
  const maxPossibleScore = totalQuestions * 4;

  // 1. Hide Top Navigation Bars
  const subNav = document.querySelector(".subject-nav-bar");
  const timerBadge = document.querySelector(".nta-timer-badge");
  if (subNav) subNav.style.display = "none";
  if (timerBadge) timerBadge.style.display = "none";

  // 2. Render Completion Screen
  const container = document.getElementById("exam-scale-inner") || document.querySelector(".nta-main-layout");
  if (container) {
    container.innerHTML = `
      <div style="width:100%; height:100%; padding: 60px 20px; text-align: center; background:#fff; overflow-y:auto; display:flex; flex-direction:column; align-items:center; justify-content:center;">
        <div style="width:64px; height:64px; background:#FEF3C7; color:#D97706; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:30px; margin-bottom:16px;">✓</div>
        <h2 style="color:#0F172A; font-size:26px; margin-bottom:6px;">Test Submitted Successfully</h2>
        <p style="font-size:14px; color:#64748b; margin-bottom:24px;">Your attempt has been saved to your JEE Portal profile.</p>

        <div style="width:100%; max-width:440px; margin: 0 auto 28px; background:#F8FAFC; border:1px solid #e2e8f0; border-radius:10px; padding:20px; text-align:left;">
          <div style="font-size:20px; font-weight:800; color:#0f172a; margin-bottom:12px; display:flex; justify-content:space-between;">
            <span>Total Score:</span>
            <span style="color:#D97706;">${totalScore} <span style="font-size:13px; color:#64748b;">/ ${maxPossibleScore}</span></span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:13.5px;">
            <span>Correct (+4):</span>
            <strong style="color:#16a34a;">${correct}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:13.5px;">
            <span>Incorrect (-1 MCQ, 0 numerical):</span>
            <strong style="color:#dc2626;">${wrong}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:13.5px;">
            <span>Unattempted (0):</span>
            <strong>${unattempted}</strong>
          </div>
        </div>

        <div style="display:flex; justify-content:center; gap:12px;" id="submissionActionButtons">
          <a href="profile.html#recent-tests" id="viewProfileAnalysisBtn" class="nta-btn" style="background:#0F172A; color:#fff; display:inline-block; line-height:36px; padding:0 20px; text-decoration:none; border-radius:4px; font-size:13px; font-weight:700;">View Detailed Analysis</a>
          <a href="tests.html" class="nta-btn btn-save-next" style="display:inline-block; line-height:36px; padding:0 20px; text-decoration:none; font-size:13px; font-weight:700; background:#F59E0B; color:#0F172A; border-radius:4px;">Back to Tests</a>
        </div>
      </div>
    `;
  }

  // 3. Send Telemetry to Server
  try {
    const res = await fetch("/api/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        testKey: setKey,
        score: totalScore,
        correct,
        wrong,
        unattempted,
        responses: responsesPayload
      })
    });
    
    if (res.ok) {
      clearSavedProgress();
      const data = await res.json();
      const analysisLink = document.getElementById("viewProfileAnalysisBtn");
      if (analysisLink && data.attemptId) {
        analysisLink.href = `profile.html?viewAttempt=${data.attemptId}`;
      }
    }
  } catch (e) {
    console.warn("Couldn't save attempt to server:", e);
  }
}

// ===== Fetch & Display Logged-in Candidate Info =====
async function loadCandidateProfile() {
  const nameEl = document.getElementById("candidate-name");
  const avatarEl = document.getElementById("candidate-avatar");

  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      if (data.authenticated && data.user) {
        const fullName = data.user.fullName || data.user.name || "Student";
        if (nameEl) nameEl.textContent = fullName;
        if (avatarEl) avatarEl.textContent = fullName.charAt(0).toUpperCase();
        // Used to keep one student's saved test separate from another's
        return String(data.user.id ?? data.user.userId ?? data.user.email ?? fullName);
      }
    }
  } catch (err) {
    console.warn("Could not load candidate profile:", err);
  }

  if (nameEl) nameEl.textContent = "Student";
  if (avatarEl) avatarEl.textContent = "S";
  return "";
}

// ===== Initialization =====
(async () => {
  initActionHandlers();
  setDynamicExamTitle(setKey);
  const profilePromise = loadCandidateProfile();

  const timerEl = document.getElementById("timer");
  if (timerEl) timerEl.textContent = "--:--:--";

  // Full Syllabus test: pick up an unfinished paper if there is one.
  let resumed = null;
  if (isMultiChapterTest) {
    const ownerId = await profilePromise;
    progressKey = `jeeportal:fulltest:v1:${ownerId || "anon"}:${progressId}`;
    resumed = loadSavedProgress();

    if (resumed && resumed.endsAt > Date.now()) {
      const minsLeft = Math.max(1, Math.ceil((resumed.endsAt - Date.now()) / 60000));
      const keepGoing = confirm(
        `You have an unfinished test with about ${minsLeft} minute(s) left.\n\n` +
        `OK = resume it\nCancel = discard it and start a new paper`
      );
      if (!keepGoing) {
        clearSavedProgress();
        resumed = null;
      }
    }
    // If the saved paper's time ran out while the student was away, it is
    // restored as-is and the timer below submits it straight away.
  }

  let rawQuestions = [];
  if (resumed) {
    questions = resumed.questions;
  } else {
    rawQuestions = await loadQuestionSet(setKey);
    if (rawQuestions === null) return; // locked / could not be built: error panel is already showing
    questions = generateFoundationQuestions(rawQuestions);
  }
  totalQuestions = questions.length;

  // Once real questions are in, prefer the actual chapter name (from the
  // DB's `chapter` column, same source the profile analysis views use)
  // over the guessed title setDynamicExamTitle() built from the raw key.
  // (Full Syllabus tests keep their own title: they span every chapter.)
  const examTitleEl = document.getElementById("exam-title");
  if (!isMultiChapterTest) {
    const realChapterName = rawQuestions.find(q => q.chapter)?.chapter;
    if (realChapterName) {
      if (examTitleEl) examTitleEl.textContent = realChapterName;
      document.title = `${realChapterName} - JEE Portal`;
    } else if (examTitleEl) {
      // No chapter data came back at all (e.g. fallback demo questions) —
      // don't leave the header stuck on "loading...".
      examTitleEl.textContent = "Practice Test";
    }
  }

  // A chapter (or subject-wide) test only ever has ONE subject throughout —
  // the tab bar would let you "switch" to a subject with no questions in
  // it, which is meaningless. Only real mixed tests (mocks) show it.
  // The tabs are built from the subjects actually in this paper (Physics,
  // Chemistry, Mathematics); the bar stays hidden when there is only one.
  buildSubjectTabs();

  if (resumed) {
    Object.assign(answers, resumed.answers);
    Object.assign(questionStatus, resumed.questionStatus);
    Object.assign(markedHistory, resumed.markedHistory);
    Object.assign(answerChangedFlags, resumed.answerChangedFlags);
    Object.assign(timeSpent, resumed.timeSpent);
    currentQuestion = Math.min(Math.max(parseInt(resumed.currentQuestion, 10) || 1, 1), totalQuestions);
    endsAt = resumed.endsAt;
  } else {
    for (let i = 1; i <= totalQuestions; i++) {
      questionStatus[i] = "not-visited";
      timeSpent[i] = 0;
    }
    questionStatus[1] = "not-answered";
    endsAt = Date.now() + getTestDurationSeconds() * 1000;
  }

  // Only a real, server-built paper is worth saving (not the demo fallback).
  persistEnabled = isMultiChapterTest && !!progressKey && (!!resumed || rawQuestions.length > 0);

  renderQuestion();
  renderPalette();
  updateTimer();
  timerHandle = setInterval(updateTimer, 1000);

  if (persistEnabled) {
    setInterval(persistNow, 15000); // also captures time spent per question
    window.addEventListener("pagehide", persistNow);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") persistNow();
    });
  }
})();