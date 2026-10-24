/**
 * dsh-quick-restart — host half.
 *
 * Registers a tiny loopback-only HTTP API used by the client half:
 *
 *   GET  /dsh-quick-restart/api/status   -> capability + last result
 *   POST /dsh-quick-restart/api/restart  -> spawn the detached helper, 202
 *
 * The actual restart lives in restart-helper.cjs: the host process cannot
 * call Electron's app.relaunch(), so a helper (child of the host, detached)
 * stops the Electron main process, waits for this host to exit, and starts
 * the desktop executable again. See README.md for the trade-offs.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const name = 'dsh-quick-restart';
export const inject = ['webServer'];

const PLUGIN_VERSION = '1.0.4';
const API_PREFIX = '/dsh-quick-restart/api';

const helperPath = fileURLToPath(new URL('./restart-helper.cjs', import.meta.url));
const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const stateDir = path.join(dshHome, 'dsh-quick-restart');
const logPath = path.join(stateDir, 'restart.log');
const resultPath = path.join(stateDir, 'last-result.json');

const isDesktop = Boolean(process.versions && process.versions.electron);
const appExe = process.execPath;
const mainPid = process.ppid;

/** In-memory guard so two clicks cannot start two helpers. */
let activeAttempt = null;

function pidAlive(pid) {
  if (!(pid > 0)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return Boolean(error && error.code === 'EPERM');
  }
}

function readLastResult() {
  try {
    const raw = fs.readFileSync(resultPath, 'utf8');
    if (raw.length > 64 * 1024) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function capability() {
  if (!isDesktop) {
    return {
      code: 'notDesktop',
      message: 'dsh web mode: the DSH process is not hosted by the desktop app.',
    };
  }
  if (process.env.DSH_DESKTOP_DEV_APP === '1') {
    return {
      code: 'devMode',
      message:
        'The desktop app is running from a development launch; restart the dev command instead.',
    };
  }
  if (!appExe || !fs.existsSync(appExe)) {
    return {
      code: 'noAppExe',
      message: `Desktop executable not found: ${appExe}`,
      params: { path: appExe },
    };
  }
  if (!fs.existsSync(helperPath)) {
    return { code: 'noHelper', message: 'restart-helper.cjs is missing.' };
  }
  if (!(mainPid > 0)) {
    return {
      code: 'noElectron',
      message: 'Could not resolve the Electron main process (ppid).',
    };
  }
  return { ok: true };
}

function reconcileActiveAttempt() {
  if (!activeAttempt) return;
  const last = readLastResult();
  if (
    last &&
    last.attemptId === activeAttempt.id &&
    (last.phase === 'failed' || last.phase === 'relaunched')
  ) {
    activeAttempt = null;
    return;
  }
  if (Date.now() - activeAttempt.at > 90_000) activeAttempt = null;
  if (
    activeAttempt &&
    activeAttempt.helperPid &&
    !pidAlive(activeAttempt.helperPid)
  ) {
    // The helper died before it could write a terminal result (for example a
    // spawn failure or a hard kill). Do not block retries for 90 seconds.
    activeAttempt = null;
  }
}

function statusBody() {
  reconcileActiveAttempt();
  const cap = capability();
  return {
    ok: true,
    plugin: name,
    version: PLUGIN_VERSION,
    desktop: isDesktop,
    canRestart: cap.ok === true,
    reasonCode: cap.ok ? null : cap.code,
    reason: cap.ok ? null : cap.message,
    reasonParams: cap.params || null,
    platform: process.platform,
    arch: process.arch,
    pid: process.pid,
    ppid: mainPid,
    appExe,
    logPath,
    resultPath,
    activeAttempt: activeAttempt
      ? { id: activeAttempt.id, at: activeAttempt.at }
      : null,
    lastResult: readLastResult(),
  };
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(text);
}

/**
 * Defense in depth on top of ctx.connection.requestRejection:
 * loopback/trusted Host, same origin, and browser metadata.
 */
function rejectionFor(ctx, req) {
  let connection = null;
  try {
    if (typeof ctx.get === 'function') connection = ctx.get('connection');
  } catch {
    connection = null;
  }
  if (!connection) {
    try {
      connection = ctx.connection || null;
    } catch {
      connection = null;
    }
  }
  if (connection && typeof connection.requestRejection === 'function') {
    try {
      const rejection = connection.requestRejection(req);
      if (rejection === 401 || rejection === 403) return rejection;
    } catch {
      // Keep going with the local checks below.
    }
  }

  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return 403;

  const origin = req.headers.origin;
  if (origin) {
    const host = req.headers.host;
    if (!host) return 403;
    const allowed = [`http://${host}`, `https://${host}`];
    if (!allowed.includes(origin)) return 403;
  }

  return 0;
}

function readJsonBody(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('body too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(Object.assign(new Error('invalid JSON'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function startHelper(attemptId) {
  fs.mkdirSync(stateDir, { recursive: true });
  // Start each attempt with a clean log; the helper appends its stages.
  try {
    fs.writeFileSync(logPath, '');
  } catch {
    // A failed truncate must not block the restart.
  }

  const args = [
    helperPath,
    '--attempt-id', attemptId,
    '--main-pid', String(mainPid),
    '--host-pid', String(process.pid),
    '--app-exe', appExe,
    '--log', logPath,
    '--result', resultPath,
    '--delay', '1200',
  ];

  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    cwd: stateDir,
    env: { ...process.env, DSH_QUICK_RESTART_ATTEMPT: attemptId },
  });
  child.unref();
  return child;
}

async function handleRequest(ctx, req, res) {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const route = url.pathname.slice(API_PREFIX.length) || '/';

  const rejection = rejectionFor(ctx, req);
  if (rejection) {
    sendJson(res, rejection, {
      ok: false,
      code: rejection === 401 ? 'unauthorized' : 'forbidden',
      status: rejection,
    });
    return;
  }

  if (route === '/status' && (req.method === 'GET' || req.method === 'HEAD')) {
    sendJson(res, 200, statusBody());
    return;
  }

  if (route === '/restart' && req.method === 'POST') {
    const contentType = String(req.headers['content-type'] || '');
    if (!contentType.toLowerCase().includes('application/json')) {
      sendJson(res, 415, { ok: false, code: 'unsupported-media-type' });
      return;
    }

    let body;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      sendJson(res, error.statusCode || 400, {
        ok: false,
        code: 'invalid-body',
        error: String(error.message || error),
      });
      return;
    }

    if (body.confirm !== true) {
      sendJson(res, 400, { ok: false, code: 'confirmation-required' });
      return;
    }

    const cap = capability();
    if (!cap.ok) {
      sendJson(res, 409, {
        ok: false,
        code: cap.code,
        reason: cap.message,
        params: cap.params || null,
      });
      return;
    }

    reconcileActiveAttempt();
    if (activeAttempt && Date.now() - activeAttempt.at < 90_000) {
      sendJson(res, 409, {
        ok: false,
        code: 'inProgress',
        attemptId: activeAttempt.id,
      });
      return;
    }

    const attemptId = `${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    // Write a "running" marker before spawning, so a client that survives the
    // first moments can tell that a helper exists even if the spawn stalls.
    try {
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(
        resultPath,
        JSON.stringify(
          {
            attemptId,
            phase: 'running',
            stage: 'requested',
            at: Date.now(),
            mainPid,
            hostPid: process.pid,
            appExe,
          },
          null,
          2,
        ),
      );
    } catch {
      // Non-fatal: helper rewrites the file.
    }

    let child;
    try {
      child = startHelper(attemptId);
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        code: 'helper-spawn-failed',
        error: String(error && error.message ? error.message : error),
      });
      return;
    }

    if (!child || !child.pid) {
      sendJson(res, 500, { ok: false, code: 'helper-spawn-failed' });
      return;
    }

    activeAttempt = { id: attemptId, at: Date.now(), helperPid: child.pid };
    sendJson(res, 202, {
      ok: true,
      attemptId,
      startedAt: activeAttempt.at,
      helperPid: child.pid,
    });
    return;
  }

  sendJson(res, 404, { ok: false, code: 'not-found' });
}

export function apply(ctx) {
  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'prefix',
      path: API_PREFIX,
      handler: (req, res) =>
        handleRequest(ctx, req, res).catch((error) => {
          try {
            sendJson(res, 500, {
              ok: false,
              code: 'internal',
              error: String(error && error.message ? error.message : error),
            });
          } catch {
            // The response may already be gone.
          }
        }),
    }),
  );
}
