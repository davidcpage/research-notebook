/**
 * Quiz Response card type module.
 *
 * Displays student quiz responses with grading hierarchy
 * (auto-grade < Claude grade < teacher grade).
 */

import {
    escapeHtml,
    marked,
    findCardById,
    findSectionByItem,
    getSettings,
    getRoster,
    getTemplateRegistry,
    getCurrentViewingCard,
    showToast,
    render,
    saveCardFile,
    formatDate
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
export function getEffectiveGrade(answer) {
    if (answer.teacherGrade) return answer.teacherGrade;
    if (answer.claudeGrade) return answer.claudeGrade;
    if (answer.autoGrade) return answer.autoGrade;
    return null;
}

// Format student answer for display
// question parameter is optional but enables showing option text for multiple choice
function formatStudentAnswer(answer, questionType, question = null) {
    if (answer === null || answer === undefined) {
        return '<span class="response-no-answer">No answer provided</span>';
    }

    // For multiple choice with options, show "A: Option text" format
    if ((questionType === 'multiple_choice' || questionType === 'dropdown') &&
        typeof answer === 'number' && question?.options) {
        const optionLetter = String.fromCharCode(65 + answer); // A, B, C, D
        const optionText = question.options[answer] || `Option ${answer + 1}`;
        return `<span class="response-answer-choice">${optionLetter}: ${escapeHtml(optionText)}</span>`;
    }

    // For checkbox (multi-select), show all selected options
    if (questionType === 'checkbox' && Array.isArray(answer) && question?.options) {
        const formatted = answer.map(idx => {
            const optionLetter = String.fromCharCode(65 + idx);
            const optionText = question.options[idx] || `Option ${idx + 1}`;
            return `${optionLetter}: ${escapeHtml(optionText)}`;
        }).join(', ');
        return `<span class="response-answer-choice">${formatted}</span>`;
    }

    if (Array.isArray(answer)) {
        // Ordering or multi-select without options context
        return `<ol class="response-answer-list">${answer.map(a => `<li>${escapeHtml(String(a))}</li>`).join('')}</ol>`;
    }

    if (typeof answer === 'object') {
        // Matching pairs or other complex answer
        return `<pre class="response-answer-json">${escapeHtml(JSON.stringify(answer, null, 2))}</pre>`;
    }

    if (typeof answer === 'number') {
        return `<span class="response-answer-numeric">${answer}</span>`;
    }

    // Text answer - render as markdown
    return `<div class="md-content">${marked.parse(String(answer))}</div>`;
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

// ========== RENDER FUNCTIONS ==========

// Quiz response card preview: shows student ID, score, and status
export function renderPreview(card, template) {
    const placeholder = template.card?.placeholder || '📝';
    const studentId = card.studentId || 'Unknown';
    const answers = card.answers || [];
    const status = card.status || 'pending';

    if (answers.length === 0) {
        return `<div class="preview-placeholder">${placeholder}</div>`;
    }

    // Calculate scores from the grade hierarchy
    const graded = answers.filter(a => getEffectiveGrade(a) !== null);
    const pending = answers.length - graded.length;
    const totalScore = card.totalScore ?? graded.reduce((sum, a) => sum + (getEffectiveGrade(a)?.score || 0), 0);
    const maxScore = card.maxScore ?? answers.reduce((sum, a) => sum + (a.autoGrade?.maxScore || a.claudeGrade?.maxScore || a.teacherGrade?.maxScore || 1), 0);

    // Status class for styling
    let statusClass = 'response-pending';
    let statusBadge = '<span class="response-status-badge pending">Pending</span>';

    if (status === 'exported') {
        statusClass = 'response-exported';
        statusBadge = '<span class="response-status-badge exported">Exported</span>';
    } else if (status === 'reviewed') {
        statusClass = 'response-reviewed';
        statusBadge = '<span class="response-status-badge reviewed">Reviewed</span>';
    } else if (status === 'graded') {
        statusClass = 'response-graded';
        statusBadge = '<span class="response-status-badge graded">Graded</span>';
    } else if (pending > 0) {
        statusBadge = `<span class="response-status-badge pending">${pending} pending</span>`;
    }

    return `
        <div class="quiz-response-preview ${statusClass}">
            <div class="response-student-id">${escapeHtml(getStudentDisplayName(studentId))}</div>
            <div class="response-score">${totalScore}/${maxScore}</div>
            ${statusBadge}
        </div>
    `;
}

// Quiz response viewer: shows all answers with grade hierarchy
export function renderViewer(card, template) {
    const answers = card.answers || [];
    const studentId = card.studentId || 'Unknown';
    const quizId = card.quizId;
    const status = card.status || 'pending';

    if (answers.length === 0) {
        return '<div class="viewer-empty">No answers in this response</div>';
    }

    // Try to find the quiz card to get question text
    const quiz = findCardById(quizId);
    const questions = quiz?.questions || [];

    let html = `<div class="quiz-response-viewer" data-response-id="${card.id}">`;

    // Header with student info
    html += `<div class="response-header">
        <span class="response-student-label">${escapeHtml(getStudentDisplayName(studentId))}</span>
        <span class="response-quiz-ref">Quiz: ${escapeHtml(quiz?.title || quizId || 'Unknown')}</span>
    </div>`;

    // Score summary
    const graded = answers.filter(a => getEffectiveGrade(a) !== null);
    const totalScore = card.totalScore ?? graded.reduce((sum, a) => sum + (getEffectiveGrade(a)?.score || 0), 0);
    const maxScore = card.maxScore ?? answers.reduce((sum, a) => sum + (a.autoGrade?.maxScore || a.claudeGrade?.maxScore || a.teacherGrade?.maxScore || 1), 0);

    html += `<div class="response-summary">
        <span class="response-total-score">${totalScore}/${maxScore}</span>
        <span class="response-status-${status}">${status.charAt(0).toUpperCase() + status.slice(1)}</span>
    </div>`;

    // Render each answer
    answers.forEach((answer, index) => {
        const question = questions[answer.questionIndex] || questions[index];
        html += renderResponseAnswer(answer, question, index);
    });

    html += '</div>';
    return html;
}

// Render a single answer with grade hierarchy
function renderResponseAnswer(answer, question, index) {
    const qNum = index + 1;
    const effectiveGrade = getEffectiveGrade(answer);
    const isGraded = effectiveGrade !== null;

    // Determine status class based on grade hierarchy
    let statusClass = 'response-answer-pending';
    let statusBadge = '<span class="response-answer-badge pending">⏳ Pending</span>';

    const autoStatus = answer.autoGrade?.status;
    const isAutoGraded = autoStatus === 'correct' || autoStatus === 'incorrect' || autoStatus === 'partial';

    // Objective types have deterministic answers - no teacher override needed
    // Short answer allows override since acceptedAnswers matching might miss valid variations
    const objectiveTypes = ['multiple_choice', 'checkbox', 'dropdown', 'numeric', 'scale', 'grid'];
    const isObjective = objectiveTypes.includes(question?.type);
    const skipReviewUI = isAutoGraded && isObjective;

    if (skipReviewUI) {
        // Objective auto-graded questions - show auto status (no teacher override possible)
        if (autoStatus === 'correct') {
            statusClass = 'response-answer-correct';
            statusBadge = '<span class="response-answer-badge correct">✓ Correct</span>';
        } else if (autoStatus === 'incorrect') {
            statusClass = 'response-answer-incorrect';
            statusBadge = '<span class="response-answer-badge incorrect">✗ Incorrect</span>';
        } else if (autoStatus === 'partial') {
            statusClass = 'response-answer-partial';
            statusBadge = '<span class="response-answer-badge partial">◐ Partial</span>';
        }
    } else if (answer.teacherGrade) {
        // Teacher reviewed (including short_answer overrides)
        statusClass = 'response-answer-reviewed';
        statusBadge = '<span class="response-answer-badge reviewed">✓ Reviewed</span>';
    } else if (answer.claudeGrade) {
        statusClass = 'response-answer-ai-graded';
        statusBadge = '<span class="response-answer-badge ai-graded">🤖 AI Graded</span>';
    } else if (isAutoGraded) {
        // Short answer auto-graded but not yet reviewed - show auto status
        if (autoStatus === 'correct') {
            statusClass = 'response-answer-correct';
            statusBadge = '<span class="response-answer-badge correct">✓ Correct</span>';
        } else if (autoStatus === 'incorrect') {
            statusClass = 'response-answer-incorrect';
            statusBadge = '<span class="response-answer-badge incorrect">✗ Incorrect</span>';
        } else if (autoStatus === 'partial') {
            statusClass = 'response-answer-partial';
            statusBadge = '<span class="response-answer-badge partial">◐ Partial</span>';
        }
    }

    let html = `<div class="response-answer ${statusClass}">`;

    // Question header
    html += `<div class="response-answer-header">
        <span class="response-question-number">Q${qNum}</span>
        ${statusBadge}
        ${isGraded ? `<span class="response-answer-score">${effectiveGrade.score}/${effectiveGrade.maxScore || 1}</span>` : ''}
    </div>`;

    // Question text (if quiz is found)
    if (question?.question) {
        html += `<div class="response-question-text md-content">${marked.parse(question.question)}</div>`;
    }

    // Student's answer
    html += `<div class="response-student-answer">
        <div class="response-answer-label">Student Answer:</div>
        <div class="response-answer-content">${formatStudentAnswer(answer.answer, question?.type, question)}</div>
    </div>`;

    // Show grade cards only for questions that need review
    // Skip for objective auto-graded questions (multiple choice, etc.) but allow for short_answer
    if (!skipReviewUI) {
        if (answer.claudeGrade) {
            html += renderGradeCard('AI Suggestion', answer.claudeGrade, 'claude');
        }
        if (answer.teacherGrade) {
            html += renderGradeCard('Teacher Review', answer.teacherGrade, 'teacher');
        }

        // If no teacher grade yet, show grading UI
        // For non-objective questions, teacher can always grade/review
        if (!answer.teacherGrade) {
            html += renderTeacherGradeUI(index, answer.claudeGrade, question);
        }
    }

    html += '</div>';
    return html;
}

// Render a grade card (for auto/claude/teacher grades)
function renderGradeCard(label, grade, type) {
    let html = `<div class="response-grade-card response-grade-${type}">`;
    html += `<div class="response-grade-header">
        <span class="response-grade-label">${escapeHtml(label)}</span>
        <span class="response-grade-score">${grade.score}/${grade.maxScore || 1}</span>
    </div>`;

    if (grade.feedback) {
        html += `<div class="response-grade-feedback md-content">${marked.parse(grade.feedback)}</div>`;
    }

    if (grade.reviewer) {
        html += `<div class="response-grade-attribution">by ${escapeHtml(grade.reviewer)}</div>`;
    }

    if (grade.reviewedAt || grade.gradedAt) {
        const date = grade.reviewedAt || grade.gradedAt;
        html += `<div class="response-grade-date">${formatDate(date)}</div>`;
    }

    html += '</div>';
    return html;
}

// Render teacher grade UI (similar to quiz review UI)
function renderTeacherGradeUI(answerIndex, claudeGrade, question = null) {
    const prefillScore = claudeGrade?.score ?? '';
    const prefillFeedback = claudeGrade?.feedback || '';
    const maxScore = claudeGrade?.maxScore || question?.points || 1;

    return `<div class="response-teacher-grade-ui" data-answer-index="${answerIndex}">
        <div class="response-grade-label">Teacher Review:</div>
        <div class="response-grade-inputs">
            <div class="response-score-input">
                <label>Score:</label>
                <input type="number" class="response-score-field" id="teacherScore_${answerIndex}"
                       value="${prefillScore}" min="0" max="${maxScore}" step="0.5">
                <span>/ ${maxScore}</span>
            </div>
            <div class="response-feedback-input">
                <label>Feedback:</label>
                <textarea class="response-feedback-field" id="teacherFeedback_${answerIndex}"
                          placeholder="Optional feedback...">${escapeHtml(prefillFeedback)}</textarea>
            </div>
            <div class="response-grade-actions">
                <button class="response-approve-btn" onclick="submitTeacherGrade(${answerIndex})">
                    Save Grade
                </button>
                ${claudeGrade ? `<button class="response-approve-ai-btn" onclick="approveClaudeGrade(${answerIndex})">
                    Approve AI Grade
                </button>` : ''}
            </div>
        </div>
    </div>`;
}

// ========== INTERACTION HANDLERS ==========

// Submit a teacher grade for an answer
async function submitTeacherGrade(answerIndex) {
    const card = getCurrentViewingCard();
    if (!card || card.template !== 'quiz-response') {
        showToast('No response card open', 'error');
        return;
    }

    const scoreEl = document.getElementById(`teacherScore_${answerIndex}`);
    const feedbackEl = document.getElementById(`teacherFeedback_${answerIndex}`);

    if (!scoreEl || scoreEl.value === '') {
        showToast('Please enter a score', 'error');
        return;
    }

    const score = parseFloat(scoreEl.value);
    const feedback = feedbackEl?.value || '';
    const notebookSettings = getSettings();

    // Update the answer with teacher grade
    if (!card.answers[answerIndex]) {
        showToast('Answer not found', 'error');
        return;
    }

    // Get maxScore from existing grades or quiz question
    const answer = card.answers[answerIndex];
    const quiz = findCardById(card.quizId);
    const quizQuestion = quiz?.questions?.[answerIndex];
    const maxScore = answer.claudeGrade?.maxScore ||
                     answer.autoGrade?.maxScore ||
                     quizQuestion?.points || 1;

    answer.teacherGrade = {
        score: score,
        maxScore: maxScore,
        feedback: feedback,
        reviewedAt: new Date().toISOString(),
        reviewer: notebookSettings?.default_author || 'Teacher'
    };

    // Recalculate total score
    recalculateResponseScore(card);

    // Update status if all answers are reviewed
    updateResponseStatus(card);

    card.modified = new Date().toISOString();

    // Save
    const section = findSectionByItem(card);
    if (section) {
        await saveCardFile(section.id, card);
    }

    // Re-render
    const viewerContent = document.getElementById('viewerContent');
    if (viewerContent) {
        const templateRegistry = getTemplateRegistry();
        const template = templateRegistry[card.template || card.type];
        viewerContent.innerHTML = renderViewer(card, template);
    }

    render();
    showToast('Grade saved', 'success');
}

// Approve Claude's grade as the teacher grade
async function approveClaudeGrade(answerIndex) {
    const card = getCurrentViewingCard();
    if (!card || card.template !== 'quiz-response') {
        showToast('No response card open', 'error');
        return;
    }

    const answer = card.answers[answerIndex];
    if (!answer?.claudeGrade) {
        showToast('No AI grade to approve', 'error');
        return;
    }

    const notebookSettings = getSettings();

    // Copy Claude grade to teacher grade with approval
    answer.teacherGrade = {
        ...answer.claudeGrade,
        reviewedAt: new Date().toISOString(),
        reviewer: notebookSettings?.default_author || 'Teacher'
    };
    delete answer.teacherGrade.gradedAt; // Use reviewedAt instead

    // Recalculate total score
    recalculateResponseScore(card);

    // Update status if all answers are reviewed
    updateResponseStatus(card);

    card.modified = new Date().toISOString();

    // Save
    const section = findSectionByItem(card);
    if (section) {
        await saveCardFile(section.id, card);
    }

    // Re-render
    const viewerContent = document.getElementById('viewerContent');
    if (viewerContent) {
        const templateRegistry = getTemplateRegistry();
        const template = templateRegistry[card.template || card.type];
        viewerContent.innerHTML = renderViewer(card, template);
    }

    render();
    showToast('AI grade approved', 'success');
}

// ========== REGISTER GLOBAL HANDLERS ==========
// These are needed for onclick attributes in rendered HTML

window.submitTeacherGrade = submitTeacherGrade;
window.approveClaudeGrade = approveClaudeGrade;
