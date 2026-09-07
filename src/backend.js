'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');

class InspectorError extends Error {
  constructor(message, { code = undefined, stdout = '', stderr = '' } = {}) {
    super(message);
    this.name = 'InspectorError';
    this.code = code;
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
  const timeoutMs = options.timeoutMs ?? 120000;
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let child;
    try {
      child = spawnImpl(command, args, {
        cwd: options.cwd,
        env: options.env || process.env,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (error) {
      reject(new InspectorError(`Unable to start ${command}: ${error.message}`));
      return;
    }

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (child && typeof child.kill === 'function') child.kill();
      reject(new InspectorError(`ROS2 Inspector timed out after ${timeoutMs} ms`, { stdout, stderr }));
    }, timeoutMs);

    if (child.stdout) child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    if (child.stderr) child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new InspectorError(`Unable to run ${command}: ${error.message}`, { stdout, stderr }));
    });
    child.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: Number(code ?? 1), stdout, stderr });
    });
  });
}

class InspectorBackend {
  constructor({ executable = 'ros2inspector', minimumVersion = '0.1.3', runner = runProcess, logger = undefined } = {}) {
    this.executable = executable;
    this.minimumVersion = minimumVersion;
    this.runner = runner;
    this.logger = logger;
  }

  async checkVersion() {
    const result = await this.runner(this.executable, ['--version']);
    if (result.code !== 0) throw new InspectorError('ROS2 Inspector CLI is not available.', result);
    const version = parseVersion(`${result.stdout}\n${result.stderr}`);
    if (!version) throw new InspectorError('Could not determine ROS2 Inspector CLI version.', result);
    if (!versionAtLeast(version, this.minimumVersion)) {
      throw new InspectorError(`ROS2 Inspector ${this.minimumVersion}+ is required; found ${version.raw}.`, result);
    }
    return version;
  }

  async inspect(workspacePath) {
    const args = ['--quiet', 'graph', 'full', '--format', 'json', '-C', path.resolve(workspacePath)];
    this.logger?.(`$ ${this.executable} ${args.join(' ')}`);
    const result = await this.runner(this.executable, args, { cwd: workspacePath });
    if (result.code !== 0) throw new InspectorError('ROS2 Inspector analysis failed.', result);
    try {
      return JSON.parse(result.stdout);
    } catch (error) {
      throw new InspectorError(`ROS2 Inspector returned invalid JSON: ${error.message}`, result);
    }
  }

  async validate(workspacePath, policyPath, failOn = 'error') {
    const args = [
      '--quiet', 'validate', path.resolve(workspacePath),
      '--policy', path.resolve(policyPath), '--format', 'json', '--fail-on', failOn
    ];
    this.logger?.(`$ ${this.executable} ${args.join(' ')}`);
    const result = await this.runner(this.executable, args, { cwd: workspacePath });
    // validate intentionally returns 1 when policy violations meet --fail-on.
    if (![0, 1].includes(result.code)) throw new InspectorError('ROS2 Inspector policy validation failed.', result);
    try {
      return { exitCode: result.code, ...JSON.parse(result.stdout) };
    } catch (error) {
      throw new InspectorError(`ROS2 Inspector returned invalid policy JSON: ${error.message}`, result);
    }
  }
}

module.exports = { InspectorBackend, InspectorError, parseVersion, versionAtLeast, runProcess };
