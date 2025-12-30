/**
 * Google Forms REST API wrapper
 *
 * Provides functions for interacting with the Forms API:
 * - getForm: Export form structure
 * - getResponses: Get form responses
 * - createForm: Create new form
 * - updateForm: Modify form (add questions, etc.)
 */

import { google } from 'googleapis';

/**
 * Get a Forms API client
 * @param {google.auth.OAuth2} authClient - Authenticated OAuth2 client
 * @returns {forms_v1.Forms} Forms API client
 */
function getFormsClient(authClient) {
  return google.forms({ version: 'v1', auth: authClient });
}

/**
 * Get form structure by ID
 * @param {google.auth.OAuth2} authClient - Authenticated OAuth2 client
 * @param {string} formId - The form ID (from URL)
 * @returns {Promise<Object>} Form object with title, items, settings
 */
export async function getForm(authClient, formId) {
  const forms = getFormsClient(authClient);
  const response = await forms.forms.get({ formId });
  return response.data;
}

/**
 * Get all responses for a form
 * @param {google.auth.OAuth2} authClient - Authenticated OAuth2 client
 * @param {string} formId - The form ID
 * @returns {Promise<Object>} Responses object with array of response items
 */
export async function getResponses(authClient, formId) {
  const forms = getFormsClient(authClient);
  const response = await forms.forms.responses.list({ formId });
  return response.data;
}

/**
 * Create a new empty form
 * @param {google.auth.OAuth2} authClient - Authenticated OAuth2 client
 * @param {string} title - Form title
 * @returns {Promise<Object>} Created form object with formId
 */
export async function createForm(authClient, title) {
  const forms = getFormsClient(authClient);
  const response = await forms.forms.create({
    requestBody: {
      info: { title }
    }
  });
  return response.data;
}

/**
 * Update form with batch requests (add questions, change settings, etc.)
 * @param {google.auth.OAuth2} authClient - Authenticated OAuth2 client
 * @param {string} formId - The form ID
 * @param {Array<Object>} requests - Array of update requests
 * @returns {Promise<Object>} Update response
 */
export async function updateForm(authClient, formId, requests) {
  const forms = getFormsClient(authClient);
  const response = await forms.forms.batchUpdate({
    formId,
    requestBody: { requests }
  });
  return response.data;
}

/**
 * Extract form ID from a Google Forms URL
 * @param {string} urlOrId - Form URL or ID
 * @returns {string} The form ID
 */
export function parseFormId(urlOrId) {
  // Already an ID (no slashes)
  if (!urlOrId.includes('/')) {
    return urlOrId;
  }

  // Extract from URL like:
  // https://docs.google.com/forms/d/1ABC123xyz/edit
  // https://docs.google.com/forms/d/1ABC123xyz/viewform
  const match = urlOrId.match(/\/forms\/d\/([a-zA-Z0-9_-]+)/);
  if (match) {
    return match[1];
  }

  throw new Error(`Could not parse form ID from: ${urlOrId}`);
}
