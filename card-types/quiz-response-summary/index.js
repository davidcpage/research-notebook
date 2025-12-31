/**
 * Quiz Response Summary card type module.
 *
 * Provides a cohort/question-centric view for grading quiz responses.
 * Aggregates responses from quiz-response cards in the same folder.
 */

import {
    escapeHtml,
    marked,
    truncateText,
    findCardById,
    findSectionByItem,
    getSettings,
    getRoster,
    getTemplateRegistry,
    getCurrentViewingCard,
    getSubdirFromPath,
    showToast,
    render,
    openViewer,
    saveCardFile
} from '/js/framework.js';

// ========== HELPER FUNCTIONS ==========

// Get student display name from roster data
// Returns "Name (id)" if roster data available and show_student_names is true, else "Student id"
function getStudentDisplayName(studentId) {
    const notebookSettings = getSettings();
    const roster = getRoster();
    const showNames = notebookSettings?.grading?.show_student_names !== false;

    if (showNames && roster?.students?.[studentId]?.name) {
        return `${roster.students[studentId].name} (${studentId})`;
    }
    return `Student ${studentId}`;
}

// Get the effective grade (highest priority in hierarchy: teacher > claude > auto)
function getEffectiveGrade(answer) {
    if (answer.teacherGrade) return answer.teacherGrade;
    if (answer.claudeGrade) return answer.claudeGrade;
    if (answer.autoGrade) return answer.autoGrade;
    return null;
}

// Compute summary data dynamically from quiz-response cards
// Returns: { submittedCount, averageScore, maxScore, questions: [...], responseCards: [...] }
function computeSummaryData(summaryCard) {
    const quizId = summaryCard.quizId;
    // Use responseFolder if set, otherwise use summary's own folder (subdir within section)
    const targetFolder = summaryCard.responseFolder || getSubdirFromPath(summaryCard._path) || null;

    // Find the section containing this summary card
    const section = findSectionByItem(summaryCard);
    if (!section) {
        return { submittedCount: 0, averageScore: 0, maxScore: 0, questions: [], responseCards: [] };
    }

    // Find all quiz-response cards in the target folder
    const responseCards = section.items.filter(item => {
        if (item.template !== 'quiz-response') return false;
        if (item.quizId !== quizId) return false;
        // Match folder (subdir within section)
        return (getSubdirFromPath(item._path) || null) === targetFolder;
    });

    if (responseCards.length === 0) {
        return { submittedCount: 0, averageScore: 0, maxScore: 0, questions: [], responseCards: [] };
    }

    // Get quiz for question metadata
    const quiz = findCardById(quizId);
    const quizQuestions = quiz?.questions || [];

    // Build question-centric data structure
    const questions = [];
    const numQuestions = Math.max(
        quizQuestions.length,
        ...responseCards.map(r => r.answers?.length || 0)
    );

    for (let qIdx = 0; qIdx < numQuestions; qIdx++) {
        const quizQ = quizQuestions[qIdx] || {};
        const points = quizQ.points || 1;

        // Collect all answers for this question
        const answers = [];
        let correctCount = 0;
        let scoreSum = 0;
        let scoredCount = 0;
        let pendingCount = 0;

        for (const responseCard of responseCards) {
            const answer = responseCard.answers?.[qIdx];
            if (!answer) continue;

            const effectiveGrade = getEffectiveGrade(answer);

            answers.push({
                studentId: responseCard.studentId,
                responseCardId: responseCard.id,
                answer: answer.answer,
                autoGrade: answer.autoGrade,
                claudeGrade: answer.claudeGrade,
                teacherGrade: answer.teacherGrade
            });

            // Compute stats
            if (effectiveGrade) {
                scoreSum += effectiveGrade.score || 0;
                scoredCount++;
                if (answer.autoGrade?.status === 'correct') correctCount++;
            } else {
                pendingCount++;
            }
        }

        questions.push({
            questionIndex: qIdx,
            questionText: quizQ.question || `Question ${qIdx + 1}`,
            questionType: quizQ.type || 'short_answer',
            points: points,
            stats: {
                totalAnswers: answers.length,
                correctCount: correctCount,
                avgScore: scoredCount > 0 ? scoreSum / scoredCount : 0,
                pendingCount: pendingCount
            },
            answers: answers
        });
    }

    // Calculate overall stats
    const submittedCount = responseCards.length;
    let totalScore = 0;
    let maxScore = 0;

    for (const responseCard of responseCards) {
        totalScore += responseCard.totalScore || 0;
        maxScore = Math.max(maxScore, responseCard.maxScore || 0);
    }

    const averageScore = maxScore > 0 && submittedCount > 0
        ? (totalScore / submittedCount / maxScore) * 100
        : 0;

    return {
        submittedCount,
        averageScore,
        maxScore,
        questions,
        responseCards
    };
}

// Recalculate total score for a response card
function recalculateResponseScore(card) {
    let totalScore = 0;
    let maxScore = 0;

    for (const answer of card.answers) {
        const grade = getEffectiveGrade(answer);
        if (grade) {
            totalScore += grade.score || 0;
            maxScore += grade.maxScore || 1;
        }
    }

    card.totalScore = totalScore;
    card.maxScore = maxScore;
}

// Update response status based on grading progress
function updateResponseStatus(card) {
    const answers = card.answers || [];
    const allReviewed = answers.every(a => a.teacherGrade);
    const allGraded = answers.every(a => getEffectiveGrade(a) !== null);

    if (card.exportedToForms) {
        card.status = 'exported';
    } else if (allReviewed) {
        card.status = 'reviewed';
    } else if (allGraded) {
        card.status = 'graded';
    } else {
        card.status = 'pending';
    }
}

// Format student answer compactly for summary table
// question parameter enables showing "A: Option text" for multiple choice
function formatStudentAnswerCompact(answer, questionType, question = null) {
    if (answer === null || answer === undefined) {
        return '<span class="no-answer">—</span>';
    }

    // For multiple choice with options, show "A: Option text" format
    if ((questionType === 'multiple_choice' || questionType === 'dropdown') &&
        typeof answer === 'number' && question?.options) {
        const optionLetter = String.fromCharCode(65 + answer); // A, B, C, D
        const optionText = question.options[answer] || `Option ${answer + 1}`;
        const formatted = `${optionLetter}: ${optionText}`;
        // Truncate if needed
        if (formatted.length > 60) {
            return `<span title="${escapeHtml(formatted)}">${escapeHtml(formatted.substring(0, 57))}...</span>`;
        }
        return escapeHtml(formatted);
    }

    // For checkbox (multi-select), show all selected options
    if (questionType === 'checkbox' && Array.isArray(answer) && question?.options) {
        const formatted = answer.map(idx => {
            const optionLetter = String.fromCharCode(65 + idx);
            const optionText = question.options[idx] || `Option ${idx + 1}`;
            return `${optionLetter}: ${optionText}`;
        }).join('; ');
        if (formatted.length > 60) {
            return `<span title="${escapeHtml(formatted)}">${escapeHtml(formatted.substring(0, 57))}...</span>`;
        }
        return escapeHtml(formatted);
    }

    if (Array.isArray(answer)) {
        return escapeHtml(answer.join(', '));
    }

    if (typeof answer === 'object') {
        return '<span class="complex-answer">[complex]</span>';
    }

    const text = String(answer);
    if (text.length > 80) {
        return `<span title="${escapeHtml(text)}">${escapeHtml(text.substring(0, 77))}...</span>`;
    }

    return escapeHtml(text);
}

// ========== RENDER FUNCTIONS ==========

// Quiz response summary card preview: shows cohort overview stats
export function renderPreview(card, template) {
    const placeholder = template.card?.placeholder || '📊';
    const cohort = card.cohort || 'Responses';

    // Compute data dynamically from response cards
    const computed = computeSummaryData(card);
    const questions = computed.questions;
    const submittedCount = computed.submittedCount;

    if (questions.length === 0) {
        return `<div class="preview-placeholder">${placeholder}</div>`;
    }

    // Calculate overall stats from computed data
    const totalPending = questions.reduce((sum, q) => sum + (q.stats?.pendingCount || 0), 0);
    const avgScore = computed.averageScore > 0 ? Math.round(computed.averageScore) : null;

    // Determine status
    let statusBadge = '';
    if (totalPending > 0) {
        statusBadge = `<span class="summary-status-badge pending">${totalPending} pending</span>`;
    } else {
        statusBadge = '<span class="summary-status-badge complete">All graded</span>';
    }

    return `
        <div class="quiz-response-summary-preview">
            <div class="summary-cohort">${escapeHtml(cohort)}</div>
            <div class="summary-stats">
                <span class="summary-submitted">${submittedCount} submitted</span>
                ${avgScore !== null ? `<span class="summary-avg">Avg ${avgScore}%</span>` : ''}
            </div>
            ${statusBadge}
        </div>
    `;
}

// Quiz response summary viewer: question-centric grading interface
export function renderViewer(card, template) {
    const cohort = card.cohort || 'Responses';
    const quizId = card.quizId;

    // Compute data dynamically from response cards
    const computed = computeSummaryData(card);
    const questions = computed.questions;
    const submittedCount = computed.submittedCount;
    const avgScore = computed.averageScore > 0 ? Math.round(computed.averageScore) : null;

    if (questions.length === 0) {
        return '<div class="viewer-empty">No quiz responses found in this folder</div>';
    }

    // Get quiz for additional context
    const quiz = findCardById(quizId);

    let html = `<div class="quiz-response-summary-viewer" data-summary-id="${card.id}">`;

    // Header
    html += `<div class="summary-header">
        <div class="summary-cohort-name">${escapeHtml(cohort)}</div>
        <div class="summary-overview">
            <span class="summary-stat">${submittedCount} submitted</span>
            ${avgScore !== null ? `<span class="summary-stat">Avg ${avgScore}%</span>` : ''}
            ${quiz?.title ? `<span class="summary-quiz-ref">Quiz: ${escapeHtml(quiz.title)}</span>` : ''}
        </div>
    </div>`;

    // Question sections
    html += '<div class="summary-questions">';
    questions.forEach((q, idx) => {
        html += renderSummaryQuestionSection(q, idx, quiz);
    });
    html += '</div>';

    // Actions
    const totalPending = questions.reduce((sum, q) => sum + (q.stats?.pendingCount || 0), 0);
    if (totalPending > 0) {
        html += `<div class="summary-actions">
            <button class="summary-bulk-grade-btn" onclick="launchBulkGrading('${escapeHtml(card.id)}')" disabled title="Coming soon (dp-063)">
                Launch Bulk Grading (${totalPending} pending)
            </button>
        </div>`;
    }

    html += '</div>';
    return html;
}

// Render a single collapsible question section
function renderSummaryQuestionSection(question, index, quiz) {
    const qNum = index + 1;
    const stats = question.stats || {};
    const answers = question.answers || [];
    const questionText = question.questionText || `Question ${qNum}`;
    const questionType = question.questionType || 'short_answer';
    const points = question.points || 1;

    // Build stats display
    let statsHtml = '';
    if (questionType === 'multiple_choice' || questionType === 'checkbox' || questionType === 'dropdown') {
        // Auto-gradeable: show % correct
        const correctPct = stats.totalAnswers > 0
            ? Math.round((stats.correctCount || 0) / stats.totalAnswers * 100)
            : 0;
        statsHtml = `<span class="summary-q-stat">${correctPct}% correct</span>`;
    } else {
        // Manual grading needed: show avg score
        const avgScore = stats.avgScore !== undefined ? stats.avgScore.toFixed(1) : '—';
        statsHtml = `<span class="summary-q-stat">avg ${avgScore}/${points}</span>`;
    }

    // Pending badge
    if (stats.pendingCount > 0) {
        statsHtml += `<span class="summary-q-pending">${stats.pendingCount} pending</span>`;
    }

    // Use details/summary for native collapsible
    let html = `<details class="summary-question-section" data-question-index="${index}">
        <summary class="summary-question-header">
            <span class="summary-q-number">Q${qNum}</span>
            <span class="summary-q-text">${escapeHtml(truncateText(questionText, 60))}</span>
            <span class="summary-q-stats">${statsHtml}</span>
        </summary>
        <div class="summary-question-content">`;

    // Full question text if truncated
    if (questionText.length > 60) {
        html += `<div class="summary-q-full-text md-content">${marked.parse(questionText)}</div>`;
    }

    // Answers table - pass quiz to get options for multiple choice display
    const quizQuestion = quiz?.questions?.[index];
    html += '<div class="summary-answers-list">';
    answers.forEach(answer => {
        html += renderSummaryAnswerRow(answer, question, index, quizQuestion);
    });
    html += '</div>';

    html += '</div></details>';
    return html;
}

// Render a single student answer row in the summary with inline grade editing
// quizQuestion is optional and provides options for multiple choice display
function renderSummaryAnswerRow(answer, question, questionIndex, quizQuestion = null) {
    const studentId = answer.studentId || 'Unknown';
    const responseCardId = answer.responseCardId || '';
    const effectiveGrade = getEffectiveGrade(answer);
    const points = question.points || 1;

    // Determine status
    let statusClass = 'pending';
    let statusIcon = '⏳';
    if (answer.teacherGrade) {
        statusClass = 'reviewed';
        statusIcon = '✓';
    } else if (answer.claudeGrade) {
        statusClass = 'ai-graded';
        statusIcon = '🤖';
    } else if (answer.autoGrade) {
        const autoStatus = answer.autoGrade.status;
        if (autoStatus === 'correct') {
            statusClass = 'correct';
            statusIcon = '✓';
        } else if (autoStatus === 'incorrect') {
            statusClass = 'incorrect';
            statusIcon = '✗';
        } else if (autoStatus === 'partial') {
            statusClass = 'partial';
            statusIcon = '◐';
        }
    }

    // Determine if grading UI should be shown
    // Objective types have deterministic answers - no teacher override needed
    const objectiveTypes = ['multiple_choice', 'checkbox', 'dropdown', 'numeric', 'scale', 'grid'];
    const isObjective = objectiveTypes.includes(question.questionType);
    const autoStatus = answer.autoGrade?.status;
    const isAutoGraded = autoStatus === 'correct' || autoStatus === 'incorrect' || autoStatus === 'partial';

    // Skip grading UI for objective auto-graded questions
    const skipGradingUI = isObjective && isAutoGraded;

    // Show grading UI if: claudeGrade needs review, OR short_answer with incorrect autoGrade (teacher might accept variation)
    const needsGradingUI = !skipGradingUI && (
        answer.claudeGrade ||
        (question.questionType === 'short_answer' && autoStatus === 'incorrect')
    );

    // Format score - make editable for unreviewed answers
    let scoreHtml;
    if (answer.teacherGrade) {
        // Already reviewed - show final score
        scoreHtml = `<span class="summary-answer-score">${effectiveGrade.score}/${effectiveGrade.maxScore || points}</span>`;
    } else if (needsGradingUI) {
        // Needs grading - show inline editing
        const prefillScore = answer.claudeGrade?.score ?? '';
        scoreHtml = `<span class="summary-grade-inline">
            <input type="number" class="summary-score-input"
                   id="summaryScore_${responseCardId}_${questionIndex}"
                   value="${prefillScore}" min="0" max="${points}" step="0.5"
                   placeholder="—">/<span>${points}</span>
            <button class="summary-save-grade-btn"
                    onclick="submitSummaryGrade('${escapeHtml(responseCardId)}', ${questionIndex})"
                    title="Save grade">✓</button>
            ${answer.claudeGrade ? `<button class="summary-approve-ai-btn"
                    onclick="approveSummaryClaudeGrade('${escapeHtml(responseCardId)}', ${questionIndex})"
                    title="Approve AI grade">🤖</button>` : ''}
        </span>`;
    } else {
        // Auto-graded or no grade yet - show score (read-only)
        scoreHtml = `<span class="summary-answer-score">${effectiveGrade?.score ?? '—'}/${points}</span>`;
    }

    // Format answer text (truncated for display)
    const answerText = formatStudentAnswerCompact(answer.answer, question.questionType, quizQuestion);

    // Make student ID clickable to open response card
    const studentLink = responseCardId
        ? `<a href="#" class="summary-answer-student" onclick="openResponseFromSummary('${escapeHtml(responseCardId)}'); return false;">${escapeHtml(getStudentDisplayName(studentId))}</a>`
        : `<span class="summary-answer-student">${escapeHtml(getStudentDisplayName(studentId))}</span>`;

    return `<div class="summary-answer-row ${statusClass}" data-response-card-id="${escapeHtml(responseCardId)}" data-question-index="${questionIndex}">
        ${studentLink}
        <span class="summary-answer-text">${answerText}</span>
        ${scoreHtml}
        <span class="summary-answer-status" title="${statusClass}">${statusIcon}</span>
    </div>`;
}

// ========== INTERACTION HANDLERS ==========

// Placeholder for bulk grading integration (dp-063)
function launchBulkGrading(summaryCardId) {
    showToast('Bulk grading coming soon (dp-063)', 'info');
}

// Submit a grade from the summary view - writes to the source response card
async function submitSummaryGrade(responseCardId, questionIndex) {
    const responseCard = findCardById(responseCardId);
    if (!responseCard || responseCard.template !== 'quiz-response') {
        showToast('Response card not found', 'error');
        return;
    }

    const scoreEl = document.getElementById(`summaryScore_${responseCardId}_${questionIndex}`);
    if (!scoreEl || scoreEl.value === '') {
        showToast('Please enter a score', 'error');
        return;
    }

    const score = parseFloat(scoreEl.value);
    const answer = responseCard.answers?.[questionIndex];
    if (!answer) {
        showToast('Answer not found', 'error');
        return;
    }

    const notebookSettings = getSettings();

    // Get maxScore from quiz question (most reliable source)
    const quiz = findCardById(responseCard.quizId);
    const quizQuestion = quiz?.questions?.[questionIndex];
    const maxScore = quizQuestion?.points || answer.claudeGrade?.maxScore || answer.autoGrade?.maxScore || 1;

    // Set teacher grade
    answer.teacherGrade = {
        score: score,
        maxScore: maxScore,
        reviewedAt: new Date().toISOString(),
        reviewer: notebookSettings?.default_author || 'Teacher'
    };

    // Recalculate and update status
    recalculateResponseScore(responseCard);
    updateResponseStatus(responseCard);
    responseCard.modified = new Date().toISOString();

    // Save to filesystem
    const section = findSectionByItem(responseCard);
    if (section) {
        await saveCardFile(section.id, responseCard);
    }

    // Re-render summary viewer (which recomputes from response cards)
    refreshSummaryViewer();
    render();
    showToast('Grade saved', 'success');
}

// Approve Claude's grade from the summary view
async function approveSummaryClaudeGrade(responseCardId, questionIndex) {
    const responseCard = findCardById(responseCardId);
    if (!responseCard || responseCard.template !== 'quiz-response') {
        showToast('Response card not found', 'error');
        return;
    }

    const answer = responseCard.answers?.[questionIndex];
    if (!answer?.claudeGrade) {
        showToast('No AI grade to approve', 'error');
        return;
    }

    const notebookSettings = getSettings();

    // Copy Claude grade to teacher grade
    answer.teacherGrade = {
        ...answer.claudeGrade,
        reviewedAt: new Date().toISOString(),
        reviewer: notebookSettings?.default_author || 'Teacher'
    };
    delete answer.teacherGrade.gradedAt;

    // Recalculate and update status
    recalculateResponseScore(responseCard);
    updateResponseStatus(responseCard);
    responseCard.modified = new Date().toISOString();

    // Save to filesystem
    const section = findSectionByItem(responseCard);
    if (section) {
        await saveCardFile(section.id, responseCard);
    }

    // Re-render summary viewer
    refreshSummaryViewer();
    render();
    showToast('AI grade approved', 'success');
}

// Open a response card from the summary view
function openResponseFromSummary(responseCardId) {
    const responseCard = findCardById(responseCardId);
    if (!responseCard) {
        showToast('Response card not found', 'error');
        return;
    }
    openViewer(responseCard);
}

// Refresh the summary viewer if open (called after grade changes)
function refreshSummaryViewer() {
    const viewerContent = document.getElementById('viewerContent');
    const currentCard = getCurrentViewingCard();
    if (viewerContent && currentCard?.template === 'quiz-response-summary') {
        const templateRegistry = getTemplateRegistry();
        const template = templateRegistry[currentCard.template];
        viewerContent.innerHTML = renderViewer(currentCard, template);
    }
}

// ========== REGISTER GLOBAL HANDLERS ==========
// These are needed for onclick attributes in rendered HTML

window.launchBulkGrading = launchBulkGrading;
window.submitSummaryGrade = submitSummaryGrade;
window.approveSummaryClaudeGrade = approveSummaryClaudeGrade;
window.openResponseFromSummary = openResponseFromSummary;
