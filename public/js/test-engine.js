// ===== Parse Test Key from URL =====
const urlParams = new URLSearchParams(window.location.search);
const paperParam = urlParams.get("paper");
const typeParam = urlParams.get("type") || "mock";

let setKey = paperParam || typeParam;

// ===== Fast Click & Touch Handler Helper (Zero 300ms Delay) =====
function bindFastClick(element, handler) {
  if (!element) return;
  let touchHandled = false;

  element.addEventListener('touchstart', function (e) {
    touchHandled = true;
    handler(e);
  }, { passive: true });

  element.addEventListener('click', function (e) {
    if (touchHandled) {
      touchHandled = false;
      return;
    }
    handler(e);
  });
}

// ===== Dynamically Update Exam Header & Page Title =====
function setDynamicExamTitle(key) {
  const examTitleEl = document.getElementById("exam-title");
  const normalizedKey = (key || "").toLowerCase();

  let isAdvanced = normalizedKey.includes("adv") || normalizedKey.includes("advanced");
  let examName = isAdvanced ? "JEE (Advanced)" : "JEE (Main)";

  let formattedSubtitle = "";
  if (paperParam) {
    formattedSubtitle = paperParam
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  if (examTitleEl) {
    examTitleEl.textContent = formattedSubtitle 
      ? `${examName} CBT - ${formattedSubtitle}` 
      : `${examName} Computer Based Test (CBT)`;
  }

  document.title = `${examName} CBT Simulator - JEE Jeeto`;
}

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
      const existing = loadedQuestions.find(q => q.subject === subj.name && (loadedQuestions.indexOf(q) + 1) === i) 
                    || loadedQuestions[i - 1];

      if (existing) {
        fullSet.push({ ...existing, subject: subj.name, num: i });
      } else {
        fullSet.push({
          subject: subj.name,
          chapter: `${subj.name} Basics`,
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
          chapter: r.chapter || `${r.subject} Unit`,
          text: r.question_text,
          image: r.image_path || undefined,
          options: [r.option_a, r.option_b, r.option_c, r.option_d],
          correctIndex: r.correct_index,
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
const status = {};             
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
        if (answers[currentQuestion] !== undefined && answers[currentQuestion] !== i) {
          answerChangedFlags[currentQuestion] = true;
        }
        answers[currentQuestion] = i;
      };

      const span = document.createElement("span");
      span.innerHTML = optText;

      label.appendChild(input);
      label.appendChild(span);
      optionsDiv.appendChild(label);
    });
  }

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
    btn.type = "button";
    btn.className = `q-btn q-${status[i]}`;
    btn.textContent = i;
    bindFastClick(btn, () => goToQuestion(i));
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

// ===== Direct Action Handlers with Fast-Click =====
function initActionHandlers() {
  const saveBtn = document.getElementById("saveNextBtn");
  const markBtn = document.getElementById("markBtn");
  const clearBtn = document.getElementById("clearBtn");
  const prevBtn = document.getElementById("prevBtn");
  const submitBtn = document.getElementById("submitBtn");

  bindFastClick(saveBtn, () => {
    const selected = document.querySelector('input[name="nta_option"]:checked');
    if (selected) {
      if (answers[currentQuestion] !== undefined && answers[currentQuestion] !== parseInt(selected.value, 10)) {
        answerChangedFlags[currentQuestion] = true;
      }
      answers[currentQuestion] = parseInt(selected.value, 10);
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
  });

  bindFastClick(markBtn, () => {
    markedHistory[currentQuestion] = true;
    const selected = document.querySelector('input[name="nta_option"]:checked');
    if (selected) {
      if (answers[currentQuestion] !== undefined && answers[currentQuestion] !== parseInt(selected.value, 10)) {
        answerChangedFlags[currentQuestion] = true;
      }
      answers[currentQuestion] = parseInt(selected.value, 10);
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
  });

  bindFastClick(clearBtn, () => {
    delete answers[currentQuestion];
    status[currentQuestion] = "not-answered";
    document.querySelectorAll('input[name="nta_option"]').forEach(el => (el.checked = false));
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

  let correct = 0, wrong = 0, unattempted = 0;
  const responsesPayload = [];

  questions.forEach((q, i) => {
    const qNum = i + 1;
    const userChoice = answers[qNum];
    const qTime = timeSpent[qNum] || 0;
    const isAtt = userChoice !== undefined;
    const isCorr = isAtt && userChoice === q.correctIndex;

    if (!isAtt) unattempted++;
    else if (isCorr) correct++;
    else wrong++;

    responsesPayload.push({
      questionNum: qNum,
      subject: q.subject,
      chapter: q.chapter || `${q.subject} General`,
      selectedOption: userChoice !== undefined ? userChoice : null,
      correctOption: q.correctIndex,
      isCorrect: isCorr,
      timeSpent: qTime,
      markedForReview: !!markedHistory[qNum],
      answerChanged: !!answerChangedFlags[qNum]
    });
  });

  const totalScore = (correct * 4) - (wrong * 1);

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
        <div style="width:64px; height:64px; background:#dcfce7; color:#16a34a; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:30px; margin-bottom:16px;">✓</div>
        <h2 style="color:#173b6c; font-size:26px; margin-bottom:6px;">Test Submitted Successfully</h2>
        <p style="font-size:14px; color:#64748b; margin-bottom:24px;">Your attempt has been saved to your account profile.</p>

        <div style="width:100%; max-width:440px; margin: 0 auto 28px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:20px; text-align:left;">
          <div style="font-size:20px; font-weight:800; color:#0f172a; margin-bottom:12px; display:flex; justify-content:space-between;">
            <span>Total Score:</span>
            <span style="color:#16a34a;">${totalScore} <span style="font-size:13px; color:#64748b;">/ 300</span></span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:13.5px;">
            <span>Correct (+4):</span>
            <strong style="color:#16a34a;">${correct}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:13.5px;">
            <span>Incorrect (-1):</span>
            <strong style="color:#dc2626;">${wrong}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:13.5px;">
            <span>Unattempted (0):</span>
            <strong>${unattempted}</strong>
          </div>
        </div>

        <div style="display:flex; justify-content:center; gap:12px;" id="submissionActionButtons">
          <a href="profile.html#recent-tests" id="viewProfileAnalysisBtn" class="nta-btn" style="background:#0f172a; color:#fff; display:inline-block; line-height:36px; padding:0 20px; text-decoration:none; border-radius:4px; font-size:13px; font-weight:700;">View Detailed Analysis</a>
          <a href="tests.html" class="nta-btn btn-save-next" style="display:inline-block; line-height:36px; padding:0 20px; text-decoration:none; font-size:13px; font-weight:700;">Back to Test Series</a>
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
        return;
      }
    }
  } catch (err) {
    console.warn("Could not load candidate profile:", err);
  }

  if (nameEl) nameEl.textContent = "Candidate";
  if (avatarEl) avatarEl.textContent = "C";
}

// ===== Initialization =====
(async () => {
  initActionHandlers();
  setDynamicExamTitle(setKey);
  loadCandidateProfile();

  const rawQuestions = await loadQuestionSet(setKey);
  questions = generateFull75Questions(rawQuestions);
  totalQuestions = questions.length;

  for (let i = 1; i <= totalQuestions; i++) {
    status[i] = "not-visited";
    timeSpent[i] = 0;
  }
  status[1] = "not-answered";

  renderQuestion();
  renderPalette();
  updateTimer();
  timerHandle = setInterval(updateTimer, 1000);
})();