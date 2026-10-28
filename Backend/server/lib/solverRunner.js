const { spawn } = require('child_process');
const path = require('path');

const PY = process.env.PYTHON_BIN || 'python3';
const SOLVER_DIR = path.join(__dirname, '..', '..', 'solver');
const TOOLS_DIR = path.join(__dirname, '..', '..', 'tools');

// Run a Python script: JSON via stdin, JSON result on stdout, "PROGRESS {json}" lines on stderr.
function runPython(script, cwd, input, { onProgress, timeoutMs = 300000 } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(PY, [script], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '', buf = '';
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('Solver timed out')); }, timeoutMs);
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (line.startsWith('PROGRESS ')) { try { onProgress && onProgress(JSON.parse(line.slice(9))); } catch (_) {} }
        else err = (err + line + '\n').slice(-3000);
      }
    });
    p.on('error', (e) => { clearTimeout(timer); reject(new Error('Cannot start Python: ' + e.message)); });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`${path.basename(script)} exited with ${code}: ${err}`));
      try { resolve(JSON.parse(out)); } catch (e) { reject(new Error('Bad solver output: ' + out.slice(0, 200))); }
    });
    p.stdin.on('error', () => {});
    p.stdin.end(JSON.stringify(input));
  });
}

const solveCpsat = (input, opt) => runPython('solve.py', SOLVER_DIR, input, opt);
const solveBaseline = (input, opt) => runPython('baseline.py', SOLVER_DIR, input, opt);

// the checker script is invoked with --stdin
function runChecker(data, assignments) {
  return new Promise((resolve, reject) => {
    const p = spawn(PY, [path.join(TOOLS_DIR, 'check_solution.py'), '--stdin'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => reject(e));
    p.on('close', (c) => { if (c !== 0) return reject(new Error('checker failed: ' + err.slice(-500))); try { resolve(JSON.parse(out)); } catch (e) { reject(e); } });
    p.stdin.on('error', () => {});
    p.stdin.end(JSON.stringify({ data, assignments }));
  });
}

function pythonInfo() {
  return new Promise((resolve) => {
    const p = spawn(PY, ['-c', 'import ortools,sys;print(sys.version.split()[0], ortools.__version__)']);
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('error', () => resolve(null));
    p.on('close', (c) => resolve(c === 0 ? out.trim() : null));
  });
}

module.exports = { solveCpsat, solveBaseline, runChecker, pythonInfo };
