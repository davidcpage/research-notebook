# forms-bridge

CLI for Google Forms integration with research-notebook quizzes. Uses the Google Forms REST API.

## Setup

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or select existing)
3. Enable the **Google Forms API**:
   - APIs & Services → Library → Search "Google Forms API" → Enable

### 2. Create OAuth Credentials

1. Go to APIs & Services → Credentials
2. Click "Create Credentials" → "OAuth client ID"
3. If prompted, configure the OAuth consent screen:
   - User Type: External (or Internal for Workspace)
   - App name: "forms-bridge" (or any name)
   - Scopes: Add `forms.body` and `forms.responses.readonly`
4. Application type: **Desktop app**
5. Download the JSON file
6. Save it as: `~/.forms-bridge/credentials.json`

### 3. Authenticate

```bash
cd tools/forms-bridge
node cli.js auth
```

This opens your browser. Sign in and grant access. Token is saved locally.

## Usage

```bash
# Check auth status
node cli.js auth --status

# Authenticate (opens browser)
node cli.js auth

# Clear saved token
node cli.js auth --logout
```

## Commands (Coming Soon)

```bash
# Create Google Form from quiz JSON
forms-bridge create quiz.json

# Export Google Form structure to JSON
forms-bridge export <form-id>

# Get responses from Google Form
forms-bridge responses <form-id>
```

## Files

- `~/.forms-bridge/credentials.json` - OAuth client credentials (you provide)
- `~/.forms-bridge/token.json` - Cached auth token (auto-generated)

## Development

```bash
npm install
node cli.js --help
```
