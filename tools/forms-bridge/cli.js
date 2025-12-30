#!/usr/bin/env node

/**
 * forms-bridge CLI
 *
 * CLI for Google Forms integration with research-notebook quizzes.
 * Uses Google Forms REST API for form creation and response retrieval.
 *
 * Commands:
 *   auth      - Authenticate with Google (one-time setup)
 *   export    - Export a Google Form to quiz JSON
 *   create    - Create a Google Form from quiz JSON
 *   responses - Get responses from a Google Form
 */

import fs from 'fs/promises';
import { getAuthClient, hasCredentials, hasToken, getConfigPaths, clearToken } from './lib/auth.js';
import { getForm, getResponses, createForm, updateForm, parseFormId } from './lib/forms-api.js';
import { formsToQuiz, quizToFormsRequests, getQuizSettingsRequest } from './lib/translate.js';

const VERSION = '0.1.0';

function printUsage() {
  console.log(`
forms-bridge v${VERSION}

Usage: forms-bridge <command> [options]

Commands:
  auth              Authenticate with Google (opens browser)
  auth --status     Check authentication status
  auth --logout     Clear saved token

  export <form>     Export a Google Form to quiz JSON
                    <form> can be a form ID or full URL
  export <form> --raw  Export raw Forms API JSON (for debugging)

  responses <form>  Get responses from a Google Form
                    <form> can be a form ID or full URL
  responses <form> --raw  Raw API response (for debugging)

  create <file>     Create a Google Form from quiz JSON
                    Returns the new form URL on success

Setup:
  1. Create a Google Cloud project at https://console.cloud.google.com
  2. Enable the Google Forms API
  3. Create OAuth 2.0 credentials (Desktop app type)
  4. Download the JSON and save to: ~/.forms-bridge/credentials.json
  5. Run: forms-bridge auth
`);
}

async function authCommand(args) {
  const paths = getConfigPaths();

  // Handle --status flag
  if (args.includes('--status')) {
    const hasCreds = await hasCredentials();
    const hasTok = await hasToken();

    console.log('forms-bridge authentication status:\n');
    console.log(`  Credentials: ${hasCreds ? '✓ Found' : '✗ Not found'}`);
    console.log(`  Token:       ${hasTok ? '✓ Found' : '✗ Not found'}`);
    console.log(`\n  Config dir:  ${paths.configDir}`);

    if (!hasCreds) {
      console.log('\nTo set up credentials:');
      console.log('  1. Go to https://console.cloud.google.com/apis/credentials');
      console.log('  2. Create OAuth 2.0 Client ID (Desktop app)');
      console.log(`  3. Download JSON to: ${paths.credentialsPath}`);
    } else if (!hasTok) {
      console.log('\nRun `forms-bridge auth` to authenticate.');
    } else {
      console.log('\nReady to use!');
    }
    return;
  }

  // Handle --logout flag
  if (args.includes('--logout')) {
    await clearToken();
    return;
  }

  // Normal auth flow
  try {
    const forceNew = args.includes('--force');
    await getAuthClient({ forceNew });
    console.log('\nReady to use forms-bridge commands.');
  } catch (err) {
    console.error('Authentication failed:', err.message);
    process.exit(1);
  }
}

async function exportCommand(args) {
  const rawMode = args.includes('--raw');
  const formArg = args.find(a => !a.startsWith('--'));

  if (!formArg) {
    console.error('Usage: forms-bridge export <form-id-or-url> [--raw]');
    console.error('\nExample:');
    console.error('  forms-bridge export 1ABC123xyz');
    console.error('  forms-bridge export "https://docs.google.com/forms/d/1ABC123xyz/edit"');
    console.error('  forms-bridge export 1ABC123xyz --raw   # Raw Forms API JSON');
    process.exit(1);
  }

  try {
    const formId = parseFormId(formArg);
    const authClient = await getAuthClient();

    console.error(`Fetching form ${formId}...`);
    const form = await getForm(authClient, formId);

    // Output JSON to stdout (use stderr for status messages)
    if (rawMode) {
      console.log(JSON.stringify(form, null, 2));
    } else {
      const quiz = formsToQuiz(form);
      console.log(JSON.stringify(quiz, null, 2));
    }
  } catch (err) {
    if (err.code === 404 || err.message?.includes('not found')) {
      console.error(`Form not found: ${formArg}`);
      console.error('Make sure you have access to this form.');
    } else if (err.code === 403) {
      console.error('Permission denied. Make sure you have access to this form.');
    } else {
      console.error('Export failed:', err.message);
    }
    process.exit(1);
  }
}

async function responsesCommand(args) {
  const rawMode = args.includes('--raw');
  const formArg = args.find(a => !a.startsWith('--'));

  if (!formArg) {
    console.error('Usage: forms-bridge responses <form-id-or-url> [--raw]');
    console.error('\nExample:');
    console.error('  forms-bridge responses 1ABC123xyz');
    console.error('  forms-bridge responses "https://docs.google.com/forms/d/1ABC123xyz/edit"');
    console.error('  forms-bridge responses 1ABC123xyz --raw   # Raw API response');
    process.exit(1);
  }

  try {
    const formId = parseFormId(formArg);
    const authClient = await getAuthClient();

    // Fetch form structure to map question IDs to text
    console.error(`Fetching form ${formId}...`);
    const form = await getForm(authClient, formId);

    // Build question map: questionId -> { title, type, options }
    const questionMap = {};
    for (const item of form.items || []) {
      if (item.questionItem?.question) {
        const q = item.questionItem.question;
        questionMap[q.questionId] = {
          title: item.title,
          itemId: item.itemId,
          questionId: q.questionId
        };
      }
    }

    // Fetch responses
    console.error('Fetching responses...');
    const responsesData = await getResponses(authClient, formId);

    if (rawMode) {
      console.log(JSON.stringify(responsesData, null, 2));
      return;
    }

    // Transform responses to usable format
    const responses = (responsesData.responses || []).map(r => {
      const transformed = {
        responseId: r.responseId,
        submittedAt: r.lastSubmittedTime,
        email: r.respondentEmail || null,
        answers: {}
      };

      // Map answers using question text
      for (const [questionId, answer] of Object.entries(r.answers || {})) {
        const questionInfo = questionMap[questionId];
        const questionTitle = questionInfo?.title || questionId;

        // Extract answer value(s)
        const textAnswers = answer.textAnswers?.answers || [];
        if (textAnswers.length === 1) {
          transformed.answers[questionTitle] = textAnswers[0].value;
        } else if (textAnswers.length > 1) {
          transformed.answers[questionTitle] = textAnswers.map(a => a.value);
        }
      }

      return transformed;
    });

    // Output structured responses
    const output = {
      formId,
      formTitle: form.info?.title,
      responseCount: responses.length,
      responses
    };

    console.log(JSON.stringify(output, null, 2));
    console.error(`\n${responses.length} response(s) retrieved.`);

  } catch (err) {
    if (err.code === 404 || err.message?.includes('not found')) {
      console.error(`Form not found: ${formArg}`);
    } else if (err.code === 403) {
      console.error('Permission denied. Make sure you have access to view responses.');
    } else {
      console.error('Failed to get responses:', err.message);
    }
    process.exit(1);
  }
}

async function createCommand(args) {
  const fileArg = args.find(a => !a.startsWith('--'));

  if (!fileArg) {
    console.error('Usage: forms-bridge create <quiz.json>');
    console.error('\nExample:');
    console.error('  forms-bridge create my-quiz.json');
    console.error('  forms-bridge create ./quizzes/math-test.json');
    process.exit(1);
  }

  try {
    // Read and parse quiz file
    console.error(`Reading ${fileArg}...`);
    const content = await fs.readFile(fileArg, 'utf-8');
    const quiz = JSON.parse(content);

    if (!quiz.title) {
      console.error('Error: Quiz must have a title');
      process.exit(1);
    }

    const authClient = await getAuthClient();

    // Step 1: Create empty form
    console.error(`Creating form "${quiz.title}"...`);
    const form = await createForm(authClient, quiz.title);
    const formId = form.formId;
    console.error(`Form created: ${formId}`);

    // Step 2: Enable quiz mode and add description
    const setupRequests = [getQuizSettingsRequest()];

    // Add description if present
    if (quiz.description) {
      setupRequests.push({
        updateFormInfo: {
          info: { description: quiz.description },
          updateMask: 'description'
        }
      });
    }

    console.error('Enabling quiz mode...');
    await updateForm(authClient, formId, setupRequests);

    // Step 3: Add questions
    if (quiz.questions?.length > 0) {
      console.error(`Adding ${quiz.questions.length} questions...`);
      const questionRequests = quizToFormsRequests(quiz);
      await updateForm(authClient, formId, questionRequests);
    }

    // Output form URL to stdout
    const formUrl = `https://docs.google.com/forms/d/${formId}/edit`;
    console.log(formUrl);

    console.error('\nForm created successfully!');
    console.error(`Edit: ${formUrl}`);
    console.error(`Share: https://docs.google.com/forms/d/${formId}/viewform`);

  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(`File not found: ${fileArg}`);
    } else if (err instanceof SyntaxError) {
      console.error(`Invalid JSON in ${fileArg}: ${err.message}`);
    } else {
      console.error('Create failed:', err.message);
    }
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    printUsage();
    return;
  }

  if (command === '--version' || command === '-v') {
    console.log(`forms-bridge v${VERSION}`);
    return;
  }

  switch (command) {
    case 'auth':
      await authCommand(args.slice(1));
      break;

    case 'export':
      await exportCommand(args.slice(1));
      break;

    case 'create':
      await createCommand(args.slice(1));
      break;

    case 'responses':
      await responsesCommand(args.slice(1));
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.log('Run `forms-bridge --help` for usage.');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
