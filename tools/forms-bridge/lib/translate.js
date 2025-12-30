/**
 * Translation layer between Google Forms JSON and quiz schema
 *
 * Google Forms API uses a different structure than our quiz schema.
 * This module handles bidirectional conversion.
 */

/**
 * Convert Google Forms JSON to quiz schema
 * @param {Object} form - Google Forms API response
 * @returns {Object} Quiz object matching our schema
 */
export function formsToQuiz(form) {
  const quiz = {
    title: form.info?.title || 'Untitled Quiz',
    description: form.info?.description || undefined,
    questions: [],
    // Preserve Forms metadata for round-tripping
    _forms: {
      formId: form.formId,
      responderUri: form.responderUri,
      revisionId: form.revisionId
    }
  };

  // Convert each form item to a question
  for (const item of form.items || []) {
    const question = convertFormItemToQuestion(item);
    if (question) {
      quiz.questions.push(question);
    }
  }

  return quiz;
}

/**
 * Convert a single Forms item to a quiz question
 * @param {Object} item - Forms item object
 * @returns {Object|null} Quiz question or null if not convertible
 */
function convertFormItemToQuestion(item) {
  const questionItem = item.questionItem;
  if (!questionItem) {
    // Skip non-question items (page breaks, images, etc.)
    return null;
  }

  const q = questionItem.question;
  const grading = q.grading || {};

  // Base question fields
  const question = {
    question: item.title || '',
    points: grading.pointValue || 1,
    // Preserve Forms IDs for round-tripping
    _forms: {
      itemId: item.itemId,
      questionId: q.questionId
    }
  };

  // Add feedback if present
  if (grading.whenRight?.text) {
    question.whenRight = grading.whenRight.text;
  }
  if (grading.whenWrong?.text) {
    question.whenWrong = grading.whenWrong.text;
  }

  // Convert based on question type
  if (q.choiceQuestion) {
    convertChoiceQuestion(question, q.choiceQuestion, grading);
  } else if (q.textQuestion) {
    convertTextQuestion(question, q.textQuestion, grading);
  } else if (q.scaleQuestion) {
    convertScaleQuestion(question, q.scaleQuestion);
  } else if (q.rowQuestion) {
    convertRowQuestion(question, q.rowQuestion, grading);
  } else {
    // Unknown question type
    question.type = 'short_answer';
    console.warn(`Unknown question type in item ${item.itemId}`);
  }

  return question;
}

/**
 * Convert choice question (radio, checkbox, dropdown)
 */
function convertChoiceQuestion(question, choiceQ, grading) {
  const options = (choiceQ.options || []).map(opt => opt.value);
  question.options = options;

  // Map Forms type to our type
  switch (choiceQ.type) {
    case 'RADIO':
      question.type = 'multiple_choice';
      break;
    case 'CHECKBOX':
      question.type = 'checkbox';
      break;
    case 'DROP_DOWN':
      question.type = 'dropdown';
      break;
    default:
      question.type = 'multiple_choice';
  }

  // Convert correct answers (Forms uses values, we use indices)
  const correctValues = (grading.correctAnswers?.answers || []).map(a => a.value);

  if (question.type === 'checkbox') {
    // Multiple correct answers - store as array of indices
    question.correctMultiple = correctValues
      .map(val => options.indexOf(val))
      .filter(idx => idx !== -1);
  } else {
    // Single correct answer - store as index
    if (correctValues.length > 0) {
      const idx = options.indexOf(correctValues[0]);
      if (idx !== -1) {
        question.correct = idx;
      }
    }
  }
}

/**
 * Convert text question (short answer, paragraph)
 */
function convertTextQuestion(question, textQ, grading) {
  // paragraph: true means long answer, false means short
  question.type = 'short_answer';

  // If Forms has correct answers for text, convert them
  const correctValues = (grading.correctAnswers?.answers || []).map(a => a.value);
  if (correctValues.length > 0) {
    question.acceptedAnswers = correctValues;
  }
}

/**
 * Convert scale question (1-5, 1-10, etc.)
 */
function convertScaleQuestion(question, scaleQ) {
  question.type = 'scale';
  question.low = scaleQ.low || 1;
  question.high = scaleQ.high || 5;
  if (scaleQ.lowLabel) question.lowLabel = scaleQ.lowLabel;
  if (scaleQ.highLabel) question.highLabel = scaleQ.highLabel;
}

/**
 * Convert row/grid question
 */
function convertRowQuestion(question, rowQ, grading) {
  question.type = 'grid';
  // Note: Grid questions in Forms are more complex - this is simplified
  // Full implementation would need to handle rowQuestion structure
  console.warn('Grid question conversion is simplified');
}

// ============================================================
// Quiz to Forms conversion (for creating forms)
// ============================================================

/**
 * Convert quiz schema to Forms API batchUpdate requests
 * @param {Object} quiz - Quiz object matching our schema
 * @returns {Array<Object>} Array of Forms API requests
 */
export function quizToFormsRequests(quiz) {
  const requests = [];

  // Add each question
  quiz.questions.forEach((q, index) => {
    const request = convertQuestionToFormRequest(q, index);
    if (request) {
      requests.push(request);
    }
  });

  return requests;
}

/**
 * Convert a quiz question to a Forms API createItem request
 * @param {Object} q - Quiz question
 * @param {number} index - Question index (for ordering)
 * @returns {Object} Forms API request
 */
function convertQuestionToFormRequest(q, index) {
  const questionItem = {
    question: {}
  };

  // Build grading object
  const grading = {
    pointValue: q.points || 1
  };

  if (q.whenRight) {
    grading.whenRight = { text: q.whenRight };
  }
  if (q.whenWrong) {
    grading.whenWrong = { text: q.whenWrong };
  }

  // Convert based on question type
  switch (q.type) {
    case 'multiple_choice':
    case 'dropdown':
      questionItem.question.choiceQuestion = {
        type: q.type === 'dropdown' ? 'DROP_DOWN' : 'RADIO',
        options: (q.options || []).map(opt => ({ value: opt }))
      };
      // Set correct answer
      if (q.correct !== undefined && q.options?.[q.correct]) {
        grading.correctAnswers = {
          answers: [{ value: q.options[q.correct] }]
        };
      }
      break;

    case 'checkbox':
      questionItem.question.choiceQuestion = {
        type: 'CHECKBOX',
        options: (q.options || []).map(opt => ({ value: opt }))
      };
      // Set correct answers (multiple)
      if (q.correctMultiple?.length > 0 && q.options) {
        grading.correctAnswers = {
          answers: q.correctMultiple
            .filter(idx => q.options[idx])
            .map(idx => ({ value: q.options[idx] }))
        };
      }
      break;

    case 'short_answer':
    case 'worked':
      questionItem.question.textQuestion = {
        paragraph: q.type === 'worked' // worked = long answer
      };
      // Set accepted answers if present
      if (q.acceptedAnswers?.length > 0) {
        grading.correctAnswers = {
          answers: q.acceptedAnswers.map(val => ({ value: val }))
        };
      }
      break;

    case 'scale':
      questionItem.question.scaleQuestion = {
        low: q.low || 1,
        high: q.high || 5
      };
      if (q.lowLabel) questionItem.question.scaleQuestion.lowLabel = q.lowLabel;
      if (q.highLabel) questionItem.question.scaleQuestion.highLabel = q.highLabel;
      break;

    case 'numeric':
      // Forms doesn't have a numeric type - use short answer
      questionItem.question.textQuestion = { paragraph: false };
      // Convert numeric answer to accepted answer
      if (q.answer !== undefined) {
        grading.correctAnswers = {
          answers: [{ value: String(q.answer) }]
        };
      }
      break;

    case 'grid':
      // Grid questions are complex - simplified handling
      console.warn('Grid question export is simplified');
      questionItem.question.textQuestion = { paragraph: true };
      break;

    default:
      console.warn(`Unknown question type: ${q.type}`);
      questionItem.question.textQuestion = { paragraph: false };
  }

  questionItem.question.grading = grading;

  // Google Forms doesn't allow newlines in title - sanitize
  // If question has newlines, use first line as title and rest as description
  const questionText = q.question || '';
  const lines = questionText.split('\n');
  const title = lines[0].replace(/\n/g, ' ').trim();
  const description = lines.length > 1 ? lines.slice(1).join('\n').trim() : undefined;

  const item = { title, questionItem };
  if (description) {
    item.description = description;
  }

  return {
    createItem: {
      item,
      location: { index }
    }
  };
}

/**
 * Get Forms settings request to enable quiz mode
 * @returns {Object} Forms API request to enable quiz settings
 */
export function getQuizSettingsRequest() {
  return {
    updateSettings: {
      settings: {
        quizSettings: {
          isQuiz: true
        }
      },
      updateMask: 'quizSettings.isQuiz'
    }
  };
}
