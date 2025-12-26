// ========== MODULE: pyodide.js ==========
// Python execution via Pyodide runtime
// Config: Pyodide v0.28.2 from jsDelivr CDN, pre-loads numpy/pandas/matplotlib, 120s timeout
// IMPORTANT: initPyodide() not loadPyodide() to avoid collision with window.loadPyodide
// Loaded as regular script (not ES module) for file:// compatibility
// Requires: utilities.js loaded first (for escapeHtml)

// Module-local state
let pyodide = null;
let pyodideLoading = false;
let pyodideReady = false;

// State accessors for external modules
function getPyodideState() {
    return { pyodide, pyodideLoading, pyodideReady };
}

// Load Pyodide lazily
async function initPyodide() {
    if (pyodideReady) return pyodide;
    if (pyodideLoading) {
        // Wait for existing load to complete
        while (pyodideLoading) {
            await new Promise(r => setTimeout(r, 100));
        }
        return pyodide;
    }

    pyodideLoading = true;
    updatePyodideStatus('loading', 'Initializing Python runtime...');
    console.log('[Pyodide] Starting to initialize Pyodide runtime...');

    try {
        // Check if loadPyodide is available
        if (!window.loadPyodide) {
            throw new Error('Pyodide script not loaded. Please refresh the page.');
        }

        console.log('[Pyodide] Calling window.loadPyodide...');
        const startTime = Date.now();

        // Add timeout wrapper to prevent infinite hanging (120 seconds for slow connections)
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Pyodide initialization timed out after 120 seconds. Please check your internet connection.')), 120000);
        });

        pyodide = await Promise.race([
            window.loadPyodide({
                indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.28.2/full/',
                stdout: console.log,
                stderr: console.error
            }),
            timeoutPromise
        ]);

        const loadTime = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`[Pyodide] Runtime initialized successfully in ${loadTime}s`);

        // Load common packages
        console.log('[Pyodide] Loading numpy, pandas, matplotlib...');
        updatePyodideStatus('loading', 'Loading Python packages...');
        const pkgStart = Date.now();

        await pyodide.loadPackage(['numpy', 'pandas', 'matplotlib']);

        const pkgTime = ((Date.now() - pkgStart) / 1000).toFixed(2);
        console.log(`[Pyodide] Packages loaded in ${pkgTime}s`);

        // Set up Python environment
        console.log('[Pyodide] Setting up Python environment...');
        updatePyodideStatus('loading', 'Setting up Python environment...');
        await pyodide.runPythonAsync(`
import sys
import io
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('AGG')
import matplotlib.pyplot as plt

# Helper function for matplotlib plots
def _get_plot_as_base64():
    import base64
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=100, bbox_inches='tight')
    buf.seek(0)
    img_base64 = base64.b64encode(buf.read()).decode('utf-8')
    plt.close('all')
    return img_base64
        `);

        pyodideReady = true;
        pyodideLoading = false;
        updatePyodideStatus('ready', 'Python ready');
        console.log('[Pyodide] Ready to execute Python code');
        console.log('[Pyodide] Available packages: numpy, pandas, matplotlib');
        return pyodide;
    } catch (error) {
        console.error('[Pyodide] Load failed:', error);
        pyodideLoading = false;
        updatePyodideStatus('error', 'Failed to load Python: ' + error.message);
        throw error;
    }
}

function updatePyodideStatus(state, message) {
    const statusEl = document.getElementById('pyodideStatus');
    if (!statusEl) return;

    statusEl.className = 'pyodide-status ' + state;
    if (state === 'loading') {
        statusEl.innerHTML = `<span class="spinner-small"></span> ${message}`;
    } else {
        statusEl.textContent = message;
    }
}

// Run Python code (for editor UI)
async function runCode() {
    const code = document.getElementById('codeContent').value;
    const outputEl = document.getElementById('codeOutput');
    const runBtn = document.getElementById('runCodeBtn');

    if (!code.trim()) {
        outputEl.innerHTML = '<span class="error">No code to run</span>';
        return;
    }

    runBtn.disabled = true;
    runBtn.textContent = '⏳ Running...';
    outputEl.innerHTML = '<span style="color: var(--text-muted);">Running...</span>';

    try {
        const py = await initPyodide();
        const result = await executePythonCode(py, code);
        outputEl.innerHTML = result;
    } catch (error) {
        outputEl.innerHTML = `<pre class="error">${escapeHtml(error.toString())}</pre>`;
    } finally {
        runBtn.disabled = false;
        runBtn.textContent = '▶ Run';
    }
}

async function executePythonCode(py, code) {
    let output = '';

    // Capture stdout
    await py.runPythonAsync(`
import sys
from io import StringIO
_stdout_capture = StringIO()
_stderr_capture = StringIO()
sys.stdout = _stdout_capture
sys.stderr = _stderr_capture
    `);

    try {
        // Run the user's code
        const result = await py.runPythonAsync(code);

        // Get captured output
        const stdout = await py.runPythonAsync('_stdout_capture.getvalue()');
        const stderr = await py.runPythonAsync('_stderr_capture.getvalue()');

        // Check for matplotlib figures
        let hasFigure = false;
        try {
            hasFigure = await py.runPythonAsync(`len(plt.get_fignums()) > 0`);
        } catch (e) {
            // matplotlib not available or error, skip figure checking
        }

        // Show stdout
        if (stdout) {
            output += `<pre>${escapeHtml(stdout)}</pre>`;
        }

        // Show stderr
        if (stderr) {
            output += `<pre class="stderr">${escapeHtml(stderr)}</pre>`;
        }

        // Show matplotlib plots
        if (hasFigure) {
            const imgBase64 = await py.runPythonAsync('_get_plot_as_base64()');
            output += `<img src="data:image/png;base64,${imgBase64}" alt="Plot">`;
        }

        // Check if last line result is a DataFrame
        if (result && !hasFigure) {
            try {
                const isDataFrame = await py.runPythonAsync(`
import pandas as pd
isinstance(${code.trim().split('\n').pop()}, pd.DataFrame) if '${code.trim().split('\n').pop()}' else False
                `).catch(() => false);

                if (isDataFrame) {
                    const html = await py.runPythonAsync(`${code.trim().split('\n').pop()}.to_html(max_rows=20)`);
                    output += html;
                }
            } catch (e) {
                // Not a DataFrame or error
            }
        }

        // Show return value only if:
        // - There's a result
        // - No matplotlib figure was created
        // - No other output was generated
        // - Result is not a matplotlib object
        if (result !== undefined && result !== null && !output && !hasFigure) {
            const resultStr = result.toString();
            // Don't show matplotlib objects
            if (resultStr &&
                resultStr !== 'undefined' &&
                !resultStr.includes('matplotlib') &&
                !resultStr.includes('<') &&
                !resultStr.includes('object at 0x')) {
                output += `<pre>${escapeHtml(resultStr)}</pre>`;
            }
        }

        if (!output) {
            output = '<span style="color: var(--text-muted);">Code executed successfully (no output)</span>';
        }

    } catch (error) {
        output = `<pre class="error">${escapeHtml(error.toString())}</pre>`;
    } finally {
        // Reset stdout/stderr
        await py.runPythonAsync(`
sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__
        `);
    }

    return output;
}
