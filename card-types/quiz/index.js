/**
 * Quiz card type module.
 *
 * Provides interactive quiz functionality with multiple question types,
 * auto-grading, and manual review capabilities.
 */

import {
    escapeHtml,
    marked,
    findCardById,
    findSectionByItem,
    getSettings,
    getTemplateRegistry,
    showToast,
    render,
    saveData,
    saveCardFile
} from '/js/framework.js';

// ========== MODULE STATE ==========

// Quiz answers during interactive mode
// Structure: { quizId: { questionIndex: answer, ... } }
let quizAnswers = {};

// ========== HELPER FUNCTIONS ==========

// Check if a quiz has any graded questions (vs pure survey)
function quizHasGradedQuestions(questions) {
    return questions.some(q => {
        switch (q.type) {
            case 'multiple_choice':
            case 'dropdown':
                return q.correct !== undefined;
            case 'checkbox':
                return q.correctMultiple && q.correctMultiple.length > 0;
            case 'scale':
                return q.correct !== undefined;
            case 'grid':
                return q.correctAnswers && (Array.isArray(q.correctAnswers) ? q.correctAnswers.length > 0 : Object.keys(q.correctAnswers).length > 0);
            case 'numeric':
                return q.answer !== undefined;
            case 'date':
            case 'time':
            case 'datetime':
                return q.correct !== undefined;
            case 'short_answer':
            case 'worked':
                return true; // Needs review
            default:
                return false;
        }
    });
}

// ========== RENDER FUNCTIONS ==========

// Quiz layout: show question count and progress
export function renderPreview(card, template) {
    const questions = card.questions || [];
    const attempts = card.attempts || [];
    const placeholder = template.card?.placeholder || '❓';
    const topic = card.topic ? `<div class="quiz-topic">${escapeHtml(card.topic)}</div>` : '';

    if (questions.length === 0) {
        return `<div class="preview-placeholder">${placeholder}</div>`;
    }

    // Check if quiz has any graded questions (not a pure survey)
    const hasGradedQuestions = quizHasGradedQuestions(questions);

    // Calculate progress from most recent attempt
    let progressHtml = '';
    let stateClass = 'quiz-not-started';

    if (attempts.length > 0) {
        const lastAttempt = attempts[attempts.length - 1];
        const score = lastAttempt.score || {};
        const correct = score.correct || 0;
        const total = score.total || questions.length;
        const pending = score.pending_review || 0;

        if (!hasGradedQuestions) {
            // Pure survey - just show completed
            stateClass = 'quiz-completed';
            progressHtml = `<div class="quiz-progress">
                <span class="quiz-score">Completed</span>
            </div>`;
        } else if (pending > 0) {
            stateClass = 'quiz-pending-review';
            // Show points-based score, excluding pending from denominator
            const hasPointsScore = score.earned !== undefined && score.possible !== undefined;
            const pendingPoints = lastAttempt.answers
                ?.filter(a => (a.autoGrade?.status || a.status) === 'pending_review')
                .reduce((sum, a) => sum + (a.autoGrade?.maxScore || 1), 0) || 0;
            const gradedPossible = (score.possible || 0) - pendingPoints;
            const gradedTotal = total - pending;
            const scoreText = hasPointsScore
                ? `${score.earned}/${gradedPossible} pts`
                : `${correct}/${gradedTotal} correct`;
            progressHtml = `<div class="quiz-progress">
                <span class="quiz-score">${scoreText}</span>
                <span class="quiz-pending">${pending} awaiting review</span>
            </div>`;
        } else {
            stateClass = 'quiz-completed';
            // Show points-based score if available
            const hasPointsScore = score.earned !== undefined && score.possible !== undefined;
            const scoreText = hasPointsScore
                ? `${score.earned}/${score.possible} pts${score.percentage !== null ? ` (${score.percentage}%)` : ''}`
                : `${correct}/${total} correct`;
            progressHtml = `<div class="quiz-progress">
                <span class="quiz-score">${scoreText}</span>
            </div>`;
        }
    }

    return `
        <div class="quiz-preview ${stateClass}">
            ${topic}
            <div class="quiz-question-count">${questions.length} question${questions.length !== 1 ? 's' : ''}</div>
            ${progressHtml}
        </div>
    `;
}

// Quiz viewer: display all questions with their content
export function renderViewer(card, template) {
    const questions = card.questions || [];
    const attempts = card.attempts || [];
    const notebookSettings = getSettings();

    if (questions.length === 0) {
        return '<div class="viewer-empty">No questions in this quiz</div>';
    }

    // Get latest attempt for showing previous answers
    const lastAttempt = attempts.length > 0 ? attempts[attempts.length - 1] : null;

    // Interactive mode: no attempts yet, or user clicked "Retake"
    // BUT: if quiz_template_mode is set in settings, never allow interactive mode
    const isInteractive = !notebookSettings?.quiz_template_mode && (!lastAttempt || card._quizRetakeMode);

    // Check if this is a graded quiz or pure survey
    const hasGradedQuestions = quizHasGradedQuestions(questions);

    let html = `<div class="quiz-viewer" data-quiz-id="${card.id}" data-interactive="${isInteractive}">`;

    // Topic header if present
    if (card.topic) {
        html += `<div class="quiz-viewer-topic">${escapeHtml(card.topic)}</div>`;
    }

    // Description (introduction text, timing info, passage for reading quizzes)
    if (card.description) {
        html += `<div class="quiz-description md-content">${marked.parse(card.description)}</div>`;
    }

    // Mode header: Take Quiz vs Review Results vs Template Preview
    const isTemplateMode = notebookSettings?.quiz_template_mode;
    if (isTemplateMode && !lastAttempt) {
        // Template mode: show question preview without interactivity
        html += `<div class="quiz-mode-header">
            <span class="quiz-mode-label">Quiz Template</span>
            <span class="quiz-mode-count">${questions.length} question${questions.length !== 1 ? 's' : ''}</span>
        </div>`;
    } else if (isInteractive) {
        html += `<div class="quiz-mode-header">
            <span class="quiz-mode-label">Take Quiz</span>
            <span class="quiz-mode-count">${questions.length} question${questions.length !== 1 ? 's' : ''}</span>
        </div>`;
    } else if (lastAttempt) {
        // Progress summary for review mode
        const score = lastAttempt.score || {};
        if (hasGradedQuestions) {
            // Show points-based score, excluding pending review from denominator
            const hasPointsScore = score.earned !== undefined && score.possible !== undefined;
            const pending = score.pending_review || 0;
            // Calculate graded-only denominator (exclude pending questions' points)
            const pendingPoints = lastAttempt.answers
                ?.filter(a => (a.autoGrade?.status || a.status) === 'pending_review')
                .reduce((sum, a) => sum + (a.autoGrade?.maxScore || 1), 0) || 0;
            const gradedPossible = (score.possible || 0) - pendingPoints;
            const gradedTotal = (score.total || questions.length) - pending;

            const scoreDisplay = hasPointsScore
                ? `${score.earned}/${gradedPossible} pts${gradedPossible > 0 ? ` (${Math.round((score.earned / gradedPossible) * 100)}%)` : ''}`
                : `${score.correct || 0}/${gradedTotal} correct`;
            html += `<div class="quiz-summary">
                <span class="quiz-summary-score">${scoreDisplay}</span>
                ${pending ? `<span class="quiz-summary-pending">${pending} awaiting review</span>` : ''}
            </div>`;
        } else {
            html += `<div class="quiz-summary">
                <span class="quiz-summary-score">Survey completed</span>
            </div>`;
        }
    }

    // Render each question
    questions.forEach((q, index) => {
        html += renderQuizQuestion(q, index, isInteractive ? null : lastAttempt, isInteractive);
    });

    // Submit button for interactive mode, Retake button for review mode
    if (isInteractive) {
        html += `<div class="quiz-actions">
            <button class="quiz-submit-btn" onclick="submitQuiz('${card.id}')">Submit Quiz</button>
        </div>`;
    } else if (lastAttempt) {
        html += `<div class="quiz-actions">
            <button class="quiz-retake-btn" onclick="retakeQuiz('${card.id}')">Retake Quiz</button>
        </div>`;
    }

    html += '</div>';
    return html;
}

// Render a single quiz question (interactive or review mode)
function renderQuizQuestion(question, index, attempt, isInteractive = false) {
    const qNum = index + 1;
    const attemptAnswer = attempt?.answers?.find(a => a.questionIndex === index);
    const notebookSettings = getSettings();

    let statusClass = '';
    let statusBadge = '';
    if (attemptAnswer) {
        // Get status from autoGrade (new structure) or fall back to legacy status field
        const status = attemptAnswer.autoGrade?.status || attemptAnswer.status;
        const autoGrade = attemptAnswer.autoGrade;

        if (status === 'correct') {
            statusClass = 'quiz-correct';
            statusBadge = '<span class="quiz-status-badge correct">✓</span>';
        } else if (status === 'partial') {
            // Partial credit - show score
            statusClass = 'quiz-partial';
            const scoreText = autoGrade ? `${autoGrade.score}/${autoGrade.maxScore}` : '◐';
            statusBadge = `<span class="quiz-status-badge partial">${scoreText}</span>`;
        } else if (status === 'incorrect') {
            statusClass = 'quiz-incorrect';
            statusBadge = '<span class="quiz-status-badge incorrect">✗</span>';
        } else if (status === 'pending_review') {
            statusClass = 'quiz-pending';
            statusBadge = '<span class="quiz-status-badge pending">⏳</span>';
        } else if (status === 'answered') {
            // Survey question - just recorded, no grading
            statusClass = 'quiz-answered';
            statusBadge = '<span class="quiz-status-badge answered">•</span>';
        }
    }

    let html = `<div class="quiz-question ${statusClass}" data-question-index="${index}" data-question-type="${question.type || 'multiple_choice'}">`;
    html += `<div class="quiz-question-header">
        <span class="quiz-question-number">Q${qNum}</span>
        ${statusBadge}
    </div>`;

    // Question text (supports markdown)
    html += `<div class="quiz-question-text md-content">${marked.parse(question.question || '')}</div>`;

    // Render answer area based on question type
    html += renderQuizAnswerArea(question, attemptAnswer, isInteractive, index);

    // Feedback based on answer correctness (maps to Google Forms whenRight/whenWrong)
    if (attemptAnswer) {
        const isCorrect = attemptAnswer?.autoGrade?.status === 'correct' || attemptAnswer?.status === 'correct';
        const feedback = isCorrect ? question.whenRight : question.whenWrong;
        if (feedback) {
            html += `<div class="quiz-feedback quiz-feedback-${isCorrect ? 'correct' : 'incorrect'}">
                <div class="md-content">${marked.parse(feedback)}</div>
            </div>`;
        }
    }

    // Review UI for pending_review questions
    const answerStatus = attemptAnswer?.autoGrade?.status || attemptAnswer?.status;
    if (answerStatus === 'pending_review') {
        html += renderReviewUI(attemptAnswer, index, notebookSettings);
    }

    // Show existing review feedback if present
    if (attemptAnswer?.review) {
        html += renderReviewFeedback(attemptAnswer.review);
    }

    html += '</div>';
    return html;
}

// Render review UI for pending_review questions
function renderReviewUI(attemptAnswer, questionIndex, notebookSettings) {
    // Check if self-review is allowed
    const allowSelfReview = notebookSettings?.quiz_self_review !== false;

    if (!allowSelfReview) {
        // Show awaiting review message instead of buttons
        return `<div class="quiz-awaiting-review">
            <span class="quiz-awaiting-icon">⏳</span>
            Awaiting review
        </div>`;
    }

    return `<div class="quiz-review-ui" data-question-index="${questionIndex}">
        <div class="quiz-review-label">Mark this answer:</div>
        <div class="quiz-review-buttons">
            <button class="quiz-review-btn correct" onclick="submitQuizReview(${questionIndex}, 'correct')">
                ✓ Correct
            </button>
            <button class="quiz-review-btn incorrect" onclick="submitQuizReview(${questionIndex}, 'incorrect')">
                ✗ Incorrect
            </button>
        </div>
        <textarea class="quiz-review-feedback" placeholder="Optional feedback..."
                  id="reviewFeedback_${questionIndex}"></textarea>
    </div>`;
}

// Render existing review feedback
function renderReviewFeedback(review) {
    let html = '<div class="quiz-review-result">';
    if (review.feedback) {
        html += `<div class="quiz-review-feedback-display">
            <span class="quiz-review-feedback-label">Feedback:</span>
            <div class="md-content">${marked.parse(review.feedback)}</div>
        </div>`;
    }
    if (review.reviewer) {
        html += `<div class="quiz-review-attribution">Reviewed by ${escapeHtml(review.reviewer)}</div>`;
    }
    html += '</div>';
    return html;
}

// Render the answer area for a question based on its type
function renderQuizAnswerArea(question, attemptAnswer, isInteractive = false, questionIndex = 0) {
    const type = question.type || 'multiple_choice';

    switch (type) {
        case 'multiple_choice':
            return renderMultipleChoiceAnswer(question, attemptAnswer, isInteractive, questionIndex);
        case 'checkbox':
            return renderCheckboxAnswer(question, attemptAnswer, isInteractive, questionIndex);
        case 'dropdown':
            return renderDropdownAnswer(question, attemptAnswer, isInteractive, questionIndex);
        case 'numeric':
            return renderNumericAnswer(question, attemptAnswer, isInteractive, questionIndex);
        case 'short_answer':
            return renderShortAnswer(question, attemptAnswer, isInteractive, questionIndex);
        case 'worked':
            return renderWorkedAnswer(question, attemptAnswer, isInteractive, questionIndex);
        case 'scale':
            return renderScaleAnswer(question, attemptAnswer, isInteractive, questionIndex);
        case 'grid':
            return renderGridAnswer(question, attemptAnswer, isInteractive, questionIndex);
        case 'date':
            return renderDateAnswer(question, attemptAnswer, isInteractive, questionIndex);
        case 'time':
            return renderTimeAnswer(question, attemptAnswer, isInteractive, questionIndex);
        case 'datetime':
            return renderDatetimeAnswer(question, attemptAnswer, isInteractive, questionIndex);
        default:
            return '<div class="quiz-unknown-type">Unknown question type</div>';
    }
}

// Multiple choice: radio/checkbox/dropdown options
function renderMultipleChoiceAnswer(question, attemptAnswer, isInteractive = false, questionIndex = 0) {
    const options = question.options || [];
    const allowMultiple = question.allowMultiple || false;
    const display = question.display || 'radio';
    const correctIndex = question.correct;
    const userAnswer = attemptAnswer?.answer;

    // Dropdown mode
    if (display === 'dropdown' && !allowMultiple) {
        return renderDropdownAnswer(question, attemptAnswer, isInteractive, questionIndex);
    }

    // Checkbox mode
    if (allowMultiple) {
        return renderCheckboxAnswer(question, attemptAnswer, isInteractive, questionIndex);
    }

    // Default: Radio button mode
    let html = '<div class="quiz-options">';
    options.forEach((opt, i) => {
        let optClass = 'quiz-option';
        let indicator = '';

        if (isInteractive) {
            // Interactive mode: clickable options
            optClass += ' interactive';
            html += `<div class="${optClass}" data-option-index="${i}" onclick="selectQuizOption(this, ${questionIndex}, ${i})">
                <span class="quiz-option-radio"></span>
                <span class="quiz-option-letter">${String.fromCharCode(65 + i)}</span>
                <span class="quiz-option-text">${escapeHtml(opt)}</span>
            </div>`;
        } else {
            // Review mode: show correct/incorrect (only if correct answer defined)
            if (attemptAnswer) {
                if (correctIndex !== undefined) {
                    if (i === correctIndex) {
                        optClass += ' correct';
                        indicator = '<span class="quiz-option-indicator">✓</span>';
                    }
                    if (i === userAnswer && i !== correctIndex) {
                        optClass += ' selected incorrect';
                        indicator = '<span class="quiz-option-indicator">✗</span>';
                    } else if (i === userAnswer) {
                        optClass += ' selected';
                    }
                } else if (i === userAnswer) {
                    // Survey question - just show selected, no grading
                    optClass += ' selected';
                }
            }
            html += `<div class="${optClass}">
                <span class="quiz-option-letter">${String.fromCharCode(65 + i)}</span>
                <span class="quiz-option-text">${escapeHtml(opt)}</span>
                ${indicator}
            </div>`;
        }
    });
    html += '</div>';
    return html;
}

// Checkbox mode: multiple selections allowed
function renderCheckboxAnswer(question, attemptAnswer, isInteractive = false, questionIndex = 0) {
    const options = question.options || [];
    const correctMultiple = question.correctMultiple || [];
    const userAnswers = Array.isArray(attemptAnswer?.answer) ? attemptAnswer.answer : [];

    let html = '<div class="quiz-options quiz-options-checkbox">';
    options.forEach((opt, i) => {
        let optClass = 'quiz-option';
        let indicator = '';
        const isSelected = userAnswers.includes(i);
        const isCorrect = correctMultiple.includes(i);

        if (isInteractive) {
            optClass += ' interactive';
            html += `<div class="${optClass}" data-option-index="${i}" onclick="toggleQuizCheckbox(this, ${questionIndex}, ${i})">
                <span class="quiz-option-checkbox"></span>
                <span class="quiz-option-letter">${String.fromCharCode(65 + i)}</span>
                <span class="quiz-option-text">${escapeHtml(opt)}</span>
            </div>`;
        } else {
            // Review mode
            if (attemptAnswer && correctMultiple.length > 0) {
                if (isCorrect) {
                    optClass += ' correct';
                    indicator = '<span class="quiz-option-indicator">✓</span>';
                }
                if (isSelected && !isCorrect) {
                    optClass += ' selected incorrect';
                    indicator = '<span class="quiz-option-indicator">✗</span>';
                } else if (isSelected) {
                    optClass += ' selected';
                }
            } else if (isSelected) {
                optClass += ' selected';
            }
            html += `<div class="${optClass}">
                <span class="quiz-option-letter">${String.fromCharCode(65 + i)}</span>
                <span class="quiz-option-text">${escapeHtml(opt)}</span>
                ${indicator}
            </div>`;
        }
    });
    html += '</div>';
    return html;
}

// Dropdown mode: select element
function renderDropdownAnswer(question, attemptAnswer, isInteractive = false, questionIndex = 0) {
    const options = question.options || [];
    const correctIndex = question.correct;
    const userAnswer = attemptAnswer?.answer;

    let html = '<div class="quiz-dropdown">';
    if (isInteractive) {
        html += `<select class="quiz-dropdown-select" onchange="updateQuizAnswer(${questionIndex}, parseInt(this.value))">
            <option value="">Select an answer...</option>`;
        options.forEach((opt, i) => {
            html += `<option value="${i}">${String.fromCharCode(65 + i)}. ${escapeHtml(opt)}</option>`;
        });
        html += '</select>';
    } else if (attemptAnswer !== undefined) {
        // Review mode
        const selectedOpt = options[userAnswer];

        if (correctIndex !== undefined) {
            // Graded question - show correct/incorrect
            const correctOpt = options[correctIndex];
            const isCorrect = userAnswer === correctIndex;

            html += `<div class="quiz-dropdown-answer ${isCorrect ? 'correct' : 'incorrect'}">
                <span class="quiz-dropdown-label">Your answer:</span>
                <span class="quiz-dropdown-value">${userAnswer !== undefined ? `${String.fromCharCode(65 + userAnswer)}. ${escapeHtml(selectedOpt)}` : '(none)'}</span>
                ${isCorrect ? '<span class="quiz-option-indicator">✓</span>' : '<span class="quiz-option-indicator">✗</span>'}
            </div>`;
            if (!isCorrect) {
                html += `<div class="quiz-dropdown-correct">
                    <span class="quiz-dropdown-label">Correct:</span>
                    <span class="quiz-dropdown-value">${String.fromCharCode(65 + correctIndex)}. ${escapeHtml(correctOpt)}</span>
                </div>`;
            }
        } else {
            // Survey question - just show selected answer without grading
            html += `<div class="quiz-dropdown-answer">
                <span class="quiz-dropdown-label">Your answer:</span>
                <span class="quiz-dropdown-value">${userAnswer !== undefined ? `${String.fromCharCode(65 + userAnswer)}. ${escapeHtml(selectedOpt)}` : '(none)'}</span>
            </div>`;
        }
    }
    html += '</div>';
    return html;
}

// Numeric: show expected answer and tolerance
function renderNumericAnswer(question, attemptAnswer, isInteractive = false, questionIndex = 0) {
    const answer = question.answer;
    const tolerance = question.tolerance || 0;
    const userAnswer = attemptAnswer?.answer;

    let html = '<div class="quiz-numeric">';
    if (isInteractive) {
        // Interactive mode: number input
        html += `<div class="quiz-numeric-input-area">
            <input type="number" class="quiz-numeric-input" data-question-index="${questionIndex}"
                   placeholder="Enter your answer" step="any"
                   onchange="updateQuizAnswer(${questionIndex}, this.value)">
        </div>`;
    } else if (attemptAnswer) {
        // Review mode: show user answer and correct answer
        html += `<div class="quiz-numeric-user">Your answer: <strong>${userAnswer !== undefined ? userAnswer : '—'}</strong></div>`;
        html += `<div class="quiz-numeric-correct">Expected: <strong>${answer}</strong>`;
        if (tolerance > 0) {
            html += ` (±${tolerance})`;
        }
        html += '</div>';
    }
    html += '</div>';
    return html;
}

// Short answer: textarea for free response
function renderShortAnswer(question, attemptAnswer, isInteractive = false, questionIndex = 0) {
    const userAnswer = attemptAnswer?.answer;

    let html = '<div class="quiz-short-answer">';
    if (isInteractive) {
        // Interactive mode: textarea
        html += `<textarea class="quiz-short-answer-input" data-question-index="${questionIndex}"
                   placeholder="Type your answer here..."
                   onchange="updateQuizAnswer(${questionIndex}, this.value)"></textarea>`;
    } else if (attemptAnswer) {
        // Review mode: show user response
        html += `<div class="quiz-short-answer-response">${escapeHtml(userAnswer || '(No response)')}</div>`;
    }
    html += '</div>';
    return html;
}

// Worked problem: multi-step solution
function renderWorkedAnswer(question, attemptAnswer, isInteractive = false, questionIndex = 0) {
    const userAnswer = attemptAnswer?.answer;

    let html = '<div class="quiz-worked">';
    if (isInteractive) {
        // Interactive mode: textarea for showing work
        html += `<div class="quiz-worked-input-area">
            <label class="quiz-worked-label">Show your work:</label>
            <textarea class="quiz-worked-input" data-question-index="${questionIndex}"
                   placeholder="Enter your solution step by step..."
                   onchange="updateQuizAnswer(${questionIndex}, this.value)"></textarea>
        </div>`;
    } else if (attemptAnswer && userAnswer) {
        // Review mode: show user's work
        if (Array.isArray(userAnswer)) {
            html += '<div class="quiz-worked-steps">';
            userAnswer.forEach((step, i) => {
                html += `<div class="quiz-worked-step">
                    <span class="quiz-step-number">Step ${i + 1}:</span>
                    <span class="quiz-step-content">${escapeHtml(step)}</span>
                </div>`;
            });
            html += '</div>';
        } else {
            html += `<div class="quiz-worked-response">${escapeHtml(userAnswer)}</div>`;
        }
    }
    html += '</div>';
    return html;
}

// Scale: linear scale selection (maps to Google Forms ScaleQuestion)
function renderScaleAnswer(question, attemptAnswer, isInteractive = false, questionIndex = 0) {
    const low = question.low || 1;
    const high = question.high || 5;
    const lowLabel = question.lowLabel || '';
    const highLabel = question.highLabel || '';
    const correctValue = question.correct;
    const selectedValue = attemptAnswer?.answer;

    let html = '<div class="quiz-scale">';

    // Scale labels
    if (lowLabel || highLabel) {
        html += '<div class="quiz-scale-labels">';
        html += `<span class="quiz-scale-label-low">${escapeHtml(lowLabel)}</span>`;
        html += `<span class="quiz-scale-label-high">${escapeHtml(highLabel)}</span>`;
        html += '</div>';
    }

    // Scale options
    html += '<div class="quiz-scale-options">';
    for (let i = low; i <= high; i++) {
        let optClass = 'quiz-scale-option';

        if (isInteractive) {
            optClass += ' interactive';
            html += `<div class="${optClass}" data-value="${i}" onclick="selectScaleOption(this, ${questionIndex}, ${i})">
                <span class="quiz-scale-radio"></span>
                <span class="quiz-scale-value">${i}</span>
            </div>`;
        } else {
            // Review mode
            if (attemptAnswer) {
                if (correctValue !== undefined && i === correctValue) {
                    optClass += ' correct';
                }
                if (i === selectedValue) {
                    optClass += ' selected';
                    if (correctValue !== undefined && i !== correctValue) {
                        optClass += ' incorrect';
                    }
                }
            }
            html += `<div class="${optClass}">
                <span class="quiz-scale-value">${i}</span>
            </div>`;
        }
    }
    html += '</div>';

    html += '</div>';
    return html;
}

// Grid: matrix of radio buttons (maps to Google Forms Grid/RowQuestion)
function renderGridAnswer(question, attemptAnswer, isInteractive = false, questionIndex = 0) {
    const rows = question.rows || [];
    const columns = question.columns || [];
    const correctAnswers = question.correctAnswers; // Array [[rowIdx, colIdx], ...] or Object {rowName: colName}
    const userAnswers = attemptAnswer?.answer || {}; // Object: { rowIndex: colIndex }

    // Build correct answers lookup (normalize both formats to {rowIdx: colIdx})
    const correctLookup = {};
    if (correctAnswers) {
        if (Array.isArray(correctAnswers)) {
            // Array format: [[0, 2], [2, 3]]
            correctAnswers.forEach(([rowIdx, colIdx]) => {
                correctLookup[rowIdx] = colIdx;
            });
        } else {
            // Object format: {"Row Name": "Column Name"} - more intuitive for authoring
            Object.entries(correctAnswers).forEach(([rowName, colName]) => {
                const rowIdx = rows.indexOf(rowName);
                const colIdx = columns.indexOf(colName);
                if (rowIdx !== -1 && colIdx !== -1) {
                    correctLookup[rowIdx] = colIdx;
                }
            });
        }
    }
    const hasCorrectAnswers = Object.keys(correctLookup).length > 0;

    let html = '<div class="quiz-grid">';

    // Header row with column labels
    html += '<div class="quiz-grid-header">';
    html += '<div class="quiz-grid-cell quiz-grid-corner"></div>';
    columns.forEach(col => {
        html += `<div class="quiz-grid-cell quiz-grid-col-label">${escapeHtml(col)}</div>`;
    });
    html += '</div>';

    // Data rows
    rows.forEach((row, rowIdx) => {
        html += '<div class="quiz-grid-row">';
        html += `<div class="quiz-grid-cell quiz-grid-row-label">${escapeHtml(row)}</div>`;

        columns.forEach((col, colIdx) => {
            let cellClass = 'quiz-grid-cell quiz-grid-option';
            const isSelected = userAnswers[rowIdx] === colIdx;
            const isCorrect = correctLookup[rowIdx] === colIdx;

            if (isInteractive) {
                cellClass += ' interactive';
                html += `<div class="${cellClass}" onclick="selectGridOption(this, ${questionIndex}, ${rowIdx}, ${colIdx})">
                    <span class="quiz-grid-radio"></span>
                </div>`;
            } else {
                // Review mode
                if (attemptAnswer) {
                    if (hasCorrectAnswers && isCorrect) {
                        cellClass += ' correct';
                    }
                    if (isSelected) {
                        cellClass += ' selected';
                        if (hasCorrectAnswers && !isCorrect) {
                            cellClass += ' incorrect';
                        }
                    }
                }
                html += `<div class="${cellClass}">
                    ${isSelected ? '<span class="quiz-grid-selected">●</span>' : ''}
                </div>`;
            }
        });

        html += '</div>';
    });

    html += '</div>';
    return html;
}

// Date: date picker input
function renderDateAnswer(question, attemptAnswer, isInteractive = false, questionIndex = 0) {
    const correctAnswer = question.correct;
    const userAnswer = attemptAnswer?.answer;

    let html = '<div class="quiz-date">';
    if (isInteractive) {
        html += `<input type="date" class="quiz-date-input" data-question-index="${questionIndex}"
                   onchange="updateQuizAnswer(${questionIndex}, this.value)">`;
    } else if (attemptAnswer) {
        // Review mode: show user answer and correct answer if defined
        const formattedUser = userAnswer ? formatDateDisplay(userAnswer) : '—';
        html += `<div class="quiz-date-user">Your answer: <strong>${formattedUser}</strong></div>`;
        if (correctAnswer !== undefined) {
            const isCorrect = userAnswer === correctAnswer;
            const formattedCorrect = formatDateDisplay(correctAnswer);
            if (!isCorrect) {
                html += `<div class="quiz-date-correct">Expected: <strong>${formattedCorrect}</strong></div>`;
            }
        }
    }
    html += '</div>';
    return html;
}

// Time: time picker input
function renderTimeAnswer(question, attemptAnswer, isInteractive = false, questionIndex = 0) {
    const correctAnswer = question.correct;
    const userAnswer = attemptAnswer?.answer;

    let html = '<div class="quiz-time">';
    if (isInteractive) {
        html += `<input type="time" class="quiz-time-input" data-question-index="${questionIndex}"
                   onchange="updateQuizAnswer(${questionIndex}, this.value)">`;
    } else if (attemptAnswer) {
        // Review mode: show user answer and correct answer if defined
        const formattedUser = userAnswer ? formatTimeDisplay(userAnswer) : '—';
        html += `<div class="quiz-time-user">Your answer: <strong>${formattedUser}</strong></div>`;
        if (correctAnswer !== undefined) {
            const isCorrect = userAnswer === correctAnswer;
            const formattedCorrect = formatTimeDisplay(correctAnswer);
            if (!isCorrect) {
                html += `<div class="quiz-time-correct">Expected: <strong>${formattedCorrect}</strong></div>`;
            }
        }
    }
    html += '</div>';
    return html;
}

// Datetime: datetime-local picker input
function renderDatetimeAnswer(question, attemptAnswer, isInteractive = false, questionIndex = 0) {
    const correctAnswer = question.correct;
    const userAnswer = attemptAnswer?.answer;

    let html = '<div class="quiz-datetime">';
    if (isInteractive) {
        html += `<input type="datetime-local" class="quiz-datetime-input" data-question-index="${questionIndex}"
                   onchange="updateQuizAnswer(${questionIndex}, this.value)">`;
    } else if (attemptAnswer) {
        // Review mode: show user answer and correct answer if defined
        const formattedUser = userAnswer ? formatDatetimeDisplay(userAnswer) : '—';
        html += `<div class="quiz-datetime-user">Your answer: <strong>${formattedUser}</strong></div>`;
        if (correctAnswer !== undefined) {
            const isCorrect = userAnswer === correctAnswer;
            const formattedCorrect = formatDatetimeDisplay(correctAnswer);
            if (!isCorrect) {
                html += `<div class="quiz-datetime-correct">Expected: <strong>${formattedCorrect}</strong></div>`;
            }
        }
    }
    html += '</div>';
    return html;
}

// Helper: format date for display (YYYY-MM-DD → readable format)
function formatDateDisplay(isoDate) {
    if (!isoDate) return '';
    try {
        const [year, month, day] = isoDate.split('-');
        const date = new Date(year, month - 1, day);
        return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
        return isoDate;
    }
}

// Helper: format time for display (HH:MM → readable format)
function formatTimeDisplay(isoTime) {
    if (!isoTime) return '';
    try {
        const [hours, minutes] = isoTime.split(':');
        const date = new Date();
        date.setHours(parseInt(hours), parseInt(minutes));
        return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    } catch {
        return isoTime;
    }
}

// Helper: format datetime for display
function formatDatetimeDisplay(isoDatetime) {
    if (!isoDatetime) return '';
    try {
        const date = new Date(isoDatetime);
        return date.toLocaleString(undefined, {
            year: 'numeric', month: 'long', day: 'numeric',
            hour: 'numeric', minute: '2-digit'
        });
    } catch {
        return isoDatetime;
    }
}

// ========== INTERACTION HANDLERS ==========

// Quiz interaction: select multiple choice option
function selectQuizOption(element, questionIndex, optionIndex) {
    const quizViewer = element.closest('.quiz-viewer');
    const quizId = quizViewer?.dataset.quizId;
    if (!quizId) return;

    // Deselect all options in this question
    const question = element.closest('.quiz-question');
    question.querySelectorAll('.quiz-option').forEach(opt => opt.classList.remove('selected'));

    // Select this option
    element.classList.add('selected');

    // Store answer
    if (!quizAnswers[quizId]) quizAnswers[quizId] = {};
    quizAnswers[quizId][questionIndex] = optionIndex;
}

// Quiz interaction: toggle checkbox option (multiple selection)
function toggleQuizCheckbox(element, questionIndex, optionIndex) {
    const quizViewer = element.closest('.quiz-viewer');
    const quizId = quizViewer?.dataset.quizId;
    if (!quizId) return;

    // Toggle selection
    element.classList.toggle('selected');

    // Initialize array if needed
    if (!quizAnswers[quizId]) quizAnswers[quizId] = {};
    if (!Array.isArray(quizAnswers[quizId][questionIndex])) {
        quizAnswers[quizId][questionIndex] = [];
    }

    // Add or remove from selection
    const currentAnswers = quizAnswers[quizId][questionIndex];
    const idx = currentAnswers.indexOf(optionIndex);
    if (idx >= 0) {
        currentAnswers.splice(idx, 1);
    } else {
        currentAnswers.push(optionIndex);
    }
}

// Quiz interaction: update text/numeric answer
function updateQuizAnswer(questionIndex, value) {
    const quizViewer = document.querySelector('.quiz-viewer[data-interactive="true"]');
    const quizId = quizViewer?.dataset.quizId;
    if (!quizId) return;

    if (!quizAnswers[quizId]) quizAnswers[quizId] = {};

    // Parse numeric values
    const question = quizViewer.querySelector(`[data-question-index="${questionIndex}"]`);
    const qType = question?.dataset.questionType;
    if (qType === 'numeric') {
        quizAnswers[quizId][questionIndex] = value !== '' ? parseFloat(value) : null;
    } else {
        quizAnswers[quizId][questionIndex] = value;
    }
}

// Quiz interaction: select scale option
function selectScaleOption(element, questionIndex, value) {
    const quizViewer = element.closest('.quiz-viewer');
    const quizId = quizViewer?.dataset.quizId;
    if (!quizId) return;

    // Deselect all options in this scale
    const scaleContainer = element.closest('.quiz-scale-options');
    scaleContainer.querySelectorAll('.quiz-scale-option').forEach(opt => opt.classList.remove('selected'));

    // Select this option
    element.classList.add('selected');

    // Store answer
    if (!quizAnswers[quizId]) quizAnswers[quizId] = {};
    quizAnswers[quizId][questionIndex] = value;
}

// Quiz interaction: select grid option
function selectGridOption(element, questionIndex, rowIndex, colIndex) {
    const quizViewer = element.closest('.quiz-viewer');
    const quizId = quizViewer?.dataset.quizId;
    if (!quizId) return;

    // Deselect all options in this row
    const gridRow = element.closest('.quiz-grid-row');
    gridRow.querySelectorAll('.quiz-grid-option').forEach(opt => opt.classList.remove('selected'));

    // Select this option
    element.classList.add('selected');

    // Store answer (as object mapping row -> column)
    if (!quizAnswers[quizId]) quizAnswers[quizId] = {};
    if (!quizAnswers[quizId][questionIndex]) quizAnswers[quizId][questionIndex] = {};
    quizAnswers[quizId][questionIndex][rowIndex] = colIndex;
}

// Quiz interaction: submit quiz
async function submitQuiz(quizId) {
    const answers = quizAnswers[quizId] || {};

    // Find the card
    const card = findCardById(quizId);
    if (!card) {
        showToast('Quiz not found', 'error');
        return;
    }

    // Check if all questions have answers
    const questions = card.questions || [];
    const unanswered = questions.filter((q, i) => answers[i] === undefined || answers[i] === null || answers[i] === '');

    if (unanswered.length > 0) {
        if (!confirm(`You have ${unanswered.length} unanswered question(s). Submit anyway?`)) {
            return;
        }
    }

    // Grade and save the attempt
    const attempt = gradeQuizAttempt(card, answers);
    await saveQuizAttempt(card, attempt);

    // Clear quiz state
    delete quizAnswers[quizId];

    showToast('Quiz submitted!', 'success');
}

// Quiz interaction: retake quiz
function retakeQuiz(quizId) {
    const card = findCardById(quizId);
    if (!card) return;

    // Set retake mode flag and re-open viewer
    card._quizRetakeMode = true;
    quizAnswers[quizId] = {};

    // Re-render the viewer content
    const viewerContent = document.getElementById('viewerContent');
    if (viewerContent) {
        const templateRegistry = getTemplateRegistry();
        const template = templateRegistry[card.template || card.type];
        viewerContent.innerHTML = renderViewer(card, template);
    }
}

// Grade quiz attempt: auto-grade what we can, mark others as pending
function gradeQuizAttempt(card, answers) {
    const questions = card.questions || [];
    const gradedAnswers = [];
    let correctCount = 0;
    let pendingCount = 0;
    let totalEarned = 0;
    let totalPossible = 0;

    questions.forEach((q, index) => {
        const userAnswer = answers[index];
        const maxPoints = q.points || 1;
        const allowPartial = q.partialCredit !== false; // Default to true for applicable types

        const result = {
            questionIndex: index,
            answer: userAnswer,
            autoGrade: {
                status: 'incorrect',
                score: 0,
                maxScore: maxPoints
            }
        };

        switch (q.type) {
            case 'multiple_choice':
            case 'dropdown':
                // Auto-grade: compare to correct index
                if (q.correct !== undefined) {
                    if (userAnswer === q.correct) {
                        result.autoGrade.status = 'correct';
                        result.autoGrade.score = maxPoints;
                        correctCount++;
                    }
                } else {
                    // No correct answer - survey question (just record response)
                    result.autoGrade.status = 'answered';
                    result.autoGrade.score = null;
                    result.autoGrade.maxScore = null;
                }
                break;

            case 'checkbox':
                // Auto-grade: compare to correct indices
                if (q.correctMultiple && q.correctMultiple.length > 0) {
                    const userArray = Array.isArray(userAnswer) ? userAnswer : [];
                    const correctSet = new Set(q.correctMultiple);

                    // Count correct selections
                    let correctSelections = 0;
                    userArray.forEach(selection => {
                        if (correctSet.has(selection)) {
                            correctSelections++;
                        }
                    });

                    const totalCorrect = correctSet.size;

                    if (correctSelections === totalCorrect && userArray.length === totalCorrect) {
                        // Perfect score: all correct, no extras
                        result.autoGrade.status = 'correct';
                        result.autoGrade.score = maxPoints;
                        correctCount++;
                    } else if (allowPartial && correctSelections > 0) {
                        // Partial credit: correct / max(selected, required)
                        // This penalizes over-selection without double-counting
                        const denominator = Math.max(userArray.length, totalCorrect);
                        const partialRatio = correctSelections / denominator;
                        const partialScore = Math.round(maxPoints * partialRatio * 100) / 100;
                        if (partialScore > 0) {
                            result.autoGrade.status = 'partial';
                            result.autoGrade.score = partialScore;
                        }
                    }
                } else {
                    // No correct answer - survey question (just record response)
                    result.autoGrade.status = 'answered';
                    result.autoGrade.score = null;
                    result.autoGrade.maxScore = null;
                }
                break;

            case 'numeric':
                // Auto-grade: check within tolerance
                if (userAnswer !== null && userAnswer !== undefined && q.answer !== undefined) {
                    const expected = q.answer;
                    const tolerance = q.tolerance || 0;
                    const diff = Math.abs(userAnswer - expected);

                    if (diff <= tolerance) {
                        result.autoGrade.status = 'correct';
                        result.autoGrade.score = maxPoints;
                        correctCount++;
                    }
                }
                break;

            case 'scale':
                // Auto-grade if correct value specified
                if (q.correct !== undefined) {
                    if (userAnswer === q.correct) {
                        result.autoGrade.status = 'correct';
                        result.autoGrade.score = maxPoints;
                        correctCount++;
                    }
                } else {
                    // No correct answer - survey question (just record response)
                    result.autoGrade.status = 'answered';
                    result.autoGrade.score = null;
                    result.autoGrade.maxScore = null;
                }
                break;

            case 'grid':
                // Auto-grade if correctAnswers specified (with partial credit per row)
                const gridCorrectAnswers = q.correctAnswers;
                const gridRows = q.rows || [];
                const gridColumns = q.columns || [];

                // Build lookup (normalize both formats to {rowIdx: colIdx})
                const gridCorrectLookup = {};
                if (gridCorrectAnswers) {
                    if (Array.isArray(gridCorrectAnswers)) {
                        // Array format: [[0, 2], [2, 3]]
                        gridCorrectAnswers.forEach(([rowIdx, colIdx]) => {
                            gridCorrectLookup[rowIdx] = colIdx;
                        });
                    } else {
                        // Object format: {"Row Name": "Column Name"}
                        Object.entries(gridCorrectAnswers).forEach(([rowName, colName]) => {
                            const rowIdx = gridRows.indexOf(rowName);
                            const colIdx = gridColumns.indexOf(colName);
                            if (rowIdx !== -1 && colIdx !== -1) {
                                gridCorrectLookup[rowIdx] = colIdx;
                            }
                        });
                    }
                }

                const totalRows = Object.keys(gridCorrectLookup).length;
                if (totalRows > 0) {
                    let correctRows = 0;
                    Object.entries(gridCorrectLookup).forEach(([rowIdx, expectedColIdx]) => {
                        if (userAnswer?.[rowIdx] === expectedColIdx) {
                            correctRows++;
                        }
                    });

                    if (correctRows === totalRows) {
                        result.autoGrade.status = 'correct';
                        result.autoGrade.score = maxPoints;
                        correctCount++;
                    } else if (allowPartial && correctRows > 0) {
                        const partialRatio = correctRows / totalRows;
                        const partialScore = Math.round(maxPoints * partialRatio * 100) / 100;
                        result.autoGrade.status = 'partial';
                        result.autoGrade.score = partialScore;
                    }
                } else {
                    // No correct answers - survey question (just record response)
                    result.autoGrade.status = 'answered';
                    result.autoGrade.score = null;
                    result.autoGrade.maxScore = null;
                }
                break;

            case 'date':
            case 'time':
            case 'datetime':
                // Auto-grade if correct value specified (exact match)
                if (q.correct !== undefined) {
                    if (userAnswer === q.correct) {
                        result.autoGrade.status = 'correct';
                        result.autoGrade.score = maxPoints;
                        correctCount++;
                    }
                } else {
                    // No correct answer - survey question (just record response)
                    result.autoGrade.status = 'answered';
                    result.autoGrade.score = null;
                    result.autoGrade.maxScore = null;
                }
                break;

            case 'short_answer':
                // Auto-grade if acceptedAnswers provided, otherwise pending review
                if (q.acceptedAnswers && q.acceptedAnswers.length > 0 && userAnswer) {
                    const normalizedAnswer = String(userAnswer).trim().toLowerCase();
                    const isMatch = q.acceptedAnswers.some(accepted =>
                        String(accepted).trim().toLowerCase() === normalizedAnswer
                    );
                    if (isMatch) {
                        result.autoGrade.status = 'correct';
                        result.autoGrade.score = maxPoints;
                        correctCount++;
                    } else {
                        // Answer doesn't match - mark for teacher review (might still be correct)
                        result.autoGrade.status = 'pending_review';
                        result.autoGrade.score = null;
                        pendingCount++;
                    }
                } else {
                    // No acceptedAnswers defined - always needs review
                    result.autoGrade.status = 'pending_review';
                    result.autoGrade.score = null;
                    pendingCount++;
                }
                break;

            case 'worked':
                // Cannot auto-grade: mark as pending review
                result.autoGrade.status = 'pending_review';
                result.autoGrade.score = null; // Will be graded by teacher/AI
                pendingCount++;
                break;
        }

        // Accumulate totals (skip survey questions with null scores)
        if (result.autoGrade.maxScore !== null) {
            totalPossible += result.autoGrade.maxScore;
            totalEarned += result.autoGrade.score || 0;
        }

        gradedAnswers.push(result);
    });

    // Calculate percentage (avoid division by zero)
    const percentage = totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 100) : null;

    return {
        timestamp: new Date().toISOString(),
        answers: gradedAnswers,
        score: {
            earned: totalEarned,
            possible: totalPossible,
            percentage: percentage,
            correct: correctCount,
            total: questions.length,
            pending_review: pendingCount
        }
    };
}

// Save quiz attempt to card and persist
async function saveQuizAttempt(card, attempt) {
    // Add attempt to card
    if (!card.attempts) card.attempts = [];
    card.attempts.push(attempt);

    // Clear retake mode flag
    delete card._quizRetakeMode;

    // Update modified timestamp
    card.modified = new Date().toISOString();

    // Save to IndexedDB
    await saveData();

    // Save to filesystem - find the section containing this card
    const section = findSectionByItem(card);
    if (section) {
        await saveCardFile(section.id, card);
    }

    // Re-render the viewer to show results
    const viewerContent = document.getElementById('viewerContent');
    if (viewerContent) {
        const templateRegistry = getTemplateRegistry();
        const template = templateRegistry[card.template || card.type];
        viewerContent.innerHTML = renderViewer(card, template);
    }

    // Re-render main view to update card preview
    render();
}

// Submit a review for a pending_review question
async function submitQuizReview(questionIndex, status) {
    const quizViewer = document.querySelector('.quiz-viewer');
    const quizId = quizViewer?.dataset.quizId;
    if (!quizId) return;

    const card = findCardById(quizId);
    if (!card) return;

    const attempts = card.attempts || [];
    if (attempts.length === 0) return;

    // Get feedback from textarea
    const feedbackEl = document.getElementById(`reviewFeedback_${questionIndex}`);
    const feedback = feedbackEl?.value?.trim() || '';

    // Update the last attempt's answer
    const lastAttempt = attempts[attempts.length - 1];
    const answer = lastAttempt.answers?.find(a => a.questionIndex === questionIndex);
    if (!answer) return;

    // Update status and add review
    answer.status = status;
    answer.review = {
        feedback: feedback || undefined,
        reviewedAt: new Date().toISOString()
    };

    // Recalculate score
    let correctCount = 0;
    let pendingCount = 0;
    lastAttempt.answers.forEach(a => {
        if (a.status === 'correct') correctCount++;
        else if (a.status === 'pending_review') pendingCount++;
    });
    lastAttempt.score.correct = correctCount;
    lastAttempt.score.pending_review = pendingCount;

    // Update modified timestamp
    card.modified = new Date().toISOString();

    // Save to IndexedDB
    await saveData();

    // Save to filesystem - find the section containing this card
    const section = findSectionByItem(card);
    if (section) {
        await saveCardFile(section.id, card);
    }

    // Re-render the viewer
    const viewerContent = document.getElementById('viewerContent');
    if (viewerContent) {
        const templateRegistry = getTemplateRegistry();
        const template = templateRegistry[card.template || card.type];
        viewerContent.innerHTML = renderViewer(card, template);
    }

    // Re-render main view to update card preview
    render();

    showToast(`Marked as ${status}`, 'success');
}

// ========== REGISTER GLOBAL HANDLERS ==========
// These are needed for onclick attributes in rendered HTML

window.selectQuizOption = selectQuizOption;
window.toggleQuizCheckbox = toggleQuizCheckbox;
window.updateQuizAnswer = updateQuizAnswer;
window.selectScaleOption = selectScaleOption;
window.selectGridOption = selectGridOption;
window.submitQuiz = submitQuiz;
window.retakeQuiz = retakeQuiz;
window.submitQuizReview = submitQuizReview;
