// ===== Attempt titles & chapter lists (shared by the history cards and the analysis modal) =====
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Title for an attempt. Whole-syllabus keys get a fixed label; everything else
// is named after its chapter(s). Falls back to the formatted key for very old
// attempts that have no chapter data stored at all.
const JEE_MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// A full exam sitting: "jm-2026-04-02-morning" or "ja-2025-p1".
function getPaperTitleFromKey(key) {
  let m = key.match(/^jm-(\d{4})-(\d{2})-(\d{2})-(morning|evening)$/);
  if (m) {
    const shift = m[4] === 'morning' ? 'Morning' : 'Evening';
    return `JEE Main ${m[1]} \u00b7 ${parseInt(m[3], 10)} ${JEE_MONTH_NAMES[parseInt(m[2], 10) - 1] || ''} \u00b7 ${shift} Shift`;
  }
  m = key.match(/^ja-(\d{4})-p([12])$/);
  if (m) return `JEE Advanced ${m[1]} \u00b7 Paper ${m[2]}`;
  return null;
}

// Numerical-answer rows vs MCQ rows (the attempt analysis stores both).
function isNumericalRow(r) { return r.question_type === 'numerical'; }
function isAttempted(r) {
  if (isNumericalRow(r)) {
    return r.selected_value !== null && r.selected_value !== undefined && r.selected_value !== '';
  }
  return r.selected_option !== null && r.selected_option !== undefined;
}
// The accepted answer of a numerical question: a window if it has one, else the value.
function formatCorrectAnswer(r) {
  if (r.correct_min !== null && r.correct_min !== undefined && r.correct_max !== null && r.correct_max !== undefined) {
    return `${r.correct_min} to ${r.correct_max}`;
  }
  return r.correct_value !== null && r.correct_value !== undefined ? String(r.correct_value) : '\u2014';
}

function getAttemptTitle(testKey, chapters) {
  const key = String(testKey || '').toLowerCase();
  const list = Array.isArray(chapters) ? chapters.filter(Boolean) : [];

  const paperTitle = getPaperTitleFromKey(key);
  if (paperTitle) return paperTitle;

  let m = key.match(/^c(\d+)-(phy|chem|math)-(full|subject|revision)$/);
  if (m) {
    const subject = { phy: 'Physics', chem: 'Chemistry', math: 'Mathematics' }[m[2]];
    const label = { full: 'Full Syllabus Test', subject: 'Subject Test', revision: 'Unit Test / Revision' }[m[3]];
    return `Class ${m[1]} ${subject} \u2014 ${label}`;
  }
  m = key.match(/^c(\d+)-mock$/);
  if (m) return `Class ${m[1]} \u2014 Mock Test`;

  if (list.length === 1) return list[0];
  if (list.length > 1) return 'Multi-chapter Test';
  return key.replace(/-/g, ' ').toUpperCase();
}

// Chapters covered by an attempt row from GET /api/attempts. Uses the new
// `chapters` list; older responses only had `chapter_name`.
function getAttemptChapters(att) {
  if (Array.isArray(att.chapters) && att.chapters.length > 0) return att.chapters.filter(Boolean);
  return att.chapter_name ? [att.chapter_name] : [];
}

// The "chapters covered" line under an attempt's title: nothing for a
// single-chapter test, names inline for up to 3, a tap-to-expand list beyond that.
function renderAttemptChaptersHtml(att) {
  const names = getAttemptChapters(att).map(escapeHtml);
  if (names.length < 2) return '';
  const list = names.join(' &bull; ');
  if (names.length <= 3) {
    return `<div style="font-size:12px; color:#475569; margin-top:3px; line-height:1.5;">${list}</div>`;
  }
  return `<details onclick="event.stopPropagation()" style="margin-top:4px; font-size:12px; color:#475569;">
            <summary style="cursor:pointer; color:#D97706; font-weight:600;">${names.length} chapters covered</summary>
            <div style="margin-top:4px; line-height:1.7;">${list}</div>
          </details>`;
}

// ===== Duration Formatter =====
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

// ===== Switch Tabs Inside the Analysis Modal =====
window.switchProfileAnalysisTab = function(tabId) {
  document.querySelectorAll('.profile-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.profile-tab-pane').forEach(pane => {
    pane.style.display = pane.id === `profile-pane-${tabId}` ? 'block' : 'none';
  });
};

// ===== Open & Render Test Analysis Modal =====
async function openTestAnalysis(attemptId) {
  const modal = document.getElementById('analysisModal');
  const modalBody = document.getElementById('analysisModalBody');
  const modalTitle = document.getElementById('modalTestTitle');
  const modalDate = document.getElementById('modalTestDate');

  if (!modal || !modalBody) return;
  modal.style.display = 'flex';
  modalBody.innerHTML = '<div style="padding: 60px; text-align: center; color: #64748b;">Loading test analytics and question breakdown...</div>';

  try {
    const res = await fetch(`/api/attempts/${attemptId}/analysis`, { credentials: 'include' });
    if (!res.ok) {
      modalBody.innerHTML = '<div style="padding: 40px; text-align: center; color: #dc2626;">Failed to load analysis for this attempt.</div>';
      return;
    }

    const { attempt, responses } = await res.json();

    // Whole-syllabus tests get a fixed label; chapter tests use the real chapter
    // name (from the questions table, via the chapter column); the formatted key
    // is only a fallback for older attempts with no chapter data stored.
    const attemptChapters = [...new Set(responses.map(r => r.chapter).filter(Boolean))];
    if (modalTitle) modalTitle.textContent = getAttemptTitle(attempt.test_key, attemptChapters);
    if (modalDate) modalDate.textContent = `Attempted on ${new Date(attempt.attempted_at).toLocaleString()}`;

    // Compute Metrics & Aggregations
    const totalQuestions = responses.length || 75;
    const maxScore = totalQuestions * 4;
    let totalTimeSec = 0;
    let correctTimeSec = 0;
    let wrongTimeSec = 0;

    // JEE Subject Groupings (wrongMcq = wrong MCQs only, since a wrong numerical costs 0)
    const subjectStats = {
      Physics: { total: 0, attempted: 0, correct: 0, wrong: 0, wrongMcq: 0, time: 0 },
      Chemistry: { total: 0, attempted: 0, correct: 0, wrong: 0, wrongMcq: 0, time: 0 },
      Mathematics: { total: 0, attempted: 0, correct: 0, wrong: 0, wrongMcq: 0, time: 0 }
    };

    const chapterStats = {};

    responses.forEach(r => {
      const qTime = r.time_spent_seconds || 0;
      totalTimeSec += qTime;

      const isAtt = isAttempted(r);
      if (isAtt) {
        if (r.is_correct) correctTimeSec += qTime;
        else wrongTimeSec += qTime;
      }

      // Map subject name safely to Physics, Chemistry or Mathematics
      let subjKey = r.subject || 'Physics';
      const subjLower = subjKey.toLowerCase();
      if (subjLower.includes('math')) subjKey = 'Mathematics';
      else if (subjLower.includes('chem')) subjKey = 'Chemistry';
      else if (subjLower.includes('phy')) subjKey = 'Physics';

      if (!subjectStats[subjKey]) {
        subjectStats[subjKey] = { total: 0, attempted: 0, correct: 0, wrong: 0, wrongMcq: 0, time: 0 };
      }

      subjectStats[subjKey].total++;
      if (isAtt) subjectStats[subjKey].attempted++;
      if (r.is_correct) subjectStats[subjKey].correct++;
      else if (isAtt) {
        subjectStats[subjKey].wrong++;
        if (!isNumericalRow(r)) subjectStats[subjKey].wrongMcq++;
      }
      subjectStats[subjKey].time += qTime;

      // Chapter stats
      const chap = r.chapter || `${subjKey} Unit`;
      if (!chapterStats[chap]) {
        chapterStats[chap] = { subject: subjKey, total: 0, correct: 0, wrong: 0, time: 0 };
      }
      chapterStats[chap].total++;
      if (r.is_correct) chapterStats[chap].correct++;
      else if (isAtt) chapterStats[chap].wrong++;
      chapterStats[chap].time += qTime;
    });

    const totalAttempted = (attempt.correct_count || 0) + (attempt.wrong_count || 0);
    const overallAccuracy = totalAttempted > 0 ? Math.round(((attempt.correct_count || 0) / totalAttempted) * 100) : 0;
    const avgTimePerQ = formatDuration(Math.round(totalTimeSec / (totalQuestions || 1)));
    const avgCorrectTime = attempt.correct_count > 0 ? formatDuration(Math.round(correctTimeSec / attempt.correct_count)) : "0m 00s";
    const avgWrongTime = attempt.wrong_count > 0 ? formatDuration(Math.round(wrongTimeSec / attempt.wrong_count)) : "0m 00s";

    // 1. Subject Rows
    const subjectRowsHtml = Object.keys(subjectStats).map(subj => {
      const st = subjectStats[subj];
      const acc = st.attempted > 0 ? `${Math.round((st.correct / st.attempted) * 100)}%` : '0%';
      const subScore = (st.correct * 4) - (st.wrongMcq * 1);
      return `
        <tr style="border-bottom: 1px solid #e2e8f0; font-size: 13px;">
          <td style="padding: 10px 14px; font-weight: 700; color: #0f172a;">${subj}</td>
          <td style="padding: 10px 14px;">${st.attempted} / ${st.total}</td>
          <td style="padding: 10px 14px; color: #16a34a; font-weight: 700;">${st.correct}</td>
          <td style="padding: 10px 14px; color: #dc2626; font-weight: 700;">${st.wrong}</td>
          <td style="padding: 10px 14px; font-weight: 600;">${acc}</td>
          <td style="padding: 10px 14px; color: #64748b;">${formatDuration(st.time)}</td>
          <td style="padding: 10px 14px; font-weight: 800; color: ${subScore >= 0 ? '#16a34a' : '#dc2626'};">${subScore}</td>
        </tr>
      `;
    }).join('');

    // 2. Chapter Rows
    const chapterRowsHtml = Object.keys(chapterStats).map(chapName => {
      const cs = chapterStats[chapName];
      const accNum = cs.total > 0 ? Math.round((cs.correct / cs.total) * 100) : 0;
      let badge = `<span style="background: #fef3c7; color: #b45309; padding: 2px 6px; border-radius: 4px; font-size: 10.5px; font-weight: 700;">Needs Practice</span>`;
      if (accNum >= 75) {
        badge = `<span style="background: #dcfce7; color: #15803d; padding: 2px 6px; border-radius: 4px; font-size: 10.5px; font-weight: 700;">Strong Area</span>`;
      } else if (accNum < 40) {
        badge = `<span style="background: #fee2e2; color: #b91c1c; padding: 2px 6px; border-radius: 4px; font-size: 10.5px; font-weight: 700;">Weak Area</span>`;
      }
      return `
        <tr style="border-bottom: 1px solid #e2e8f0; font-size: 12.5px;">
          <td style="padding: 10px 14px; font-weight: 600; color: #0f172a;">${chapName}</td>
          <td style="padding: 10px 14px; color: #64748b;">${cs.subject}</td>
          <td style="padding: 10px 14px;">${cs.correct} / ${cs.total}</td>
          <td style="padding: 10px 14px; font-weight: 700;">${accNum}%</td>
          <td style="padding: 10px 14px;">${badge}</td>
        </tr>
      `;
    }).join('');

    // 3. Question Cards
    const optionLetters = ['A', 'B', 'C', 'D'];
    const questionsListHtml = responses.map((r) => {
      const isAtt = isAttempted(r);
      const isCorr = r.is_correct;
      const isSkipped = !isAtt;
      const timeOnQ = formatDuration(r.time_spent_seconds || 0);

      let badgeClass = isCorr ? 'badge-correct' : (isSkipped ? 'badge-skipped' : 'badge-wrong');
      const isNumQ = isNumericalRow(r);
      let badgeText = isCorr ? 'Correct (+4)' : (isSkipped ? 'Skipped (0)' : (isNumQ ? 'Incorrect (0)' : 'Incorrect (-1)'));
      let qOptions = [r.option_a, r.option_b, r.option_c, r.option_d];

      const optionsHtml = qOptions.map((opt, optIdx) => {
        if (!opt) return '';
        let optStyle = "padding: 8px 12px; border-radius: 4px; border: 1px solid #e2e8f0; margin-bottom: 6px; font-size: 13px;";
        let tag = "";

        if (optIdx === r.correct_option) {
          optStyle = "padding: 8px 12px; border-radius: 4px; border: 1px solid #16a34a; background: #dcfce7; color: #15803d; font-weight: 700; margin-bottom: 6px; font-size: 13px;";
          tag = `<span style="float: right; font-size: 11px; background: #16a34a; color: #fff; padding: 1px 6px; border-radius: 3px;">Correct Answer</span>`;
        } else if (optIdx === r.selected_option && !isCorr) {
          optStyle = "padding: 8px 12px; border-radius: 4px; border: 1px solid #dc2626; background: #fee2e2; color: #b91c1c; font-weight: 700; margin-bottom: 6px; font-size: 13px;";
          tag = `<span style="float: right; font-size: 11px; background: #dc2626; color: #fff; padding: 1px 6px; border-radius: 3px;">Your Choice</span>`;
        }

        return `<div style="${optStyle}">${optionLetters[optIdx]}. ${opt} ${tag}</div>`;
      }).join('');

      const numericalHtml = `
        <div style="padding: 8px 12px; border-radius: 4px; border: 1px solid ${isCorr ? '#16a34a' : '#dc2626'}; background: ${isCorr ? '#dcfce7' : '#fee2e2'}; margin-bottom: 6px; font-size: 13px;">
          Your answer: <strong>${isSkipped ? 'Not attempted' : escapeHtml(r.selected_value)}</strong>
        </div>
        <div style="padding: 8px 12px; border-radius: 4px; border: 1px solid #16a34a; background: #dcfce7; color: #15803d; margin-bottom: 6px; font-size: 13px;">
          Correct answer: <strong>${escapeHtml(formatCorrectAnswer(r))}</strong>
        </div>`;

      return `
        <div class="analysis-q-card" style="background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 14px; text-align: left;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px; flex-wrap: wrap; gap: 8px;">
            <div>
              <strong style="font-size: 13.5px; color: #0f172a;">Q${r.question_num}. ${r.subject}</strong>
              <span style="font-size: 11.5px; color: #64748b; margin-left: 6px;">(${r.chapter || 'General'})</span>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size: 11.5px; color: #64748b;">⏱ ${timeOnQ}</span>
              <span class="${badgeClass}" style="font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 4px;">${badgeText}</span>
            </div>
          </div>
          <div style="font-size: 13.5px; color: #1e293b; margin-bottom: 12px; line-height: 1.55;">${r.question_text || `[Question No. ${r.question_num}]`}</div>
          <div style="margin-bottom: 10px;">${isNumQ ? numericalHtml : optionsHtml}</div>
          <div style="background: #f8fafc; border-left: 3px solid #D97706; padding: 8px 12px; border-radius: 0 4px 4px 0;">
            <strong style="font-size: 11.5px; color: #D97706; display: block; margin-bottom: 2px;">Solution:</strong>
            <div style="font-size: 12.5px; color: #334155;">${r.explanation || (isNumQ ? `The correct answer is ${escapeHtml(formatCorrectAnswer(r))}.` : `The correct answer is Option ${optionLetters[r.correct_option] || 'A'}.`)}</div>
          </div>
        </div>
      `;
    }).join('');

    // Inject Complete Analytics Body
    modalBody.innerHTML = `
      <!-- Score Metric Cards -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 10px; margin-bottom: 20px;">
        <div style="background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center;">
          <span style="font-size: 10.5px; color: #64748b; display: block;">Total Score</span>
          <strong style="font-size: 18px; color: #D97706;">${attempt.score} <span style="font-size: 11px; color: #64748b;">/ ${maxScore}</span></strong>
        </div>
        <div style="background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center;">
          <span style="font-size: 10.5px; color: #64748b; display: block;">Accuracy</span>
          <strong style="font-size: 18px; color: #D97706;">${overallAccuracy}%</strong>
        </div>
        <div style="background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center;">
          <span style="font-size: 10.5px; color: #64748b; display: block;">Correct</span>
          <strong style="font-size: 18px; color: #16a34a;">${attempt.correct_count}</strong>
        </div>
        <div style="background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center;">
          <span style="font-size: 10.5px; color: #64748b; display: block;">Incorrect</span>
          <strong style="font-size: 18px; color: #dc2626;">${attempt.wrong_count}</strong>
        </div>
        <div style="background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center;">
          <span style="font-size: 10.5px; color: #64748b; display: block;">Skipped</span>
          <strong style="font-size: 18px; color: #475569;">${attempt.unattempted_count}</strong>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div style="display: flex; gap: 8px; border-bottom: 2px solid #e2e8f0; margin-bottom: 16px;">
        <button class="profile-tab-btn active" data-tab="overview" onclick="switchProfileAnalysisTab('overview')">Subject &amp; Time Diagnostics</button>
        <button class="profile-tab-btn" data-tab="chapters" onclick="switchProfileAnalysisTab('chapters')">Chapter Insights</button>
        <button class="profile-tab-btn" data-tab="questions" onclick="switchProfileAnalysisTab('questions')">Questions &amp; Solutions</button>
      </div>

      <!-- TAB 1: SUBJECT & TIME -->
      <div class="profile-tab-pane" id="profile-pane-overview" style="display: block;">
        <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 16px;">
          <div style="padding: 10px 14px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-weight: 700; font-size: 13px;">Subject Breakdown</div>
          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
              <thead>
                <tr style="background: #f1f5f9; font-size: 11.5px; color: #64748b;">
                  <th style="padding: 8px 12px;">Subject</th>
                  <th style="padding: 8px 12px;">Attempted</th>
                  <th style="padding: 8px 12px;">Correct</th>
                  <th style="padding: 8px 12px;">Wrong</th>
                  <th style="padding: 8px 12px;">Accuracy</th>
                  <th style="padding: 8px 12px;">Time Spent</th>
                  <th style="padding: 8px 12px;">Score</th>
                </tr>
              </thead>
              <tbody>${subjectRowsHtml}</tbody>
            </table>
          </div>
        </div>

        <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; text-align: left;">
          <strong style="font-size: 13px; color: #0f172a; display: block; margin-bottom: 10px;">Time Diagnostics</strong>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px;">
            <div style="background: #f8fafc; padding: 10px 12px; border-radius: 6px; border-left: 3px solid #D97706;">
              <span style="font-size: 11px; color: #64748b; display: block;">Avg Time / Question</span>
              <strong style="font-size: 14px; color: #0f172a;">${avgTimePerQ}</strong>
            </div>
            <div style="background: #f8fafc; padding: 10px 12px; border-radius: 6px; border-left: 3px solid #16a34a;">
              <span style="font-size: 11px; color: #64748b; display: block;">Avg Time on Correct</span>
              <strong style="font-size: 14px; color: #16a34a;">${avgCorrectTime}</strong>
            </div>
            <div style="background: #f8fafc; padding: 10px 12px; border-radius: 6px; border-left: 3px solid #dc2626;">
              <span style="font-size: 11px; color: #64748b; display: block;">Avg Time on Incorrect</span>
              <strong style="font-size: 14px; color: #dc2626;">${avgWrongTime}</strong>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB 2: CHAPTER INSIGHTS -->
      <div class="profile-tab-pane" id="profile-pane-chapters" style="display: none;">
        <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
          <div style="padding: 10px 14px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-weight: 700; font-size: 13px;">Chapter Strengths &amp; Weaknesses</div>
          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
              <thead>
                <tr style="background: #f1f5f9; font-size: 11.5px; color: #64748b;">
                  <th style="padding: 8px 12px;">Chapter</th>
                  <th style="padding: 8px 12px;">Subject</th>
                  <th style="padding: 8px 12px;">Correct</th>
                  <th style="padding: 8px 12px;">Accuracy</th>
                  <th style="padding: 8px 12px;">Recommendation</th>
                </tr>
              </thead>
              <tbody>${chapterRowsHtml}</tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- TAB 3: QUESTIONS & SOLUTIONS -->
      <div class="profile-tab-pane" id="profile-pane-questions" style="display: none;">
        ${questionsListHtml}
      </div>
    `;

    if (window.MathJax && window.MathJax.typesetPromise) {
      MathJax.typesetPromise([modalBody]).catch(() => {});
    }

  } catch (err) {
    console.error('Failed to render modal analysis:', err);
    modalBody.innerHTML = '<div style="padding: 40px; text-align: center; color: #dc2626;">Error loading test data.</div>';
  }
}

// ===== Close Modal Trigger =====
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('analysisModal');
  const closeBtn = document.getElementById('closeAnalysisBtn');

  if (closeBtn && modal) {
    closeBtn.onclick = () => { modal.style.display = 'none'; };
  }
  if (modal) {
    modal.onclick = (e) => {
      if (e.target === modal) modal.style.display = 'none';
    };
  }
});

// ===== Edit Profile Modal Handlers =====
document.addEventListener('DOMContentLoaded', () => {
  const editBtn = document.querySelector('.edit-profile-btn');
  const editModal = document.getElementById('editProfileModal');
  const closeEditBtn = document.getElementById('closeEditProfileBtn');
  const cancelEditBtn = document.getElementById('cancelEditProfileBtn');
  const editForm = document.getElementById('editProfileForm');
  const editFullNameInput = document.getElementById('editFullNameInput');
  const editPhoneInput = document.getElementById('editPhoneInput');
  const editEmailInput = document.getElementById('editEmailInput');

  // Open Modal & Pre-fill User Values
  if (editBtn && editModal) {
    editBtn.onclick = () => {
      const currentName = document.querySelector('.profile-main-info h2')?.textContent?.trim() || '';
      const currentEmail = document.querySelector('.profile-details .detail-item:nth-child(2) strong')?.textContent?.trim() || '';
      
      if (editFullNameInput) editFullNameInput.value = currentName;
      if (editEmailInput) editEmailInput.value = currentEmail;
      
      editModal.style.display = 'flex';
    };
  }

  // Close Modal Helper
  const closeEditModal = () => {
    if (editModal) editModal.style.display = 'none';
  };

  if (closeEditBtn) closeEditBtn.onclick = closeEditModal;
  if (cancelEditBtn) cancelEditBtn.onclick = closeEditModal;
  if (editModal) {
    editModal.onclick = (e) => {
      if (e.target === editModal) closeEditModal();
    };
  }

  // Submit Form to PUT /api/auth/me
  if (editForm) {
    editForm.onsubmit = async (e) => {
      e.preventDefault();
      const updatedName = editFullNameInput.value.trim();
      const updatedPhone = editPhoneInput.value.trim();

      if (!updatedName) {
        alert('Name cannot be empty.');
        return;
      }

      if (updatedPhone && !/^[6-9]\d{9}$/.test(updatedPhone)) {
        alert('Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.');
        return;
      }

      const saveBtn = document.getElementById('saveProfileBtn');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
      }

      try {
        const res = await fetch('/api/auth/me', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ fullName: updatedName, phone: updatedPhone || undefined })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          const newName = data.user.fullName || data.user.name;
          const initial = newName.charAt(0).toUpperCase();

          // Update UI Elements live
          document.querySelectorAll('.profile-avatar, .large-avatar').forEach(el => el.textContent = initial);
          document.querySelectorAll('.sidebar-user-info h3, .profile-main-info h2').forEach(el => el.textContent = newName);
          
          const nameDetail = document.querySelector('.profile-details .detail-item:nth-child(1) strong');
          if (nameDetail) nameDetail.textContent = newName;

          closeEditModal();
        } else {
          alert(data.error || 'Failed to update profile.');
        }
      } catch (err) {
        console.error('Update profile network error:', err);
        alert('Network error while saving changes.');
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Changes';
        }
      }
    };
  }
});

// ===== Email & Password Change Logic with 14-Day Cooldown Alerts =====
document.addEventListener('DOMContentLoaded', () => {
  // 1. Email Handlers
  const openEmailBtn = document.getElementById('openChangeEmailBtn');
  const emailModal = document.getElementById('changeEmailModal');
  const closeEmailBtn = document.getElementById('closeEmailModalBtn');
  const cancelEmailBtn = document.getElementById('cancelEmailModalBtn');
  const sendEmailOtpBtn = document.getElementById('sendEmailOtpBtn');
  const changeEmailForm = document.getElementById('changeEmailForm');

  if (openEmailBtn && emailModal) {
    openEmailBtn.onclick = () => { emailModal.style.display = 'flex'; };
  }
  const closeEmailModal = () => { if (emailModal) emailModal.style.display = 'none'; };
  if (closeEmailBtn) closeEmailBtn.onclick = closeEmailModal;
  if (cancelEmailBtn) cancelEmailBtn.onclick = closeEmailModal;

  if (sendEmailOtpBtn) {
    sendEmailOtpBtn.onclick = async () => {
      const newEmail = document.getElementById('newEmailInput')?.value?.trim();
      if (!newEmail) {
        alert('Please enter your new email address.');
        return;
      }

      sendEmailOtpBtn.disabled = true;
      sendEmailOtpBtn.textContent = 'Sending...';

      try {
        const res = await fetch('/api/auth/security/send-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ type: 'email_change', newEmail })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          alert(data.message || 'Verification OTP sent to your registered email.');
        } else {
          alert(data.error || 'Failed to send OTP.');
        }
      } catch (err) {
        alert('Network error sending OTP.');
      } finally {
        sendEmailOtpBtn.disabled = false;
        sendEmailOtpBtn.textContent = 'Send OTP';
      }
    };
  }

  if (changeEmailForm) {
    changeEmailForm.onsubmit = async (e) => {
      e.preventDefault();
      const newEmail = document.getElementById('newEmailInput')?.value?.trim();
      const otp = document.getElementById('emailOtpInput')?.value?.trim();

      try {
        const res = await fetch('/api/auth/security/change-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ newEmail, otp })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          alert('Email updated successfully! Note that you cannot change it again for 14 days.');
          const emailDetail = document.querySelector('.profile-details .detail-item:nth-child(2) strong');
          if (emailDetail) emailDetail.textContent = data.email;
          closeEmailModal();
        } else {
          alert(data.error || 'Failed to update email.');
        }
      } catch (err) {
        alert('Network error updating email.');
      }
    };
  }

  // 2. Password Handlers
  const openPassBtn = document.getElementById('openChangePassBtn');
  const passModal = document.getElementById('changePasswordModal');
  const closePassBtn = document.getElementById('closePassModalBtn');
  const cancelPassBtn = document.getElementById('cancelPassModalBtn');
  const sendPassOtpBtn = document.getElementById('sendPassOtpBtn');
  const changePassForm = document.getElementById('changePasswordForm');

  if (openPassBtn && passModal) {
    openPassBtn.onclick = () => { passModal.style.display = 'flex'; };
  }
  const closePassModal = () => { if (passModal) passModal.style.display = 'none'; };
  if (closePassBtn) closePassBtn.onclick = closePassModal;
  if (cancelPassBtn) cancelPassBtn.onclick = closePassModal;

  if (sendPassOtpBtn) {
    sendPassOtpBtn.onclick = async () => {
      sendPassOtpBtn.disabled = true;
      sendPassOtpBtn.textContent = 'Sending OTP...';

      try {
        const res = await fetch('/api/auth/security/send-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ type: 'password_change' })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          alert(data.message || 'OTP sent to your registered email.');
        } else {
          alert(data.error || 'Failed to send OTP.');
        }
      } catch (err) {
        alert('Network error sending OTP.');
      } finally {
        sendPassOtpBtn.disabled = false;
        sendPassOtpBtn.textContent = 'Resend OTP';
      }
    };
  }

  if (changePassForm) {
    changePassForm.onsubmit = async (e) => {
      e.preventDefault();
      const otp = document.getElementById('passOtpInput')?.value?.trim();
      const newPassword = document.getElementById('newPasswordInput')?.value;

      try {
        const res = await fetch('/api/auth/security/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ otp, newPassword })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          alert('Password updated successfully! Note that you cannot change it again for 14 days.');
          closePassModal();
        } else {
          alert(data.error || 'Failed to update password.');
        }
      } catch (err) {
        alert('Network error updating password.');
      }
    };
  }
});