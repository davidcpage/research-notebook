#!/usr/bin/env node

/**
 * Notebook CLI - Simple static file server for the notebook app
 *
 * Usage:
 *   notebook              # Start server on port 8080, open browser
 *   notebook --port 3000  # Custom port
 *   notebook --no-open    # Don't auto-open browser
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { platform } from 'node:os';

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
  notebook [options]

Options:
  --port, -p <port>  Port to listen on (default: 8080)
  --no-open          Don't auto-open browser
  --help, -h         Show this help message

Examples:
  notebook              # Start on port 8080, open browser
  notebook -p 3000      # Start on port 3000
  notebook --no-open    # Start without opening browser
`);
            process.exit(0);
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

        // Default to index.html
        if (pathname === '/') {
            pathname = '/index.html';
        }

        const filePath = join(__dirname, pathname);
        await serveFile(res, filePath);
    });

    server.listen(options.port, () => {
        const url = `http://localhost:${options.port}`;
        console.log(`
┌─────────────────────────────────────────┐
│                                         │
│   Notebook server running               │
│                                         │
│   Local:  ${url.padEnd(25)}  │
│                                         │
│   Press Ctrl+C to stop                  │
│                                         │
└─────────────────────────────────────────┘
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
