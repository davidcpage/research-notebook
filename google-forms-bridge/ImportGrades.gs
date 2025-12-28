/**
 * Import grades to Google Forms responses.
 *
 * Google Forms stores grades at the item response level. When in quiz mode,
 * teachers can grade responses and provide feedback, which students can view.
 */
var ImportGrades = (function() {

  /**
   * Import grades from JSON to form responses.
   *
   * @param {string} formId - The Google Form ID
   * @param {Object} grades - Object mapping responseId to grade data
   *
   * Expected grades format:
   * {
   *   "responseId1": {
   *     "0": { "score": 5, "feedback": "Great work!" },
   *     "1": { "score": 3, "feedback": "Needs more detail" }
   *   },
   *   "responseId2": { ... }
   * }
   *
   * @returns {Object} Result with success count and errors
   */
  function importFromJSON(formId, grades) {
    const form = FormApp.openById(formId);

    if (!form.isQuiz()) {
      return {
        success: false,
        error: "Form is not in quiz mode. Enable quiz mode to grade responses."
      };
    }

    const items = form.getItems();
    const responses = form.getResponses();

    // Build response ID to FormResponse map
    const responseMap = {};
    for (var i = 0; i < responses.length; i++) {
      responseMap[responses[i].getId()] = responses[i];
    }

    // Build item index to Item map (for gradable items only)
    const gradableItems = {};
    for (var i = 0; i < items.length; i++) {
      const item = items[i];
      if (isGradableItem(item)) {
        gradableItems[i] = item;
      }
    }

    var successCount = 0;
    var errorCount = 0;
    var errors = [];

    // Process each response
    for (var responseId in grades) {
      if (!grades.hasOwnProperty(responseId)) continue;

      const response = responseMap[responseId];
      if (!response) {
        errors.push({ responseId: responseId, error: "Response not found" });
        errorCount++;
        continue;
      }

      const questionGrades = grades[responseId];
      var gradesApplied = 0;

      try {
        // Get all item responses for this form response
        const itemResponses = response.getItemResponses();
        const itemResponseMap = {};
        for (var j = 0; j < itemResponses.length; j++) {
          const ir = itemResponses[j];
          const item = ir.getItem();
          // Map by item position/index
          for (var idx in gradableItems) {
            if (gradableItems[idx].getId() === item.getId()) {
              itemResponseMap[idx] = ir;
              break;
            }
          }
        }

        // Apply grades to each question
        for (var qIndex in questionGrades) {
          if (!questionGrades.hasOwnProperty(qIndex)) continue;

          const grade = questionGrades[qIndex];
          const itemResponse = itemResponseMap[qIndex];

          if (!itemResponse) {
            // Student didn't answer this question
            continue;
          }

          // Apply score and feedback
          if (grade.score !== undefined && grade.score !== null) {
            var gradeBuilder = itemResponse.setScore(grade.score);

            if (grade.feedback) {
              gradeBuilder = gradeBuilder.setFeedback(
                FormApp.createFeedback()
                  .setText(grade.feedback)
                  .build()
              );
            }

            gradesApplied++;
          }
        }

        // Submit the grades for this response
        if (gradesApplied > 0) {
          form.submitGrades([response]);
          successCount++;
        }

      } catch (e) {
        errors.push({ responseId: responseId, error: e.message });
        errorCount++;
      }
    }

    return {
      success: errorCount === 0,
      processed: Object.keys(grades).length,
      successCount: successCount,
      errorCount: errorCount,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Check if an item type can be graded.
   */
  function isGradableItem(item) {
    const type = item.getType();
    return (
      type === FormApp.ItemType.MULTIPLE_CHOICE ||
      type === FormApp.ItemType.CHECKBOX ||
      type === FormApp.ItemType.TEXT ||
      type === FormApp.ItemType.PARAGRAPH_TEXT ||
      type === FormApp.ItemType.SCALE ||
      type === FormApp.ItemType.GRID ||
      type === FormApp.ItemType.CHECKBOX_GRID
    );
  }

  /**
   * Get current grades for a response (for verification/debugging).
   *
   * @param {string} formId - The Google Form ID
   * @param {string} responseId - The response ID
   * @returns {Object} Current grades for the response
   */
  function getResponseGrades(formId, responseId) {
    const form = FormApp.openById(formId);
    const responses = form.getResponses();

    for (var i = 0; i < responses.length; i++) {
      if (responses[i].getId() === responseId) {
        const response = responses[i];
        const itemResponses = response.getItemResponses();
        const grades = {};

        for (var j = 0; j < itemResponses.length; j++) {
          const ir = itemResponses[j];
          try {
            grades[j] = {
              questionId: ir.getItem().getId(),
              score: ir.getScore(),
              feedback: ir.getFeedback() ? ir.getFeedback().getText() : null
            };
          } catch (e) {
            grades[j] = { error: e.message };
          }
        }

        return grades;
      }
    }

    return { error: "Response not found" };
  }

  // Public API
  return {
    importFromJSON: importFromJSON,
    getResponseGrades: getResponseGrades
  };

})();
