/**
 * Create/update Google Forms from quiz JSON.
 *
 * Maps our quiz schema to Google Forms question types.
 */
var ImportQuiz = (function() {

  /**
   * Create a new Google Form from quiz JSON.
   *
   * @param {Object} quizJSON - Quiz data with title, description, questions[]
   * @returns {Object} { formId, editUrl, publishedUrl, warnings[] }
   */
  function createFromJSON(quizJSON) {
    var form = FormApp.create(quizJSON.title || 'Untitled Quiz');
    return populateForm(form, quizJSON, true);
  }

  /**
   * Update an existing Google Form from quiz JSON.
   * Note: This replaces all questions - use with caution!
   *
   * @param {string} formId - The Google Form ID to update
   * @param {Object} quizJSON - Quiz data
   * @returns {Object} { formId, editUrl, publishedUrl, warnings[] }
   */
  function updateFromJSON(formId, quizJSON) {
    var form = FormApp.openById(formId);

    // Remove existing items (questions)
    var items = form.getItems();
    for (var i = items.length - 1; i >= 0; i--) {
      form.deleteItem(items[i]);
    }

    return populateForm(form, quizJSON, false);
  }

  /**
   * Populate a form with quiz data.
   *
   * @param {Form} form - The Form object
   * @param {Object} quizJSON - Quiz data
   * @param {boolean} isNew - Whether this is a new form
   * @returns {Object} Result with URLs and warnings
   */
  function populateForm(form, quizJSON, isNew) {
    var warnings = [];

    // Set form properties
    if (quizJSON.title) {
      form.setTitle(quizJSON.title);
    }
    if (quizJSON.description) {
      form.setDescription(quizJSON.description);
    }

    // Enable quiz mode for grading
    form.setIsQuiz(true);

    // Add questions
    var questions = quizJSON.questions || [];
    for (var i = 0; i < questions.length; i++) {
      var result = addQuestion(form, questions[i], i);
      if (result.warning) {
        warnings.push(result.warning);
      }
    }

    return {
      formId: form.getId(),
      editUrl: form.getEditUrl(),
      publishedUrl: form.getPublishedUrl(),
      shortenedUrl: form.shortenFormUrl(form.getPublishedUrl()),
      questionCount: questions.length,
      warnings: warnings
    };
  }

  /**
   * Add a single question to the form.
   *
   * @param {Form} form - The Form object
   * @param {Object} q - Question data
   * @param {number} index - Question index
   * @returns {Object} { item: FormItem | null, warning: string | null }
   */
  function addQuestion(form, q, index) {
    var questionText = q.question || 'Question ' + (index + 1);
    var points = q.points || 1;
    var required = q.required !== false; // Default true
    var helpText = q.hint || '';

    switch (q.type) {
      case 'multiple_choice':
        return addMultipleChoice(form, questionText, q, points, required, helpText);

      case 'checkbox':
        return addCheckbox(form, questionText, q, points, required, helpText);

      case 'dropdown':
        return addDropdown(form, questionText, q, points, required, helpText);

      case 'short_answer':
        return addShortAnswer(form, questionText, q, points, required, helpText);

      case 'worked':
        return addParagraph(form, questionText, q, points, required, helpText);

      case 'numeric':
        // Google Forms doesn't have a dedicated numeric type
        // Use short answer - could add regex validation but it's limited
        return addShortAnswer(form, questionText, q, points, required, helpText,
          'Numeric question converted to short answer');

      case 'scale':
        return addScale(form, questionText, q, points, required, helpText);

      case 'grid':
        return addGrid(form, questionText, q, points, required, helpText);

      default:
        return {
          item: null,
          warning: 'Unknown question type "' + q.type + '" at index ' + index + ', skipped'
        };
    }
  }

  /**
   * Add multiple choice (radio) question.
   */
  function addMultipleChoice(form, text, q, points, required, helpText) {
    var item = form.addMultipleChoiceItem();
    item.setTitle(text);
    item.setRequired(required);
    item.setPoints(points);
    if (helpText) item.setHelpText(helpText);

    var options = q.options || [];
    var choices = [];

    for (var i = 0; i < options.length; i++) {
      var isCorrect = (q.correct === i);
      choices.push(item.createChoice(options[i], isCorrect));
    }

    if (choices.length > 0) {
      item.setChoices(choices);
    }

    return { item: item, warning: null };
  }

  /**
   * Add checkbox (multi-select) question.
   */
  function addCheckbox(form, text, q, points, required, helpText) {
    var item = form.addCheckboxItem();
    item.setTitle(text);
    item.setRequired(required);
    item.setPoints(points);
    if (helpText) item.setHelpText(helpText);

    var options = q.options || [];
    var correctIndices = q.correctMultiple || [];
    var choices = [];

    for (var i = 0; i < options.length; i++) {
      var isCorrect = correctIndices.indexOf(i) !== -1;
      choices.push(item.createChoice(options[i], isCorrect));
    }

    if (choices.length > 0) {
      item.setChoices(choices);
    }

    return { item: item, warning: null };
  }

  /**
   * Add dropdown (list) question.
   */
  function addDropdown(form, text, q, points, required, helpText) {
    var item = form.addListItem();
    item.setTitle(text);
    item.setRequired(required);
    item.setPoints(points);
    if (helpText) item.setHelpText(helpText);

    var options = q.options || [];
    var choices = [];

    for (var i = 0; i < options.length; i++) {
      var isCorrect = (q.correct === i);
      choices.push(item.createChoice(options[i], isCorrect));
    }

    if (choices.length > 0) {
      item.setChoices(choices);
    }

    return { item: item, warning: null };
  }

  /**
   * Add short answer (text) question.
   */
  function addShortAnswer(form, text, q, points, required, helpText, warning) {
    var item = form.addTextItem();
    item.setTitle(text);
    item.setRequired(required);
    item.setPoints(points);
    if (helpText) item.setHelpText(helpText);

    return { item: item, warning: warning || null };
  }

  /**
   * Add paragraph (long text) question.
   */
  function addParagraph(form, text, q, points, required, helpText) {
    var item = form.addParagraphTextItem();
    item.setTitle(text);
    item.setRequired(required);
    item.setPoints(points);
    if (helpText) item.setHelpText(helpText);

    return { item: item, warning: null };
  }

  /**
   * Add scale question.
   */
  function addScale(form, text, q, points, required, helpText) {
    var item = form.addScaleItem();
    item.setTitle(text);
    item.setRequired(required);
    item.setPoints(points);
    if (helpText) item.setHelpText(helpText);

    var low = q.low || 1;
    var high = q.high || 5;
    item.setBounds(low, high);

    if (q.lowLabel) item.setLeftLabel(q.lowLabel);
    if (q.highLabel) item.setRightLabel(q.highLabel);

    return { item: item, warning: null };
  }

  /**
   * Add grid question.
   */
  function addGrid(form, text, q, points, required, helpText) {
    var item = form.addGridItem();
    item.setTitle(text);
    item.setRequired(required);
    // Note: GridItem doesn't support setPoints() directly
    if (helpText) item.setHelpText(helpText);

    var rows = q.rows || [];
    var columns = q.columns || [];

    if (rows.length > 0) item.setRows(rows);
    if (columns.length > 0) item.setColumns(columns);

    var warning = null;
    if (q.correctAnswers && q.correctAnswers.length > 0) {
      warning = 'Grid correct answers not auto-set (manual configuration required in Forms)';
    }

    return { item: item, warning: warning };
  }

  // Public API
  return {
    createFromJSON: createFromJSON,
    updateFromJSON: updateFromJSON
  };

})();
