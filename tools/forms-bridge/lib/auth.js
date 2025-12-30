/**
 * OAuth authentication for Google Forms API
 *
 * Uses the "installed app" OAuth flow:
 * 1. User provides OAuth credentials from Google Cloud Console
 * 2. CLI opens browser for consent
 * 3. Token is cached locally for future use
 */

import { google } from 'googleapis';
import { createServer } from 'http';
import { URL } from 'url';
import { promises as fs } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// Scopes required for Forms API
const SCOPES = [
  'https://www.googleapis.com/auth/forms.body',
  'https://www.googleapis.com/auth/forms.responses.readonly'
];

// Config directory for storing credentials and tokens
const CONFIG_DIR = join(homedir(), '.forms-bridge');
const CREDENTIALS_PATH = join(CONFIG_DIR, 'credentials.json');
const TOKEN_PATH = join(CONFIG_DIR, 'token.json');

/**
 * Ensure the config directory exists
 */
async function ensureConfigDir() {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

/**
 * Load OAuth credentials from the config directory
 * @returns {Promise<Object>} The credentials object
 */
async function loadCredentials() {
  try {
    const content = await fs.readFile(CREDENTIALS_PATH, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(
        `No credentials found at ${CREDENTIALS_PATH}\n\n` +
        'To set up:\n' +
        '1. Go to https://console.cloud.google.com/apis/credentials\n' +
        '2. Create an OAuth 2.0 Client ID (Desktop app type)\n' +
        '3. Download the JSON and save it as:\n' +
        `   ${CREDENTIALS_PATH}\n`
      );
    }
    throw err;
  }
}

/**
 * Load a cached token if available
 * @returns {Promise<Object|null>} The token object or null
 */
async function loadToken() {
  try {
    const content = await fs.readFile(TOKEN_PATH, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Save token to disk for future use
 * @param {Object} token - The token object to save
 */
async function saveToken(token) {
  await ensureConfigDir();
  await fs.writeFile(TOKEN_PATH, JSON.stringify(token, null, 2));
}

/**
 * Create an OAuth2 client from credentials
 * @param {Object} credentials - The credentials object
 * @returns {google.auth.OAuth2} The OAuth2 client
 */
function createOAuth2Client(credentials) {
  const { client_id, client_secret } = credentials.installed || credentials.web || {};
  if (!client_id || !client_secret) {
    throw new Error('Invalid credentials file: missing client_id or client_secret');
  }
  // Use loopback redirect for desktop apps
  return new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3000/callback');
}

/**
 * Start a local server to receive the OAuth callback
 * @param {google.auth.OAuth2} oauth2Client - The OAuth2 client
 * @returns {Promise<Object>} The token object
 */
function waitForCallback(oauth2Client) {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url, 'http://localhost:3000');
        if (url.pathname !== '/callback') {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        const code = url.searchParams.get('code');
        if (!code) {
          res.writeHead(400);
          res.end('Missing authorization code');
          reject(new Error('Missing authorization code'));
          return;
        }

        // Exchange code for token
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="font-family: system-ui; padding: 40px; text-align: center;">
              <h1>Authorization successful!</h1>
              <p>You can close this window and return to the terminal.</p>
            </body>
          </html>
        `);

        server.close();
        resolve(tokens);
      } catch (err) {
        res.writeHead(500);
        res.end('Authorization failed');
        server.close();
        reject(err);
      }
    });

    server.listen(3000, () => {
      console.log('Waiting for authorization...');
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error('Port 3000 is in use. Please close other applications using it.'));
      } else {
        reject(err);
      }
    });
  });
}

/**
 * Perform the browser-based OAuth flow
 * @param {google.auth.OAuth2} oauth2Client - The OAuth2 client
 * @returns {Promise<Object>} The token object
 */
async function browserAuthFlow(oauth2Client) {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'  // Always prompt to ensure we get a refresh token
  });

  console.log('\nOpening browser for authorization...');
  console.log('If browser does not open, visit:\n');
  console.log(authUrl);
  console.log('');

  // Open browser (works on macOS, Linux, Windows)
  const { exec } = await import('child_process');
  const cmd = process.platform === 'darwin' ? 'open' :
              process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${cmd} "${authUrl}"`);

  return waitForCallback(oauth2Client);
}

/**
 * Get an authenticated OAuth2 client
 *
 * If a valid token exists, uses it. Otherwise, initiates the browser auth flow.
 *
 * @param {Object} options
 * @param {boolean} options.forceNew - Force new authentication even if token exists
 * @returns {Promise<google.auth.OAuth2>} Authenticated OAuth2 client
 */
export async function getAuthClient({ forceNew = false } = {}) {
  await ensureConfigDir();
  const credentials = await loadCredentials();
  const oauth2Client = createOAuth2Client(credentials);

  // Try to use cached token
  if (!forceNew) {
    const token = await loadToken();
    if (token) {
      oauth2Client.setCredentials(token);

      // Check if token needs refresh
      if (token.expiry_date && token.expiry_date < Date.now()) {
        console.log('Token expired, refreshing...');
        try {
          const { credentials: newTokens } = await oauth2Client.refreshAccessToken();
          await saveToken(newTokens);
          console.log('Token refreshed successfully.');
        } catch (err) {
          console.log('Refresh failed, re-authenticating...');
          const newToken = await browserAuthFlow(oauth2Client);
          await saveToken(newToken);
        }
      }

      return oauth2Client;
    }
  }

  // No token or force new - do browser auth
  const token = await browserAuthFlow(oauth2Client);
  await saveToken(token);
  console.log('Authorization successful! Token saved.');

  return oauth2Client;
}

/**
 * Check if credentials are configured
 * @returns {Promise<boolean>} True if credentials file exists
 */
export async function hasCredentials() {
  try {
    await fs.access(CREDENTIALS_PATH);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a valid token exists
 * @returns {Promise<boolean>} True if token file exists
 */
export async function hasToken() {
  try {
    await fs.access(TOKEN_PATH);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get paths to config files (for status display)
 */
export function getConfigPaths() {
  return {
    configDir: CONFIG_DIR,
    credentialsPath: CREDENTIALS_PATH,
    tokenPath: TOKEN_PATH
  };
}

/**
 * Delete cached token (for logout/reset)
 */
export async function clearToken() {
  try {
    await fs.unlink(TOKEN_PATH);
    console.log('Token cleared.');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}
