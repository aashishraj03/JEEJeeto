// ===== JEE portal test engine =====
// Needs test-key.js (parseTestKey) and, as an offline fallback, questions-data.js.
//
// Question format (questions-data.js / API rows). Paper-wise: one entry per sitting,
// e.g. questionBank["jm-2026-04-02-m"] = [ ...questions ]  (or { questions: [...] })
//   { subject, class, chapter, topic, type, text, image, options, correctIndex, min, max, explanation }
//   type "mcq"       -> options: [4 strings], correctIndex: 0-3
//   type "numerical" -> min / max: accepted answer window (max may be left out for one exact value)
// Exam, date, shift, session, title, duration and marking all come from the paper key.
(() => {
"use strict";

const params = new URLSearchParams(location.search);
const setKey = (params.get("test") || params.get("paper") || "").toLowerCase();
const meta = parseTestKey(setKey);
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const SUBJECT_ORDER = ["Physics", "Chemistry", "Mathematics"];

// ===== State =====
let questions = [], groups = [];
let cur = 0, draft = null, caret = 0;
let endsAt = 0, timerHandle = null, submitted = false;
let progressKey = null, persistEnabled = false;
const answers = {}, status = {}, markedHistory = {}, changed = {}, timeSpent = {};

setInterval(() => { if (!submitted && questions.length) timeSpent[cur] = (timeSpent[cur] || 0) + 1; }, 1000);

// ===== Helpers =====
function showPanel(html) {
  $("subject-bar").style.display = "none";
  $("palette").style.display = "none";
  $("palToggle").style.display = "none";
  $("layout").innerHTML = `<div class="msg">${html}</div>`;
}

function canonSubject(s) {
  const t = String(s || "").toLowerCase();
  if (t.startsWith("phy")) return "Physics";
  if (t.startsWith("chem")) return "Chemistry";
  if (t.startsWith("math")) return "Mathematics";
  return s || "General";
}

function normalize(r) {
  const type = String(r.type || "mcq").toLowerCase().startsWith("num") ? "numerical" : "mcq";
  return {
    id: r.id ?? null, subject: canonSubject(r.subject), classNum: r.class ?? null,
    chapter: r.chapter || "", topic: r.topic || "", type,
    text: r.text || "", image: r.image || null,
    options: type === "mcq" ? (r.options || []) : [],
    correctIndex: r.correctIndex, min: r.min, max: r.max,
    explanation: r.explanation || null
  };
}

function prepare(rows) {
  const subjOrder = s => { const i = SUBJECT_ORDER.indexOf(s); return i < 0 ? 99 : i; };
  questions = rows.map((r, i) => ({ ...normalize(r), _o: i }));
  questions.sort((a, b) =>
    subjOrder(a.subject) - subjOrder(b.subject) ||
    (a.type === "numerical") - (b.type === "numerical") || a._o - b._o);
  buildGroups();
}

function buildGroups() {
  groups = [];
  questions.forEach((q, i) => {
    let g = groups.find(x => x.subject === q.subject);
    if (!g) groups.push(g = { subject: q.subject, idx: [] });
    g.idx.push(i);
  });
}
const groupOf = i => groups.find(g => g.idx.includes(i));

function isCorrect(q, a) {
  if (a === undefined) return false;
  if (q.type === "mcq") return a === q.correctIndex;
  const v = parseFloat(a), lo = parseFloat(q.min);
  if (!isFinite(v) || !isFinite(lo)) return false;
  const hi = q.max === undefined || q.max === null ? lo : parseFloat(q.max);
  return v >= Math.min(lo, hi) - 1e-9 && v <= Math.max(lo, hi) + 1e-9;
}

// ===== Loading =====
async function loadQuestionSet(key) {
  try {
    const res = await fetch("/api/questions/" + encodeURIComponent(key), { credentials: "include" });
    if (res.status === 401) {
      location.href = "login.html?redirect=" + encodeURIComponent(location.pathname + location.search);
      return new Promise(() => {});
    }
    if (res.status === 403) {
      showPanel(`<h2>Paper Locked</h2><p>This paper needs an active subscription. Free tests are available on the tests page.</p>
        <a class="btn save" href="tests.html">Browse Available Tests</a>`);
      return null;
    }
    if (res.status === 400 || res.status === 422) {
      let m = "This test could not be created.";
      try { m = (await res.json()).message || m; } catch (e) {}
      showPanel(`<h2>Couldn't build this test</h2><p>${esc(m)}</p><a class="btn save" href="tests.html">Back to Tests</a>`);
      return null;
    }
    if (res.ok) {
      const d = await res.json();
      const rows = Array.isArray(d) ? d : (d.questions || []);
      if (rows.length) return rows;
    }
  } catch (e) { console.warn("Server unreachable, using static question bank.", e); }

  const b = typeof questionBank !== "undefined" ? questionBank[key] : null;
  return b ? (Array.isArray(b) ? b : (b.questions || [])) : [];
}

// ===== Saved progress (refresh / crash safe) =====
function persist() {
  if (!persistEnabled || submitted || !progressKey) return;
  try {
    localStorage.setItem(progressKey, JSON.stringify({
      v: 1, testKey: setKey, endsAt, cur,
      questions: questions.map(({ explanation, ...rest }) => rest),
      answers, status, markedHistory, changed, timeSpent
    }));
  } catch (e) { persistEnabled = false; }
}
function loadSaved() {
  try {
    const s = JSON.parse(localStorage.getItem(progressKey) || "null");
    if (s && s.v === 1 && s.testKey === setKey && Array.isArray(s.questions) && s.questions.length && typeof s.endsAt === "number") return s;
  } catch (e) {}
  return null;
}
function clearSaved() { try { if (progressKey) localStorage.removeItem(progressKey); } catch (e) {} }

// ===== Rendering =====
function renderTabs() {
  const bar = $("subject-bar");
  if (groups.length < 2) { bar.style.display = "none"; return; }
  bar.style.display = "";
  bar.innerHTML = '<span class="lbl">Sections</span>';
  groups.forEach(g => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "tab"; b.textContent = g.subject; b.dataset.s = g.subject;
    b.onclick = () => goTo(g.idx[0]);
    bar.appendChild(b);
  });
}

function render() {
  const q = questions[cur], g = groupOf(cur), mk = meta.marking[q.type];
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.s === g.subject));
  $("q-number").textContent = `Question No. ${g.idx.indexOf(cur) + 1}`;
  $("q-type").textContent = q.type === "mcq" ? "MCQ" : "Numerical Value";
  $("q-pos").textContent = mk.correct;
  $("q-neg").textContent = Math.abs(mk.wrong);
  $("q-text").innerHTML = q.text;

  const fig = $("q-figure");
  fig.innerHTML = "";
  if (q.image) { const im = document.createElement("img"); im.src = q.image; im.alt = "Question diagram"; fig.appendChild(im); }

  draft = answers[cur] !== undefined ? answers[cur] : null;
  const box = $("q-answer");
  box.innerHTML = "";

  if (q.type === "mcq") {
    q.options.forEach((t, i) => {
      const l = document.createElement("label");
      l.className = "opt" + (draft === i ? " sel" : "");
      l.innerHTML = `<input type="radio" name="opt" ${draft === i ? "checked" : ""}><span class="n">(${i + 1})</span><span>${t}</span>`;
      l.querySelector("input").onchange = () => {
        draft = i;
        box.querySelectorAll(".opt").forEach((o, k) => o.classList.toggle("sel", k === i));
      };
      box.appendChild(l);
    });
  } else {
    caret = draft ? String(draft).length : 0;
    const keys = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "0", ".", "-"];
    box.innerHTML = `<div class="num-wrap"><div class="num-display" id="numd"></div>
      <div class="keypad">${keys.map(k => `<button type="button" data-k="${k}">${k}</button>`).join("")}
      <div class="wide"><button type="button" data-k="bs">Backspace</button><button type="button" data-k="L">&larr;</button><button type="button" data-k="R">&rarr;</button></div>
      <button type="button" data-k="clr" style="grid-column:span 3">Clear All</button></div></div>`;
    box.querySelector(".keypad").onclick = e => { const k = e.target.dataset && e.target.dataset.k; if (k) pressKey(k); };
    renderNum();
  }

  $("q-scroll").scrollTop = 0;
  if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([$("q-text"), box]).catch(() => {});
}

function renderNum() {
  const v = draft ? String(draft) : "";
  $("numd").innerHTML = esc(v.slice(0, caret)) + '<span class="caret"></span>' + esc(v.slice(caret));
}

function pressKey(k) {
  let s = draft ? String(draft) : "";
  if (k === "bs") { if (caret > 0) { s = s.slice(0, caret - 1) + s.slice(caret); caret--; } }
  else if (k === "clr") { s = ""; caret = 0; }
  else if (k === "L") caret = Math.max(0, caret - 1);
  else if (k === "R") caret = Math.min(s.length, caret + 1);
  else {
    if (s.length >= 12) return;
    if (k === "-" && (caret !== 0 || s.startsWith("-"))) return;
    if (k === "." && s.includes(".")) return;
    s = s.slice(0, caret) + k + s.slice(caret); caret++;
  }
  draft = s === "" ? null : s;
  renderNum();
}

function renderPalette() {
  const g = groupOf(cur), grid = $("palette-grid");
  $("p-sec").textContent = g.subject;
  grid.innerHTML = "";
  const n = { answered: 0, "not-answered": 0, "not-visited": 0, marked: 0, "answered-marked": 0 };
  g.idx.forEach((gi, k) => {
    n[status[gi]]++;
    const b = document.createElement("button");
    b.type = "button"; b.className = `q q-${status[gi]}${gi === cur ? " cur" : ""}`; b.textContent = k + 1;
    b.onclick = () => goTo(gi);
    grid.appendChild(b);
  });
  $("c-ans").textContent = n.answered;
  $("c-notans").textContent = n["not-answered"];
  $("c-notvis").textContent = n["not-visited"];
  $("c-mark").textContent = n.marked;
  $("c-ansmark").textContent = n["answered-marked"];
  persist();
}

// ===== Navigation & actions =====
function goTo(i) {
  cur = i;
  if (status[i] === "not-visited") status[i] = "not-answered";
  $("palette").classList.remove("open");
  render(); renderPalette();
}
const next = () => { if (cur < questions.length - 1) goTo(cur + 1); else renderPalette(); };

// save: store the on-screen response. mark: flag for review.
function commit(save, mark) {
  if (save && draft !== null) {
    if (answers[cur] !== undefined && answers[cur] !== draft) changed[cur] = true;
    answers[cur] = draft;
  }
  const has = answers[cur] !== undefined;
  if (mark) { markedHistory[cur] = true; status[cur] = has ? "answered-marked" : "marked"; }
  else status[cur] = has ? "answered" : "not-answered";
  next();
}

function initActions() {
  $("saveNextBtn").onclick = () => commit(true, false);
  $("saveMarkBtn").onclick = () => commit(true, true);
  $("markBtn").onclick = () => commit(false, true);
  $("clearBtn").onclick = () => {
    delete answers[cur]; status[cur] = "not-answered";
    render(); renderPalette();
  };
  $("prevBtn").onclick = () => { if (cur > 0) goTo(cur - 1); };
  $("nextBtn").onclick = next;
  $("submitBtn").onclick = openSummary;
  $("submitBtnM").onclick = () => { $("palette").classList.remove("open"); openSummary(); };
  $("palToggle").onclick = () => $("palette").classList.toggle("open");
}

// ===== Timer =====
// Based on a fixed end time, so background-tab throttling can't make it drift.
function updateTimer() {
  const left = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
  const p = n => String(n).padStart(2, "0");
  const t = $("timer");
  t.textContent = `${p(Math.floor(left / 3600))}:${p(Math.floor(left % 3600 / 60))}:${p(left % 60)}`;
  t.classList.toggle("low", left <= 300);
  if (left <= 0) { clearInterval(timerHandle); if (!submitted) submitTest(); }
}

// ===== Submit =====
function openSummary() {
  const rows = groups.map(g => {
    const c = s => g.idx.filter(i => status[i] === s).length;
    return `<tr><td>${esc(g.subject)}</td><td>${g.idx.length}</td><td>${c("answered")}</td><td>${c("not-answered")}</td><td>${c("marked")}</td><td>${c("answered-marked")}</td><td>${c("not-visited")}</td></tr>`;
  }).join("");
  const ov = document.createElement("div");
  ov.className = "overlay";
  ov.innerHTML = `<div class="modal"><h3>Test summary</h3>
    <table class="sum"><tr><th>Section</th><th>No. of Questions</th><th>Answered</th><th>Not Answered</th><th>Marked for Review</th><th>Answered &amp; Marked for Review</th><th>Not Visited</th></tr>${rows}</table>
    <p style="margin-bottom:14px">Are you sure you want to submit this test? You will not be able to change your answers after submitting.</p>
    <div class="btns"><button type="button" class="btn" id="subNo">No</button><button type="button" class="btn submit" id="subYes">Yes</button></div></div>`;
  document.body.appendChild(ov);
  ov.querySelector("#subNo").onclick = () => ov.remove();
  ov.querySelector("#subYes").onclick = () => { ov.remove(); submitTest(); };
}

async function submitTest() {
  if (submitted) return;
  submitted = true;
  clearInterval(timerHandle);

  let correct = 0, wrong = 0, unattempted = 0, score = 0, maxScore = 0;
  const bySubject = {}, responses = [];
  questions.forEach((q, i) => {
    const a = answers[i], att = a !== undefined, ok = att && isCorrect(q, a);
    const mk = meta.marking[q.type];
    const pts = !att ? 0 : ok ? mk.correct : mk.wrong;
    const s = bySubject[q.subject] || (bySubject[q.subject] = { correct: 0, wrong: 0, unattempted: 0, score: 0 });
    if (!att) { unattempted++; s.unattempted++; } else if (ok) { correct++; s.correct++; } else { wrong++; s.wrong++; }
    score += pts; s.score += pts; maxScore += mk.correct;
    responses.push({
      questionId: q.id, questionNum: i + 1, subject: q.subject, class: q.classNum,
      chapter: q.chapter || `${q.subject} General`, topic: q.topic, type: q.type,
      selectedOption: q.type === "mcq" && att ? a : null,
      correctOption: q.type === "mcq" ? q.correctIndex : null,
      answerGiven: q.type === "numerical" && att ? String(a) : null,
      correctRange: q.type === "numerical" ? [q.min, q.max ?? q.min] : null,
      isCorrect: ok, marks: pts, timeSpent: timeSpent[i] || 0,
      markedForReview: !!markedHistory[i], answerChanged: !!changed[i]
    });
  });

  $("timer").parentElement.style.display = "none";
  const subRows = Object.keys(bySubject).map(k => { const s = bySubject[k];
    return `<tr><td>${esc(k)}</td><td>${s.correct}</td><td>${s.wrong}</td><td>${s.unattempted}</td><td>${s.score}</td></tr>`; }).join("");
  showPanel(`<h2>Test Submitted Successfully</h2>
    <p>Your attempt has been saved to your profile.</p>
    <div class="score">${score} <small>/ ${maxScore}</small></div>
    <table class="sum" style="max-width:480px;margin:18px 0 24px"><tr><th>Section</th><th>Correct</th><th>Incorrect</th><th>Unattempted</th><th>Score</th></tr>${subRows}
    <tr><td>Total</td><td>${correct}</td><td>${wrong}</td><td>${unattempted}</td><td>${score}</td></tr></table>
    <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center">
      <a class="btn mark" id="analysisBtn" href="profile.html#recent-tests">View Detailed Analysis</a>
      <a class="btn save" href="tests.html">Back to Tests</a></div>`);

  try {
    const res = await fetch("/api/attempts", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ testKey: setKey, score, correct, wrong, unattempted, responses })
    });
    if (res.ok) {
      clearSaved();
      const d = await res.json();
      if (d.attemptId) $("analysisBtn").href = `profile.html?viewAttempt=${d.attemptId}`;
    }
  } catch (e) { console.warn("Couldn't save attempt to server:", e); }
}

// ===== Candidate =====
async function loadCandidate() {
  let name = "Student", owner = "";
  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (res.ok) {
      const d = await res.json();
      if (d.authenticated && d.user) {
        name = d.user.fullName || d.user.name || "Student";
        owner = String(d.user.id ?? d.user.userId ?? d.user.email ?? name);
      }
    }
  } catch (e) { console.warn("Could not load candidate profile:", e); }
  $("candidate-name").textContent = $("p-name").textContent = name;
  $("candidate-avatar").textContent = $("p-avatar").textContent = name.charAt(0).toUpperCase();
  return owner;
}

// ===== Start =====
(async () => {
  if (!meta) {
    showPanel(`<h2>Invalid test link</h2><p>This test link isn't recognised. Please start the test again from the tests page.</p><a class="btn save" href="tests.html">Back to Tests</a>`);
    return;
  }
  $("exam-title").textContent = meta.title;
  $("exam-name").textContent = meta.examName;
  document.title = `${meta.title} - LaunchIt JEE`;
  initActions();

  const owner = await loadCandidate();
  progressKey = `jeeportal:test:v1:${owner || "anon"}:${setKey}`;

  let saved = loadSaved();
  if (saved && saved.endsAt > Date.now()) {
    const mins = Math.max(1, Math.ceil((saved.endsAt - Date.now()) / 60000));
    if (!confirm(`You have an unfinished test with about ${mins} minute(s) left.\n\nOK = resume it\nCancel = discard it and start again`)) {
      clearSaved(); saved = null;
    }
  }

  let fresh = false;
  if (saved) {
    questions = saved.questions; buildGroups();
  } else {
    const rows = await loadQuestionSet(setKey);
    if (rows === null) return;
    if (!rows.length) {
      showPanel(`<h2>No questions found</h2><p>There are no questions for this test yet.</p><a class="btn save" href="tests.html">Back to Tests</a>`);
      return;
    }
    prepare(rows); fresh = true;
  }

  if (saved) {
    Object.assign(answers, saved.answers); Object.assign(status, saved.status);
    Object.assign(markedHistory, saved.markedHistory); Object.assign(changed, saved.changed);
    Object.assign(timeSpent, saved.timeSpent);
    cur = Math.min(Math.max(parseInt(saved.cur, 10) || 0, 0), questions.length - 1);
    endsAt = saved.endsAt;
  } else {
    questions.forEach((_, i) => { status[i] = "not-visited"; timeSpent[i] = 0; });
    status[0] = "not-answered";
    endsAt = Date.now() + meta.durationMin * 60 * 1000;
  }

  persistEnabled = true;
  renderTabs(); render(); renderPalette(); updateTimer();
  timerHandle = setInterval(updateTimer, 1000);
  setInterval(persist, 15000);
  window.addEventListener("pagehide", persist);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") persist(); });
})();
})();