/**
 * Google Forms Bridge for Research Notebook
 *
 * This Apps Script project provides functions to:
 * 1. Export form responses to JSON (for grading)
 * 2. Import grades back to the form (for students to see)
 *
 * Deploy as API executable and call via clasp run.
 *
 * Usage:
 *   clasp run exportResponses -p '["FORM_ID"]'
 *   clasp run importGrades -p '["FORM_ID", {...grades}]'
 */

/**
 * Export all responses from a form as JSON.
 *
 * @param {string} formId - The Google Form ID
 * @returns {Object} JSON object with form info and responses
 */
function exportResponses(formId) {
  return ExportResponses.exportToJSON(formId);
}

/**
 * Import grades to a form's responses.
 *
 * @param {string} formId - The Google Form ID
 * @param {Object} grades - Object mapping responseId -> grade data
 * @returns {Object} Result with success count and any errors
 */
function importGrades(formId, grades) {
  return ImportGrades.importFromJSON(formId, grades);
}

/**
 * Get form metadata (title, questions) without responses.
 * Useful for creating grading context.
 *
 * @param {string} formId - The Google Form ID
 * @returns {Object} Form metadata
 */
function getFormMetadata(formId) {
  return ExportResponses.getFormMetadata(formId);
}

/**
 * Export form structure to quiz-compatible JSON.
 * Use this to import a Google Form as a quiz card.
 *
 * @param {string} formId - The Google Form ID
 * @returns {Object} Quiz-compatible JSON with questions array
 */
function exportForm(formId) {
  return ExportForm.exportToJSON(formId);
}

/**
 * Create a new Google Form from quiz JSON.
 *
 * @param {Object} quizJSON - Quiz data with title, description, questions[]
 * @returns {Object} { formId, editUrl, publishedUrl, warnings[] }
 */
function createForm(quizJSON) {
  return ImportQuiz.createFromJSON(quizJSON);
}

/**
 * Update an existing Google Form from quiz JSON.
 * WARNING: This replaces all existing questions!
 *
 * @param {string} formId - The Google Form ID to update
 * @param {Object} quizJSON - Quiz data
 * @returns {Object} { formId, editUrl, publishedUrl, warnings[] }
 */
function updateForm(formId, quizJSON) {
  return ImportQuiz.updateFromJSON(formId, quizJSON);
}

/**
 * Test function - verify the script can access a form.
 *
 * @param {string} formId - The Google Form ID
 * @returns {Object} Basic form info
 */
function testAccess(formId) {
  try {
    const form = FormApp.openById(formId);
    return {
      success: true,
      title: form.getTitle(),
      itemCount: form.getItems().length,
      responseCount: form.getResponses().length
    };
  } catch (e) {
    return {
      success: false,
      error: e.message
    };
  }
}
