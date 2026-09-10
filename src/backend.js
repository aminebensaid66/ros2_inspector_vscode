'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');

const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_MAX_OUTPUT_BYTES = 20 * 1024 * 1024;

class InspectorError extends Error {
  constructor(message, { code = undefined, stdout = '', stderr = '', exitCode = undefined, cause = undefined } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'InspectorError';
    this.code = code;
    this.exitCode = exitCode;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

function parseVersion(text) {
  const match = String(text).match(/(?:ros2inspector\s+v?)?(\d+)\.(\d+)\.(\d+)(?:[-+][\w.-]+)?/i);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), raw: `${match[1]}.${match[2]}.${match[3]}` };
}

function versionAtLeast(actual, minimum) {
  const a = typeof actual === 'string' ? parseVersion(actual) : actual;
  const m = typeof minimum === 'string' ? parseVersion(minimum) : minimum;
  if (!a || !m) return false;
  return a.major > m.major ||
    (a.major === m.major && (a.minor > m.minor ||
      (a.minor === m.minor && a.patch >= m.patch)));
}

function runProcess(command, args, options = {}) {
  const spawnImpl = options.spawnImpl || spawn;
  const timeoutMs = Math.max(1, Number(options.timeoutMs ?? DEFAULT_TIMEOUT_MS));
  const maxOutputBytes = Math.max(1024, Number(options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES));
  const signal = options.signal;
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let outputBytes = 0;
    let settled = false;
    let child;

    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
      reject(error);
    };
    const terminate = () => {
      try { child?.kill?.(); } catch { /* process may already be gone */ }
    };
    const onAbort = () => {
      terminate();
      finishReject(new InspectorError('ROS2 Inspector analysis cancelled.', { code: 'cancelled', stdout, stderr }));
    };

    if (signal?.aborted) {
      reject(new InspectorError('ROS2 Inspector analysis cancelled.', { code: 'cancelled' }));
      return;
    }

    try {
      child = spawnImpl(command, args, {
        cwd: options.cwd,
        env: options.env || process.env,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (error) {
      reject(new InspectorError(`Unable to start ${command}: ${error.message}`, { code: 'spawn_failed', cause: error }));
      return;
    }

    const timer = setTimeout(() => {
      terminate();
      finishReject(new InspectorError(`ROS2 Inspector timed out after ${timeoutMs} ms.`, { code: 'timeout', stdout, stderr }));
    }, timeoutMs);
    signal?.addEventListener?.('abort', onAbort, { once: true });

    const capture = (stream, chunk) => {
      if (settled) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      outputBytes += buffer.byteLength;
      if (outputBytes > maxOutputBytes) {
        terminate();
        finishReject(new InspectorError(`ROS2 Inspector exceeded the ${maxOutputBytes} byte output limit.`, { code: 'output_limit', stdout, stderr }));
        return;
      }
      if (stream === 'stdout') stdout += buffer.toString(); else stderr += buffer.toString();
    };
    child.stdout?.on('data', chunk => capture('stdout', chunk));
    child.stderr?.on('data', chunk => capture('stderr', chunk));
    child.on('error', error => finishReject(new InspectorError(`Unable to run ${command}: ${error.message}`, { code: 'spawn_failed', stdout, stderr, cause: error })));
    child.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
      resolve({ code: Number(code ?? 1), stdout, stderr });
    });
  });
}

function parseJsonResult(result, label) {
  try { return JSON.parse(result.stdout); }
  catch (error) { throw new InspectorError(`ROS2 Inspector returned invalid ${label} JSON: ${error.message}`, { ...result, exitCode: result.code, code: 'invalid_json' }); }
}

function logCommand(logger, executable, args) {
  logger?.(`$ ${executable} ${args.map(arg => /\s/.test(arg) ? JSON.stringify(arg) : arg).join(' ')}`);
}

class InspectorBackend {
  constructor({
    executable = 'ros2inspector', minimumVersion = '0.1.3', runner = runProcess,
    logger = undefined, timeoutMs = DEFAULT_TIMEOUT_MS, maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES
  } = {}) {
    this.executable = executable;
    this.minimumVersion = minimumVersion;
    this.runner = runner;
    this.logger = logger;
    this.timeoutMs = timeoutMs;
    this.maxOutputBytes = maxOutputBytes;
    this._version = null;
    this._versionKey = '';
  }

  _run(args, { cwd, signal } = {}) {
    logCommand(this.logger, this.executable, args);
    return this.runner(this.executable, args, { cwd, signal, timeoutMs: this.timeoutMs, maxOutputBytes: this.maxOutputBytes });
  }

  invalidateVersionCache() { this._version = null; this._versionKey = ''; }

  async checkVersion({ signal, force = false } = {}) {
    const key = `${this.executable}|${this.minimumVersion}`;
    if (!force && this._version && this._versionKey === key) return this._version;
    const result = await this._run(['--version'], { signal });
    if (result.code !== 0) throw new InspectorError('ROS2 Inspector CLI is not available.', { ...result, exitCode: result.code, code: 'unavailable' });
    const version = parseVersion(`${result.stdout}\n${result.stderr}`);
    if (!version) throw new InspectorError('Could not determine ROS2 Inspector CLI version.', { ...result, exitCode: result.code, code: 'invalid_version' });
    if (!versionAtLeast(version, this.minimumVersion)) {
      throw new InspectorError(`ROS2 Inspector ${this.minimumVersion}+ is required; found ${version.raw}.`, { ...result, exitCode: result.code, code: 'outdated' });
    }
    this._version = version; this._versionKey = key;
    return version;
  }

  async inspect(workspacePath, { signal, skipVersionCheck = false } = {}) {
    if (!skipVersionCheck) await this.checkVersion({ signal });
    const root = path.resolve(workspacePath);
    const args = ['--quiet', 'graph', 'full', '--format', 'json', '-C', root];
    const result = await this._run(args, { cwd: root, signal });
    if (result.code !== 0) throw new InspectorError('ROS2 Inspector analysis failed.', { ...result, exitCode: result.code, code: 'analysis_failed' });
    return parseJsonResult(result, 'architecture');
  }

  async nodesWithConnections(workspacePath, { signal, skipVersionCheck = false } = {}) {
    if (!skipVersionCheck) await this.checkVersion({ signal });
    const root = path.resolve(workspacePath);
    const args = ['--quiet', 'nodes', '--format', 'json', '--show-connections', '-C', root];
    const result = await this._run(args, { cwd: root, signal });
    if (result.code !== 0) throw new InspectorError('ROS2 Inspector node connection analysis failed.', { ...result, exitCode: result.code, code: 'analysis_failed' });
    const json = parseJsonResult(result, 'node connection');
    if (!Array.isArray(json)) throw new InspectorError('ROS2 Inspector node connection JSON must be an array.', { ...result, exitCode: result.code, code: 'invalid_json' });
    return json;
  }

  async inspectBundle(workspacePath, { signal } = {}) {
    const version = await this.checkVersion({ signal });
    const started = Date.now();
    const [architecture, nodeConnections] = await Promise.all([
      this.inspect(workspacePath, { signal, skipVersionCheck: true }),
      this.nodesWithConnections(workspacePath, { signal, skipVersionCheck: true })
    ]);
    return { architecture, nodeConnections, version, durationMs: Date.now() - started };
  }

  async audit(workspacePath, { failOn = 'error', strict = false, signal } = {}) {
    await this.checkVersion({ signal });
    const root = path.resolve(workspacePath);
    const args = ['--quiet', 'audit', root, '--format', 'json', '--fail-on', failOn];
    if (strict) args.push('--strict');
    const result = await this._run(args, { cwd: root, signal });
    if (![0, 1].includes(result.code)) throw new InspectorError('ROS2 Inspector audit failed.', { ...result, exitCode: result.code, code: 'audit_failed' });
    const json = parseJsonResult(result, 'audit');
    return { exitCode: result.code, stderr: result.stderr, ...json };
  }

  async validate(workspacePath, policyPath, failOn = 'error', { signal } = {}) {
    await this.checkVersion({ signal });
    const root = path.resolve(workspacePath);
    const policy = path.resolve(policyPath);
    const args = ['--quiet', 'validate', root, '--policy', policy, '--format', 'json', '--fail-on', failOn];
    const result = await this._run(args, { cwd: root, signal });
    // validate intentionally returns 1 when policy violations meet --fail-on.
    if (![0, 1].includes(result.code)) throw new InspectorError('ROS2 Inspector policy validation failed.', { ...result, exitCode: result.code, code: 'validation_failed' });
    const json = parseJsonResult(result, 'policy');
    return { exitCode: result.code, stderr: result.stderr, ...json };
  }
}

module.exports = {
  InspectorBackend, InspectorError, parseVersion, versionAtLeast, runProcess,
  DEFAULT_TIMEOUT_MS, DEFAULT_MAX_OUTPUT_BYTES, parseJsonResult
};
