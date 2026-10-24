#!/usr/bin/env node
/**
 * dsh-quick-restart helper (CommonJS on purpose: it is spawned with the
 * desktop executable in Electron's Node mode, where require() is available).
 *
 * Why a helper: the host process is a child of the Electron main process and
 * has no API to relaunch it (app.relaunch lives in main, and DSH exposes no
 * restart IPC). The helper is detached from the host, so it survives the
 * shutdown it performs:
 *
 *   1. taskkill the Electron main process (WITHOUT /T: our helper must live)
 *   2. wait for main to disappear
 *   3. wait for the host to exit on its own (it shuts down on IPC disconnect)
 *   4. start the desktop executable again (ELECTRON_RUN_AS_NODE removed)
 *
 * Result + stage are written to last-result.json so the next launch can tell
 * the user what happened.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const argv = {};
for (let i = 2; i < process.argv.length; i += 1) {
  const current = process.argv[i];
  if (!current.startsWith('--')) continue;
  const eq = current.indexOf('=');
  if (eq > 0) {
    argv[current.slice(2, eq)] = current.slice(eq + 1);
  } else {
    argv[current.slice(2)] = process.argv[i + 1];
    i += 1;
  }
}

const attemptId = argv['attempt-id'] || `manual-${Date.now().toString(36)}`;
const mainPid = Number(argv['main-pid'] || 0);
const hostPid = Number(argv['host-pid'] || 0);
const appExe = argv['app-exe'] || process.execPath;
const logPath = argv.log || '';
const resultPath = argv.result || '';
const delayMs = Number(argv.delay || 1200);
const dryRun = argv['dry-run'] === 'true' || argv['dry-run'] === '1';

function log(line) {
  const stamp = new Date().toISOString();
  const text = `[${stamp}] ${line}\n`;
  try {
    if (logPath) fs.appendFileSync(logPath, text, 'utf8');
  } catch {
    // Nothing sensible to do if the log itself is unwritable.
  }
}

function baseResult() {
  return {
    attemptId,
    mainPid,
    hostPid,
    appExe,
    platform: process.platform,
    helperPid: process.pid,
  };
}

function writeResult(phase, extra) {
  if (!resultPath) return;
  const body = {
    ...baseResult(),
    phase,
    at: Date.now(),
    ...(extra || {}),
  };
  try {
    fs.mkdirSync(path.dirname(resultPath), { recursive: true });
    fs.writeFileSync(resultPath, JSON.stringify(body, null, 2), 'utf8');
  } catch (error) {
    log(`writeResult(${phase}) failed: ${error && error.message}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAlive(pid) {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means "exists but not ours"; treat it as alive.
    return Boolean(error && error.code === 'EPERM');
  }
}

async function waitGone(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true;
    await sleep(150);
  }
  return !isAlive(pid);
}

function killProcess(pid, label) {
  if (process.platform === 'win32') {
    const result = spawnSync('taskkill', ['/PID', String(pid), '/F'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    if (result.status === 0) {
      log(`taskkill ${label} pid=${pid}: ok`);
      return { ok: true };
    }
    const errorText = [result.stdout, result.stderr, result.error && result.error.message]
      .filter(Boolean)
      .join(' ')
      .trim();
    log(`taskkill ${label} pid=${pid}: failed status=${result.status} ${errorText}`);
    return { ok: false, error: errorText || `taskkill exited ${result.status}` };
  }

  try {
    process.kill(pid, 'SIGKILL');
    log(`SIGKILL ${label} pid=${pid}: ok`);
    return { ok: true };
  } catch (error) {
    log(`SIGKILL ${label} pid=${pid}: failed ${error && error.message}`);
    return { ok: false, error: String(error && error.message) };
  }
}

function relaunchEnv() {
  const env = { ...process.env };
  // The host runs with ELECTRON_RUN_AS_NODE=1; inheriting it would start the
  // new "app" as plain Node and it would exit immediately.
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_NO_ATTACH_CONSOLE;
  // Desktop-only values computed by the old main process.
  delete env.DSH_PROFILE;
  delete env.DSH_PROFILE_DIR;
  delete env.DSH_WEB_URL;
  delete env.DSH_QUICK_RESTART_ATTEMPT;
  return env;
}

async function main() {
  log(`helper start attempt=${attemptId} pid=${process.pid} ppid=${process.ppid}`);
  log(`targets main=${mainPid} host=${hostPid} app=${appExe} delay=${delayMs}ms dryRun=${dryRun}`);
  writeResult('running', { stage: 'helper-started' });

  if (!mainPid || mainPid <= 0) {
    writeResult('failed', { stage: 'validate', reason: 'missing --main-pid' });
    log('missing --main-pid; aborting');
    process.exit(1);
  }

  if (mainPid === process.pid) {
    writeResult('failed', { stage: 'validate', reason: 'refusing to terminate the helper itself' });
    log('main pid equals helper pid; aborting');
    process.exit(1);
  }

  if (dryRun) {
    const preview = {
      stage: 'dry-run',
      wouldKillMain: mainPid,
      wouldWaitForHost: hostPid || null,
      wouldRelaunch: appExe,
    };
    log(`dry run: ${JSON.stringify(preview)}`);
    writeResult('dry-run', preview);
    process.exit(0);
  }

  await sleep(delayMs);

  // 1. Stop Electron main. No /T: killing the tree would kill this helper too.
  log(`stopping main pid=${mainPid}`);
  const killedMain = killProcess(mainPid, 'main');
  if (!killedMain.ok && isAlive(mainPid)) {
    writeResult('failed', {
      stage: 'stop-main',
      reason: killedMain.error || 'taskkill failed',
    });
    process.exit(1);
  }

  if (!(await waitGone(mainPid, 25_000))) {
    writeResult('failed', { stage: 'wait-main', reason: 'main process still alive after 25s' });
    log('main still alive after 25s; aborting');
    process.exit(1);
  }
  log('main is gone; waiting for host exit');

  // 2. The host normally exits when its IPC to main disconnects. Give it time,
  //    then stop it explicitly so the profile/port are free for the relaunch.
  if (hostPid > 0 && isAlive(hostPid)) {
    if (!(await waitGone(hostPid, 13_000))) {
      log('host still alive; stopping it explicitly');
      killProcess(hostPid, 'host');
      if (!(await waitGone(hostPid, 5_000))) {
        writeResult('failed', { stage: 'wait-host', reason: 'host process still alive' });
        process.exit(1);
      }
    }
  }
  log('host is gone');

  await sleep(800);

  // 3. Relaunch the desktop app as a normal GUI process.
  log(`relaunching ${appExe}`);
  let child;
  try {
    child = spawn(appExe, [], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
      cwd: path.dirname(appExe),
      env: relaunchEnv(),
    });
  } catch (error) {
    writeResult('failed', {
      stage: 'relaunch',
      reason: String(error && error.message ? error.message : error),
    });
    log(`relaunch threw: ${error && error.message}`);
    process.exit(1);
  }

  if (!child || !child.pid) {
    writeResult('failed', { stage: 'relaunch', reason: 'spawn returned no pid' });
    log('relaunch returned no pid');
    process.exit(1);
  }

  child.unref();
  await sleep(1800);
  if (!isAlive(child.pid)) {
    writeResult('failed', {
      stage: 'relaunch-exited',
      reason: 'the desktop process exited immediately after launch',
      newPid: child.pid,
    });
    log(`relaunch pid=${child.pid} exited immediately`);
    process.exit(1);
  }
  writeResult('relaunched', { stage: 'done', newPid: child.pid });
  log(`relaunched ok newPid=${child.pid}`);
  process.exit(0);
}

const watchdog = setTimeout(() => {
  writeResult('failed', { stage: 'watchdog', reason: 'helper timed out after 70s' });
  log('watchdog: timed out after 70s');
  process.exit(1);
}, 70_000);
watchdog.unref();

main().catch((error) => {
  writeResult('failed', {
    stage: 'exception',
    reason: String(error && error.stack ? error.stack : error),
  });
  log(`unhandled: ${error && error.stack}`);
  process.exit(1);
});
