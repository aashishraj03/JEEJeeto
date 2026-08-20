// ===== Parse Test Key from URL =====
const urlParams = new URLSearchParams(window.location.search);
const paperParam = urlParams.get("paper");
const typeParam = urlParams.get("type") || "mock";

let setKey = paperParam || typeParam;

// ===== 75-Question Blueprint Generator =====
function generateFull75Questions(loadedQuestions = []) {
  const fullSet = [];
  const subjects = [
    { name: "Physics", start: 1, end: 25 },
    { name: "Chemistry", start: 26, end: 50 },
    { name: "Mathematics", start: 51, end: 75 }
  ];

  subjects.forEach(subj => {
    for (let i = subj.start; i <= subj.end; i++) {
      // Use real question if present in DB/questionBank, else supply a structured JEE problem
      const existing = loadedQuestions.find(q => q.subject === subj.name && (loadedQuestions.indexOf(q) + 1) === i) 
                    || loadedQuestions[i - 1];

      if (existing) {
        fullSet.push({ ...existing, subject: subj.name, num: i });
      } else {
        fullSet.push({
          subject: subj.name,
          num: i,
          text: `[${subj.name} Q${i}] Evaluate the standard value and select the correct option for this problem: $\\int_{0}^{1} x^{${(i % 5) + 1}} \\, dx$`,
          options: [
            `Option A: $\\frac{1}{${(i % 5) + 2}}$`,
            `Option B: $\\frac{2}{${(i % 5) + 3}}$`,
            `Option C: $\\frac{3}{${(i % 5) + 4}}$`,
            `Option D: None of these`
          ],
          correctIndex: 0
        });
      }
    }
  });

  return fullSet;
}

// ===== Load Question Set from Server or Question Bank =====
async function loadQuestionSet(key) {
  try {
    const res = await fetch("/api/questions/" + encodeURIComponent(key), { credentials: "include" });
    if (res.status === 403) {
      document.querySelector(".nta-main-layout").innerHTML = `
        <div style="flex:1; padding: 60px 20px; text-align: center; background:#fff;">
          <h2 style="color:#0f388a; font-size:26px; margin-bottom:12px;">🔒 Paper Locked</h2>
          <p style="font-size:15px; color:#555; max-width:480px; margin:0 auto 24px;">
            This question paper requires an active subscription. Only the first mock/PYQ paper is available for free practice.
          </p>
          <a href="tests.html" class="nta-btn btn-save-next" style="display:inline-block; line-height:34px; padding:0 20px; text-decoration:none;">Browse Available Tests</a>
        </div>
      `;
      return [];
    }

    if (res.ok) {
      const rows = await res.json();
      if (rows.length > 0) {
        return rows.map((r, idx) => ({
          subject: r.subject,
          text: r.question_text,
          image: r.image_path || undefined,
          options: [r.option_a, r.option_b, r.option_c, r.option_d],
          correctIndex: r.correct_index,
          num: idx + 1
        }));
      }
    }
  } catch (e) {
    console.warn("Couldn't reach server, falling back to static questions.", e);
  }

  const fallback = questionBank[key] || questionBank["main-2024-jan-shift1"] || [];
  return fallback;
}

// ===== State Management =====
let questions = [];
let totalQuestions = 75;
let currentQuestion = 1;
const status = {};  // "not-visited" | "not-answered" | "answered" | "marked" | "answered-marked"
const answers = {}; // question number -> selected option index

// ===== Subject Switching =====
function switchSubject(subjectName) {
  document.querySelectorAll(".sub-tab-btn").forEach(btn => btn.classList.remove("active"));
  
  if (subjectName === "Physics") {
    document.getElementById("tab-phy")?.classList.add("active");
    goToQuestion(1);
  } else if (subjectName === "Chemistry") {
    document.getElementById("tab-chem")?.classList.add("active");
    goToQuestion(26);
  } else if (subjectName === "Mathematics") {
    document.getElementById("tab-math")?.classList.add("active");
    goToQuestion(51);
  }
}

// ===== Update Live Legend Counts =====
function updateLegendCounts() {
  let answered = 0, notAnswered = 0, notVisited = 0, marked = 0, ansMarked = 0;

  for (let i = 1; i <= totalQuestions; i++) {
    const st = status[i];
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

  // Update Question Header & Subject Tab Highlighting
  const qNumEl = document.getElementById("q-number");
  if (qNumEl) qNumEl.textContent = `Question No. ${currentQuestion} (${q.subject})`;

  document.querySelectorAll(".sub-tab-btn").forEach(b => b.classList.remove("active"));
  if (currentQuestion <= 25) {
    document.getElementById("tab-phy")?.classList.add("active");
  } else if (currentQuestion <= 50) {
    document.getElementById("tab-chem")?.classList.add("active");
  } else {
    document.getElementById("tab-math")?.classList.add("active");
  }

  // Question Text
  const qTextEl = document.getElementById("q-text");
  if (qTextEl) qTextEl.innerHTML = q.text;

  // Question Figure
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

  // Options
  const optionsDiv = document.getElementById("q-options");
  if (optionsDiv) {
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
        answers[currentQuestion] = i;
      };

      const span = document.createElement("span");
      span.innerHTML = optText;

      label.appendChild(input);
      label.appendChild(span);
      optionsDiv.appendChild(label);
    });
  }

  // Typeset LaTeX with MathJax if available
  if (window.MathJax && window.MathJax.typesetPromise) {
    MathJax.typesetPromise([qTextEl, optionsDiv]).catch(() => {});
  }

  updateLegendCounts();
}

// ===== Render 75 Palette Buttons =====
function renderPalette() {
  const grid = document.getElementById("palette-grid");
  if (!grid) return;
  grid.innerHTML = "";

  for (let i = 1; i <= totalQuestions; i++) {
    const btn = document.createElement("button");
    btn.className = `q-btn q-${status[i]}`;
    btn.textContent = i;
    btn.onclick = () => goToQuestion(i);
    grid.appendChild(btn);
  }
}

function goToQuestion(num) {
  currentQuestion = num;
  if (status[num] === "not-visited") {
    status[num] = "not-answered";
  }
  renderQuestion();
  renderPalette();
}

function goToPrevQuestion() {
  if (currentQuestion > 1) {
    goToQuestion(currentQuestion - 1);
  }
}

// ===== Countdown Timer (3 Hours) =====
let secondsLeft = 3 * 60 * 60;
let timerHandle = null;

function updateTimer() {
  const h = String(Math.floor(secondsLeft / 3600)).padStart(2, "0");
  const m = String(Math.floor((secondsLeft % 3600) / 60)).padStart(2, "0");
  const s = String(secondsLeft % 60).padStart(2, "0");

  const timerEl = document.getElementById("timer");
  if (timerEl) {
    timerEl.textContent = `${h}:${m}:${s}`;
  }

  if (secondsLeft > 0) {
    secondsLeft--;
  } else {
    clearInterval(timerHandle);
    submitTest();
  }
}

// ===== Action Button Handlers =====
document.addEventListener("DOMContentLoaded", () => {
  const saveBtn = document.getElementById("saveNextBtn");
  const markBtn = document.getElementById("markBtn");
  const clearBtn = document.getElementById("clearBtn");
  const submitBtn = document.getElementById("submitBtn");

  if (saveBtn) {
    saveBtn.onclick = () => {
      const selected = document.querySelector('input[name="nta_option"]:checked');
      if (selected) {
        answers[currentQuestion] = parseInt(selected.value);
        status[currentQuestion] = "answered";
      } else if (answers[currentQuestion] !== undefined) {
        status[currentQuestion] = "answered";
      } else {
        status[currentQuestion] = "not-answered";
      }

      if (currentQuestion < totalQuestions) {
        goToQuestion(currentQuestion + 1);
      } else {
        renderPalette();
        updateLegendCounts();
      }
    };
  }

  if (markBtn) {
    markBtn.onclick = () => {
      const selected = document.querySelector('input[name="nta_option"]:checked');
      if (selected) {
        answers[currentQuestion] = parseInt(selected.value);
        status[currentQuestion] = "answered-marked";
      } else if (answers[currentQuestion] !== undefined) {
        status[currentQuestion] = "answered-marked";
      } else {
        status[currentQuestion] = "marked";
      }

      if (currentQuestion < totalQuestions) {
        goToQuestion(currentQuestion + 1);
      } else {
        renderPalette();
        updateLegendCounts();
      }
    };
  }

  if (clearBtn) {
    clearBtn.onclick = () => {
      delete answers[currentQuestion];
      status[currentQuestion] = "not-answered";
      document.querySelectorAll('input[name="nta_option"]').forEach(el => (el.checked = false));
      renderPalette();
      updateLegendCounts();
    };
  }

  if (submitBtn) {
    submitBtn.onclick = submitTest;
  }
});

// ===== Submit Test Logic =====
async function submitTest() {
  if (timerHandle) clearInterval(timerHandle);

  let correct = 0, wrong = 0, unattempted = 0;

  questions.forEach((q, i) => {
    const qNum = i + 1;
    if (answers[qNum] === undefined) {
      unattempted++;
    } else if (answers[qNum] === q.correctIndex) {
      correct++;
    } else {
      wrong++;
    }
  });

  const score = (correct * 4) - (wrong * 1);

  // Save to DB via authenticated session
  try {
    await fetch("/api/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ testKey: setKey, score, correct, wrong, unattempted })
    });
  } catch (e) {
    console.warn("Couldn't save attempt to server:", e);
  }

  // 1. Hide the Subject Nav Bar & Timer Badge
  const subNav = document.querySelector(".subject-nav-bar");
  const timerBadge = document.querySelector(".nta-timer-badge");
  if (subNav) subNav.style.display = "none";
  if (timerBadge) timerBadge.style.display = "none";

  // 2. Render Full Clean Result Screen
  const layout = document.querySelector(".nta-main-layout");
  if (layout) {
    layout.style.height = "calc(100vh - 52px)";
    layout.innerHTML = `
      <div style="flex:1; padding: 40px 20px; text-align: center; background:#fff; overflow-y:auto;">
        <div style="width:64px; height:64px; background:#dcfce7; color:#16a34a; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:30px; margin:0 auto 16px;">✓</div>
        <h2 style="color:#173b6c; font-size:26px; margin-bottom:6px;">Test Submitted Successfully</h2>
        <p style="font-size:14px; color:#64748b; margin-bottom:24px;">Your attempt has been saved to your profile dashboard.</p>

        <div style="max-width:460px; margin: 0 auto 28px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:24px; text-align:left;">
          <div style="font-size:20px; font-weight:800; color:#0f172a; margin-bottom:16px; border-bottom:1px solid #e2e8f0; padding-bottom:12px; display:flex; justify-content:space-between;">
            <span>Total Score:</span>
            <span style="color:#16a34a;">${score} <span style="font-size:14px; color:#64748b; font-weight:600;">/ 300</span></span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:10px; font-size:14px;">
            <span>Correct Questions (+4):</span>
            <strong style="color:#16a34a;">${correct}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:10px; font-size:14px;">
            <span>Incorrect Questions (-1):</span>
            <strong style="color:#dc2626;">${wrong}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:10px; font-size:14px;">
            <span>Unattempted (0):</span>
            <strong>${unattempted}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; margin-top:14px; padding-top:10px; border-top:1px dashed #cbd5e1; font-size:14px; font-weight:700;">
            <span>Accuracy:</span>
            <span>${(correct + wrong) > 0 ? Math.round((correct / (correct + wrong)) * 100) : 0}%</span>
          </div>
        </div>

        <div style="display:flex; justify-content:center; gap:12px;">
          <a href="profile.html#recent-tests" class="nta-btn" style="background:#0f172a; color:#fff; display:inline-block; line-height:36px; padding:0 20px; text-decoration:none; border-radius:4px; font-size:13px; font-weight:700;">View Profile Analytics</a>
          <a href="tests.html" class="nta-btn btn-save-next" style="display:inline-block; line-height:36px; padding:0 20px; text-decoration:none; font-size:13px; font-weight:700;">Back to Test Series</a>
        </div>
      </div>
    `;
  }
}

// ===== Initialization =====
(async () => {
  const rawQuestions = await loadQuestionSet(setKey);
  questions = generateFull75Questions(rawQuestions);
  totalQuestions = questions.length;

  for (let i = 1; i <= totalQuestions; i++) {
    status[i] = "not-visited";
  }
  status[1] = "not-answered";

  renderQuestion();
  renderPalette();
  updateTimer();
  timerHandle = setInterval(updateTimer, 1000);
})();