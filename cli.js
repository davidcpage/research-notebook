#!/usr/bin/env node

/**
 * Notebook CLI - Simple static file server for the notebook app
 *
 * Usage:
 *   notebook              # Start server on port 8080, open browser
 *   notebook --port 3000  # Custom port
 *   notebook --no-open    # Don't auto-open browser
 *   notebook /path/to/nb  # Enable git features for specified notebook
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { platform } from 'node:os';

const execFileAsync = promisify(execFile);

// Get the directory where this script lives (the repo root)
const __dirname = fileURLToPath(new URL('.', import.meta.url));

// MIME types for static files
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.yaml': 'text/yaml; charset=utf-8',
    '.yml': 'text/yaml; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
};

// Parse command line arguments
function parseArgs(args) {
    const options = {
        port: 8080,
        open: true,
        notebookPath: null,  // Path to notebook for git features
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--port' || arg === '-p') {
            options.port = parseInt(args[++i], 10);
            if (isNaN(options.port)) {
                console.error('Error: --port requires a number');
                process.exit(1);
            }
        } else if (arg === '--no-open') {
            options.open = false;
        } else if (arg === '--help' || arg === '-h') {
            console.log(`
Notebook - File-based notebook for notes, code, and bookmarks

Usage:
  notebook [options] [notebook-path]

Options:
  --port, -p <port>  Port to listen on (default: 8080)
  --no-open          Don't auto-open browser
  --help, -h         Show this help message

Arguments:
  notebook-path      Path to notebook directory (enables git history features)

Examples:
  notebook              # Start on port 8080, open browser
  notebook -p 3000      # Start on port 3000
  notebook --no-open    # Start without opening browser
  notebook ./my-notes   # Enable git features for ./my-notes
`);
            process.exit(0);
        } else if (!arg.startsWith('-')) {
            // Positional argument is the notebook path
            options.notebookPath = resolve(arg);
        }
    }

    return options;
}

// Open URL in default browser
function openBrowser(url) {
    const plat = platform();
    let cmd;

    if (plat === 'darwin') {
        cmd = `open "${url}"`;
    } else if (plat === 'win32') {
        cmd = `start "" "${url}"`;
    } else {
        // Linux and others
        cmd = `xdg-open "${url}"`;
    }

    exec(cmd, (err) => {
        if (err) {
            console.log(`Could not open browser automatically. Please visit: ${url}`);
        }
    });
}

// Git API: Get commit log (repo-level or file-level)
async function gitLog(notebookPath, filePath = null, limit = 20) {
    // If filePath provided, validate it
    if (filePath) {
        const fullPath = join(notebookPath, filePath);
        const relativePath = relative(notebookPath, fullPath);

        if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
            throw new Error('Invalid path');
        }
    }

    try {
        const args = [
            'log',
            `--max-count=${limit}`,
            '--format=%H%x00%h%x00%s%x00%ai%x00%an'
        ];

        // Add file-specific options if path provided
        if (filePath) {
            args.push('--follow', '--', filePath);
        }

        const { stdout } = await execFileAsync('git', args, { cwd: notebookPath });

        if (!stdout.trim()) {
            return [];
        }

        return stdout.trim().split('\n').map(line => {
            const [hash, shortHash, subject, date, author] = line.split('\x00');
            return { hash, shortHash, subject, date, author };
        });
    } catch (err) {
        if (err.message?.includes('not a git repository') || err.stderr?.includes('not a git repository')) {
            return { error: 'not_a_repo' };
        }
        throw err;
    }
}

// Git API: Get diff stats between a commit and working tree
async function gitDiffStat(notebookPath, commit) {
    // Security: sanitize commit ref
    if (!/^[a-zA-Z0-9._\-/^~]+$/.test(commit)) {
        throw new Error('Invalid commit ref');
    }

    try {
        // Get list of changed files with stats
        const { stdout } = await execFileAsync('git', [
            'diff',
            '--numstat',
            commit
        ], { cwd: notebookPath });

        const files = {};

        if (stdout.trim()) {
            for (const line of stdout.trim().split('\n')) {
                const [additions, deletions, filePath] = line.split('\t');
                // Handle binary files (shown as - -)
                files[filePath] = {
                    additions: additions === '-' ? 0 : parseInt(additions, 10),
                    deletions: deletions === '-' ? 0 : parseInt(deletions, 10),
                    binary: additions === '-'
                };
            }
        }

        // Also check for untracked files
        const { stdout: untrackedOut } = await execFileAsync('git', [
            'ls-files',
            '--others',
            '--exclude-standard'
        ], { cwd: notebookPath });

        if (untrackedOut.trim()) {
            for (const filePath of untrackedOut.trim().split('\n')) {
                if (!files[filePath]) {
                    files[filePath] = { additions: 0, deletions: 0, untracked: true };
                }
            }
        }

        return { files };
    } catch (err) {
        if (err.stderr?.includes('not a git repository')) {
            return { error: 'not_a_repo' };
        }
        throw err;
    }
}

// Git API: Get file content at a specific commit
async function gitShow(notebookPath, filePath, commit) {
    const fullPath = join(notebookPath, filePath);
    const relativePath = relative(notebookPath, fullPath);

    // Security: ensure path is within notebook
    if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
        throw new Error('Invalid path');
    }

    // Security: sanitize commit ref (allow only safe characters)
    if (!/^[a-zA-Z0-9._\-/^~]+$/.test(commit)) {
        throw new Error('Invalid commit ref');
    }

    try {
        const { stdout } = await execFileAsync('git', [
            'show',
            `${commit}:${relativePath}`
        ], { cwd: notebookPath, maxBuffer: 10 * 1024 * 1024 });

        return { content: stdout };
    } catch (err) {
        if (err.stderr?.includes('does not exist')) {
            return { error: 'not_found', message: 'File does not exist at this commit' };
        }
        if (err.stderr?.includes('not a git repository')) {
            return { error: 'not_a_repo' };
        }
        throw err;
    }
}

// Handle API requests
async function handleApiRequest(req, res, url, notebookPath) {
    res.setHeader('Content-Type', 'application/json');

    if (!notebookPath) {
        res.writeHead(503);
        res.end(JSON.stringify({
            error: 'git_not_configured',
            message: 'Git features require starting server with notebook path: notebook /path/to/notebook'
        }));
        return true;
    }

    try {
        if (url.pathname === '/api/git-log') {
            const filePath = url.searchParams.get('path');  // Optional - null for repo-level
            const limit = parseInt(url.searchParams.get('limit') || '20', 10);

            const result = await gitLog(notebookPath, filePath, limit);
            res.writeHead(200);
            res.end(JSON.stringify(result));
            return true;
        }

        if (url.pathname === '/api/git-diff-stat') {
            const commit = url.searchParams.get('commit');

            if (!commit) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'missing_commit', message: 'commit parameter required' }));
                return true;
            }

            const result = await gitDiffStat(notebookPath, commit);
            if (result.error) {
                res.writeHead(500);
            } else {
                res.writeHead(200);
            }
            res.end(JSON.stringify(result));
            return true;
        }

        if (url.pathname === '/api/git-show') {
            const filePath = url.searchParams.get('path');
            const commit = url.searchParams.get('commit');

            if (!filePath || !commit) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'missing_params', message: 'path and commit required' }));
                return true;
            }

            const result = await gitShow(notebookPath, filePath, commit);
            if (result.error) {
                res.writeHead(result.error === 'not_found' ? 404 : 500);
            } else {
                res.writeHead(200);
            }
            res.end(JSON.stringify(result));
            return true;
        }

        // Unknown API endpoint
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'not_found' }));
        return true;
    } catch (err) {
        console.error('API error:', err);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'server_error', message: err.message }));
        return true;
    }
}

// Serve a static file
async function serveFile(res, filePath) {
    try {
        const stats = await stat(filePath);

        if (stats.isDirectory()) {
            // Try index.html in directory
            return serveFile(res, join(filePath, 'index.html'));
        }

        const ext = extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        const content = await readFile(filePath);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
    } catch (err) {
        if (err.code === 'ENOENT') {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
        } else {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('500 Internal Server Error');
            console.error('Server error:', err);
        }
    }
}

// Main server
async function main() {
    const options = parseArgs(process.argv.slice(2));

    const server = createServer(async (req, res) => {
        // Parse URL and remove query string
        const url = new URL(req.url, `http://localhost:${options.port}`);
        let pathname = decodeURIComponent(url.pathname);

        // Security: prevent directory traversal
        if (pathname.includes('..')) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('403 Forbidden');
            return;
        }

        // Handle API requests
        if (pathname.startsWith('/api/')) {
            await handleApiRequest(req, res, url, options.notebookPath);
            return;
        }

        // Default to index.html
        if (pathname === '/') {
            pathname = '/index.html';
        }

        const filePath = join(__dirname, pathname);
        await serveFile(res, filePath);
    });

    server.listen(options.port, () => {
        const url = `http://localhost:${options.port}`;
        const gitStatus = options.notebookPath
            ? `Git:    ${options.notebookPath}`
            : 'Git:    (not configured)';
        const boxWidth = Math.max(41, gitStatus.length + 6);
        const pad = (s, w) => s + ' '.repeat(w - s.length);

        console.log(`
┌${'─'.repeat(boxWidth)}┐
│${' '.repeat(boxWidth)}│
│  Notebook server running${' '.repeat(boxWidth - 26)}│
│${' '.repeat(boxWidth)}│
│  Local:  ${pad(url, boxWidth - 10)}│
│  ${pad(gitStatus, boxWidth - 3)}│
│${' '.repeat(boxWidth)}│
│  Press Ctrl+C to stop${' '.repeat(boxWidth - 23)}│
│${' '.repeat(boxWidth)}│
└${'─'.repeat(boxWidth)}┘
`);

        if (options.open) {
            openBrowser(url);
        }
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
        console.log('\nShutting down...');
        server.close(() => {
            process.exit(0);
        });
    });

    process.on('SIGTERM', () => {
        server.close(() => {
            process.exit(0);
        });
    });
}

main().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
