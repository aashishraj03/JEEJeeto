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

    // Populate Headers
    if (modalTitle) modalTitle.textContent = attempt.test_key.replace(/-/g, ' ').toUpperCase();
    if (modalDate) modalDate.textContent = `Attempted on ${new Date(attempt.attempted_at).toLocaleString()}`;

    // Compute Metrics & Aggregations
    const totalQuestions = responses.length || 75;
    let totalTimeSec = 0;
    let correctTimeSec = 0;
    let wrongTimeSec = 0;

    const subjectStats = {
      Physics: { total: 0, attempted: 0, correct: 0, wrong: 0, time: 0 },
      Chemistry: { total: 0, attempted: 0, correct: 0, wrong: 0, time: 0 },
      Mathematics: { total: 0, attempted: 0, correct: 0, wrong: 0, time: 0 }
    };

    const chapterStats = {};

    responses.forEach(r => {
      const qTime = r.time_spent_seconds || 0;
      totalTimeSec += qTime;

      const isAtt = r.selected_option !== null && r.selected_option !== undefined;
      if (isAtt) {
        if (r.is_correct) correctTimeSec += qTime;
        else wrongTimeSec += qTime;
      }

      // Subject stats
      if (subjectStats[r.subject]) {
        subjectStats[r.subject].total++;
        if (isAtt) subjectStats[r.subject].attempted++;
        if (r.is_correct) subjectStats[r.subject].correct++;
        else if (isAtt) subjectStats[r.subject].wrong++;
        subjectStats[r.subject].time += qTime;
      }

      // Chapter stats
      const chap = r.chapter || `${r.subject} Unit`;
      if (!chapterStats[chap]) {
        chapterStats[chap] = { subject: r.subject, total: 0, correct: 0, wrong: 0, time: 0 };
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
      const subScore = (st.correct * 4) - (st.wrong * 1);
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
      const isAtt = r.selected_option !== null && r.selected_option !== undefined;
      const isCorr = r.is_correct;
      const isSkipped = !isAtt;
      const timeOnQ = formatDuration(r.time_spent_seconds || 0);

      let badgeClass = isCorr ? 'badge-correct' : (isSkipped ? 'badge-skipped' : 'badge-wrong');
      let badgeText = isCorr ? 'Correct (+4)' : (isSkipped ? 'Skipped (0)' : 'Incorrect (-1)');
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
          <div style="margin-bottom: 10px;">${optionsHtml}</div>
          <div style="background: #f8fafc; border-left: 3px solid #0284c7; padding: 8px 12px; border-radius: 0 4px 4px 0;">
            <strong style="font-size: 11.5px; color: #0369a1; display: block; margin-bottom: 2px;">Solution:</strong>
            <div style="font-size: 12.5px; color: #334155;">${r.explanation || `The correct answer is Option ${optionLetters[r.correct_option] || 'A'}.`}</div>
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
          <strong style="font-size: 18px; color: #16a34a;">${attempt.score} <span style="font-size: 11px; color: #64748b;">/ 300</span></strong>
        </div>
        <div style="background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center;">
          <span style="font-size: 10.5px; color: #64748b; display: block;">Accuracy</span>
          <strong style="font-size: 18px; color: #0284c7;">${overallAccuracy}%</strong>
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
            <div style="background: #f8fafc; padding: 10px 12px; border-radius: 6px; border-left: 3px solid #0284c7;">
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