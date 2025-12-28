/**
 * Export responses from Google Forms to JSON.
 */
var ExportResponses = (function() {

  /**
   * Export form metadata (questions, settings).
   *
   * @param {string} formId - The Google Form ID
   * @returns {Object} Form metadata
   */
  function getFormMetadata(formId) {
    const form = FormApp.openById(formId);

    return {
      formId: formId,
      title: form.getTitle(),
      description: form.getDescription(),
      questions: getQuestions(form),
      isQuiz: form.isQuiz(),
      collectsEmail: form.collectsEmail()
    };
  }

  /**
   * Extract questions from form.
   *
   * @param {Form} form - The Form object
   * @returns {Array} Array of question objects
   */
  function getQuestions(form) {
    const items = form.getItems();
    const questions = [];

    for (var i = 0; i < items.length; i++) {
      const item = items[i];
      const q = {
        index: i,
        id: item.getId(),
        title: item.getTitle(),
        type: getItemTypeName(item.getType()),
        helpText: item.getHelpText()
      };

      // Add type-specific data
      switch (item.getType()) {
        case FormApp.ItemType.MULTIPLE_CHOICE:
          var mc = item.asMultipleChoiceItem();
          q.options = mc.getChoices().map(function(c) {
            return { value: c.getValue(), isCorrect: c.isCorrectAnswer() };
          });
          q.points = mc.getPoints();
          break;

        case FormApp.ItemType.CHECKBOX:
          var cb = item.asCheckboxItem();
          q.options = cb.getChoices().map(function(c) {
            return { value: c.getValue(), isCorrect: c.isCorrectAnswer() };
          });
          q.points = cb.getPoints();
          break;

        case FormApp.ItemType.TEXT:
          var text = item.asTextItem();
          q.points = text.getPoints();
          break;

        case FormApp.ItemType.PARAGRAPH_TEXT:
          var para = item.asParagraphTextItem();
          q.points = para.getPoints();
          break;

        case FormApp.ItemType.SCALE:
          var scale = item.asScaleItem();
          q.lowValue = scale.getLowerBound();
          q.highValue = scale.getUpperBound();
          q.lowLabel = scale.getLeftLabel();
          q.highLabel = scale.getRightLabel();
          break;
      }

      questions.push(q);
    }

    return questions;
  }

  /**
   * Convert ItemType enum to string.
   */
  function getItemTypeName(type) {
    const names = {};
    names[FormApp.ItemType.MULTIPLE_CHOICE] = 'multiple_choice';
    names[FormApp.ItemType.CHECKBOX] = 'checkbox';
    names[FormApp.ItemType.TEXT] = 'short_answer';
    names[FormApp.ItemType.PARAGRAPH_TEXT] = 'paragraph';
    names[FormApp.ItemType.SCALE] = 'scale';
    names[FormApp.ItemType.GRID] = 'grid';
    names[FormApp.ItemType.CHECKBOX_GRID] = 'checkbox_grid';
    names[FormApp.ItemType.DATE] = 'date';
    names[FormApp.ItemType.TIME] = 'time';
    names[FormApp.ItemType.DATETIME] = 'datetime';
    names[FormApp.ItemType.DURATION] = 'duration';
    names[FormApp.ItemType.SECTION_HEADER] = 'section';
    names[FormApp.ItemType.PAGE_BREAK] = 'page_break';
    names[FormApp.ItemType.IMAGE] = 'image';
    names[FormApp.ItemType.VIDEO] = 'video';
    return names[type] || 'unknown';
  }

  /**
   * Export all responses to JSON.
   *
   * @param {string} formId - The Google Form ID
   * @returns {Object} Form metadata and responses
   */
  function exportToJSON(formId) {
    const form = FormApp.openById(formId);
    const formResponses = form.getResponses();
    const items = form.getItems();

    // Build question ID to index map
    const itemIdToIndex = {};
    for (var i = 0; i < items.length; i++) {
      itemIdToIndex[items[i].getId()] = i;
    }

    const responses = formResponses.map(function(response) {
      return {
        responseId: response.getId(),
        timestamp: response.getTimestamp().toISOString(),
        email: response.getRespondentEmail() || null,
        answers: getResponseAnswers(response, items, itemIdToIndex)
      };
    });

    return {
      formId: formId,
      title: form.getTitle(),
      exportedAt: new Date().toISOString(),
      questions: getQuestions(form),
      responses: responses
    };
  }

  /**
   * Extract answers from a single response.
   */
  function getResponseAnswers(response, items, itemIdToIndex) {
    const itemResponses = response.getItemResponses();
    const answers = {};

    for (var i = 0; i < itemResponses.length; i++) {
      const ir = itemResponses[i];
      const item = ir.getItem();
      const index = itemIdToIndex[item.getId()];

      answers[index] = {
        questionIndex: index,
        questionId: item.getId(),
        response: ir.getResponse(),
        score: getItemScore(ir)
      };
    }

    return answers;
  }

  /**
   * Get score for an item response (if quiz mode).
   */
  function getItemScore(itemResponse) {
    try {
      const score = itemResponse.getScore();
      return score !== null ? score : null;
    } catch (e) {
      // Not a quiz or item not gradable
      return null;
    }
  }

  // Public API
  return {
    exportToJSON: exportToJSON,
    getFormMetadata: getFormMetadata
  };

})();
