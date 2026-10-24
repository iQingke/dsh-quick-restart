/**
 * dsh-quick-restart — client half.
 *
 * 1. shell.overlay: confirmation dialog, progress overlay, result toasts.
 * 2. Account-menu enhancement: the account menu has no item-level slot
 *    (settings.launcher is a single, owned seat), so this module augments the
 *    open menu at runtime: it clones the "Settings" item, rewrites it as
 *    "Restart" and inserts it right after "Feedback", before "Sign out". The
 *    clone keeps the host markup/classes, so hover, focus, disabled and
 *    keyboard navigation match the other items. See README.md for this trade-off.
 */
window.__ModuleLoader__.load({
  id: '@grapt/dsh-quick-restart',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const API = '/dsh-quick-restart/api';
    const NS = 'dsh-quick-restart';
    const ITEM_ATTR = 'data-dsh-quick-restart-item';
    const BUTTON_ATTR = 'data-dsh-quick-restart-button';
    const PENDING_KEY = 'dsh-quick-restart:pending';
    const NOTIFIED_KEY = 'dsh-quick-restart:notified';

    const SETTINGS_LABELS = ['设置', 'Settings'];
    const FEEDBACK_LABELS = ['意见反馈', 'Feedback'];

    const DICTS = {
      zh: {
        menu: { restart: '重启', restarting: '正在重启…' },
        dialog: {
          title: '重启 DeepSeek Harness？',
          body: '应用会立即关闭并自动重新启动。正在生成的内容、运行中的终端任务会中断。',
          note: '通常需要 3–10 秒；重启后当前页面会自动恢复。',
          cancel: '取消',
          confirm: '立即重启',
          runningTitle: '正在重启…',
          runningBody: '应用即将关闭，请不要手动关闭窗口。重启后本页会自动恢复。',
          close: '关闭',
          retry: '重试',
          errorTitle: '重启失败',
          unavailableTitle: '无法重启',
          logPath: '日志：',
          openLogHint: '如多次失败，请把上面的日志文件发给开发者。',
        },
        toast: {
          success: 'DeepSeek Harness 已重启（用时 {seconds} 秒）',
          failed: '上次重启未完成：{reason}',
          noPermission: '没有权限执行重启：{reason}',
          hostMissing: '重启服务未加载（Host 插件未生效）。请先完整退出并重新打开应用。',
        },
        reason: {
          notDesktop:
            '当前运行在 dsh web 模式，进程不由桌面应用托管，无法自动重启。请改用桌面版，或在终端中重启。',
          noElectron: '未检测到 Electron 主进程，无法执行桌面重启。',
          devMode: '当前是开发模式启动的桌面应用，请重启开发命令（pnpm dev / 对应启动脚本）。',
          noAppExe: '找不到桌面应用可执行文件：{path}',
          noHelper: '插件文件不完整：缺少 restart-helper.cjs。',
          inProgress: '已有一次重启正在进行，请稍候。',
          unauthorized: '连接未通过登录/来源校验（HTTP {status}）。',
          forbidden: '请求来源不被信任（HTTP {status}）。请从应用内打开页面后重试。',
          network: '无法连接重启服务，Host 可能尚未加载该插件。',
          http: '重启服务返回错误（HTTP {status}）。',
          timeout: '应用在预期时间内没有退出，重启可能被拦截。',
          failedAt: '失败阶段：{stage}。{reason}',
          unknown: '未知错误。',
        },
      },
      en: {
        menu: { restart: 'Restart', restarting: 'Restarting…' },
        dialog: {
          title: 'Restart DeepSeek Harness?',
          body: 'The app will close and start again automatically. Anything still generating and any running terminal task will be interrupted.',
          note: 'This usually takes 3–10 seconds; this page comes back automatically.',
          cancel: 'Cancel',
          confirm: 'Restart now',
          runningTitle: 'Restarting…',
          runningBody:
            'The app is about to close. Do not close the window yourself; this page will come back automatically.',
          close: 'Close',
          retry: 'Try again',
          errorTitle: 'Restart failed',
          unavailableTitle: 'Cannot restart',
          logPath: 'Log: ',
          openLogHint: 'If this keeps failing, send the log file above to the developer.',
        },
        toast: {
          success: 'DeepSeek Harness restarted in {seconds}s',
          failed: 'Last restart did not finish: {reason}',
          noPermission: 'Restart not permitted: {reason}',
          hostMissing:
            'Restart service is not loaded (host plugin inactive). Quit the app completely, reopen it, then try again.',
        },
        reason: {
          notDesktop:
            'Running in dsh web mode: the process is not hosted by the desktop app, so it cannot restart itself. Use the desktop app or restart it from a terminal.',
          noElectron: 'No Electron main process detected; desktop restart is unavailable.',
          devMode: 'The desktop app was started in development mode; restart the dev command instead.',
          noAppExe: 'Desktop executable not found: {path}',
          noHelper: 'Plugin is incomplete: restart-helper.cjs is missing.',
          inProgress: 'A restart is already in progress. Please wait.',
          unauthorized: 'The connection failed the sign-in/origin check (HTTP {status}).',
          forbidden: 'Request origin is not trusted (HTTP {status}). Open the page from the app and retry.',
          network: 'Cannot reach the restart service; the host may not have loaded this plugin.',
          http: 'Restart service returned HTTP {status}.',
          timeout: 'The app did not exit in time; the restart may have been blocked.',
          failedAt: 'Failed at stage: {stage}. {reason}',
          unknown: 'Unknown error.',
        },
      },
    };

    // The locale service stores a FLAT map of dotted keys -> strings
    // (`LocaleDict = Record<string, string>`). Nested dictionaries are
    // silently stored as-is but never resolve, which is why a nested shape
    // rendered "menu.restart" verbatim.
    function flattenDict(source, prefix = '', target = {}) {
      for (const [key, value] of Object.entries(source)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          flattenDict(value, path, target);
        } else {
          target[path] = String(value);
        }
      }
      return target;
    }

    const FLAT_DICTS = {
      zh: flattenDict(DICTS.zh),
      en: flattenDict(DICTS.en),
    };

    let ctxRef = null;
    let enhancerStarted = false;
    let enhancerTimer = null;
    let enhancerObserver = null;
    let bootTimer = null;
    let pollTimer = null;
    let verifyTimer = null;
    let dialogToken = 0;
    let toastTimer = null;

    const inserted = new Set();
    const listeners = new Set();

    const state = {
      phase: 'idle', // idle | confirm | running | error | unavailable
      status: null,
      error: '',
      stage: '',
      logPath: '',
      reason: '',
      toast: null,
    };

    // ---------------------------------------------------------------- locale
    function localeName() {
      try {
        const snapshot = ctxRef.locale.getLocale();
        const value =
          typeof snapshot === 'string' ? snapshot : snapshot && typeof snapshot.active === 'string' ? snapshot.active : '';
        if (value) return value.toLowerCase().startsWith('zh') ? 'zh' : 'en';
      } catch {
        // fall through
      }
      const nav = (typeof navigator !== 'undefined' && navigator.language) || 'en';
      return nav.toLowerCase().startsWith('zh') ? 'zh' : 'en';
    }

    function tr(key) {
      try {
        const bound = ctxRef && ctxRef.locale ? ctxRef.locale.bind(NS) : null;
        const value = bound && bound(key);
        // A missing key comes back as the key itself; treat it as a miss so the
        // embedded dictionary below still produces readable text.
        if (typeof value === 'string' && value && value !== key) return value;
      } catch {
        // fall back to the embedded dictionary
      }
      const dict = FLAT_DICTS[localeName()] || FLAT_DICTS.en;
      const value = dict[key];
      return typeof value === 'string' ? value : key;
    }

    function fmt(key, params) {
      const template = tr(key);
      if (!params) return template;
      return template.replace(/\{(\w+)\}/g, (match, name) =>
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
      );
    }

    // ----------------------------------------------------------------- store
    function notify() {
      for (const listener of listeners) {
        try {
          listener();
        } catch {
          // one broken listener must not stop the others
        }
      }
      syncInserted();
    }

    function setState(patch) {
      Object.assign(state, patch);
      notify();
    }

    function clearPoll() {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      if (verifyTimer) {
        clearTimeout(verifyTimer);
        verifyTimer = null;
      }
    }

    function resetDialog() {
      dialogToken += 1;
      clearPoll();
      setState({ phase: 'idle', error: '', stage: '', logPath: '', reason: '' });
    }

    function showToast(kind, text, duration) {
      if (toastTimer) clearTimeout(toastTimer);
      setState({ toast: { kind, text, id: Date.now() } });
      toastTimer = setTimeout(() => {
        toastTimer = null;
        setState({ toast: null });
      }, duration || 6500);
    }

    // ------------------------------------------------------------------ http
    function readJsonStorage(key) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    }

    function writeJsonStorage(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // storage may be unavailable; the flow still works
      }
    }

    function abortAfter(ms) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ms);
      return { controller, done: () => clearTimeout(timer) };
    }

    async function readResponse(res) {
      try {
        return await res.json();
      } catch {
        return {};
      }
    }

    async function fetchStatus() {
      const gate = abortAfter(8000);
      try {
        const res = await fetch(`${API}/status`, {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          signal: gate.controller.signal,
        });
        if (res.ok) {
          const data = await readResponse(res);
          return { ok: true, ...data };
        }
        const data = await readResponse(res);
        return { ok: false, http: res.status, code: data.code || '' };
      } catch (error) {
        return { ok: false, code: 'network', error: String((error && error.message) || error) };
      } finally {
        gate.done();
      }
    }

    function reasonForStatus(status) {
      if (!status || status.ok === false) {
        const http = status && status.http;
        if (http === 401) return fmt('reason.unauthorized', { status: http });
        if (http === 403) return fmt('reason.forbidden', { status: http });
        if (http) return fmt('reason.http', { status: http });
        return fmt('reason.network');
      }
      const code = status.reasonCode || '';
      const params = status.reasonParams || {};
      if (code === 'noAppExe') return fmt('reason.noAppExe', { path: params.path || status.appExe || '' });
      if (code && tr(`reason.${code}`) !== `reason.${code}`) return tr(`reason.${code}`);
      return status.reason || fmt('reason.unknown');
    }

    function reasonForServerError(httpStatus, data) {
      const code = (data && data.code) || '';
      if (code === 'notDesktop') return tr('reason.notDesktop');
      if (code === 'devMode') return tr('reason.devMode');
      if (code === 'noElectron') return tr('reason.noElectron');
      if (code === 'noHelper') return tr('reason.noHelper');
      if (code === 'inProgress') return tr('reason.inProgress');
      if (code === 'noAppExe') {
        return fmt('reason.noAppExe', {
          path: (data.params && data.params.path) || (state.status && state.status.appExe) || '',
        });
      }
      if (httpStatus === 401) return fmt('reason.unauthorized', { status: 401 });
      if (httpStatus === 403) return fmt('reason.forbidden', { status: 403 });
      if (httpStatus) return fmt('reason.http', { status: httpStatus });
      return fmt('reason.unknown');
    }

    // --------------------------------------------------------------- actions
    async function openConfirm() {
      if (state.phase === 'running') return;
      const token = ++dialogToken;
      setState({ phase: 'confirm', status: null, error: '', stage: '', logPath: '' });

      const status = await fetchStatus();
      if (token !== dialogToken || state.phase !== 'confirm') return;

      if (status.ok) {
        const logPath = status.logPath || '';
        setState({ status, logPath });
        if (!status.canRestart) {
          setState({ phase: 'unavailable', reason: reasonForStatus(status) });
        }
      } else {
        setState({ phase: 'unavailable', reason: reasonForStatus(status), logPath: '' });
      }
    }

    async function confirmRestart() {
      if (state.phase === 'running') return;
      const token = ++dialogToken;
      setState({ phase: 'running', error: '', stage: '', reason: '' });
      const startedAt = Date.now();

      const gate = abortAfter(15000);
      let res;
      let data = {};
      try {
        res = await fetch(`${API}/restart`, {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ confirm: true, source: 'account-menu' }),
          signal: gate.controller.signal,
        });
        data = await readResponse(res);
      } catch (error) {
        gate.done();
        if (token !== dialogToken) return;
        const message =
          error && error.name === 'AbortError'
            ? fmt('reason.http', { status: 'timeout' })
            : String((error && error.message) || error);
        setState({ phase: 'error', error: message });
        return;
      } finally {
        gate.done();
      }

      if (token !== dialogToken) return;

      if (!res.ok || !data.ok) {
        setState({ phase: 'error', error: reasonForServerError(res.status, data) });
        return;
      }

      writeJsonStorage(PENDING_KEY, { attemptId: data.attemptId, startedAt });
      const attemptId = data.attemptId;

      // The page is about to die. If it does not, diagnose at 20s.
      pollTimer = setInterval(async () => {
        if (state.phase !== 'running') {
          clearPoll();
          return;
        }
        const last = await fetchStatus();
        if (!last.ok) return;
        const result = last.lastResult;
        if (result && result.attemptId === attemptId && result.phase === 'failed') {
          clearPoll();
          setState({
            phase: 'error',
            stage: result.stage || '',
            logPath: last.logPath || '',
            error: fmt('reason.failedAt', {
              stage: result.stage || 'unknown',
              reason: result.reason || '',
            }),
          });
        }
      }, 2500);

      verifyTimer = setTimeout(() => {
        if (state.phase !== 'running') return;
        clearPoll();
        setState({
          phase: 'error',
          error: fmt('reason.timeout'),
          logPath: state.logPath || '',
        });
      }, 30_000);
    }

    async function checkBootResult(attempt) {
      const round = attempt || 0;
      const status = await fetchStatus();
      if (!status.ok) {
        // The host may still be registering routes right after a restart.
        if (round < 4) setTimeout(() => checkBootResult(round + 1), 1500);
        return;
      }
      state.status = status;

      const pending = readJsonStorage(PENDING_KEY);
      const result = status.lastResult;
      if (!result || !result.attemptId) return;

      // The helper writes "relaunched" ~1.8s after spawning the new app; the
      // page can be ready first. Keep polling for this attempt for ~9s.
      if (pending && pending.attemptId === result.attemptId && result.phase === 'running') {
        if (round < 6) setTimeout(() => checkBootResult(round + 1), 1500);
        return;
      }

      // Only report a result this browser session actually asked for; a
      // manual app restart must not replay an old success/failure toast.
      if (!pending || pending.attemptId !== result.attemptId) return;
      const notified = readJsonStorage(NOTIFIED_KEY);
      if (notified && notified.attemptId === result.attemptId) {
        try {
          localStorage.removeItem(PENDING_KEY);
        } catch {
          // ignore
        }
        return;
      }

      const age = Date.now() - Number(result.at || 0);
      if (result.phase === 'relaunched' && age >= 0 && age < 5 * 60_000) {
        let seconds = '—';
        if (pending && pending.attemptId === result.attemptId && pending.startedAt) {
          seconds = String(Math.max(1, Math.round((Number(result.at) - Number(pending.startedAt)) / 1000)));
        }
        writeJsonStorage(NOTIFIED_KEY, { attemptId: result.attemptId, at: Date.now() });
        try {
          localStorage.removeItem(PENDING_KEY);
        } catch {
          // ignore
        }
        showToast('success', fmt('toast.success', { seconds }), 8000);
        return;
      }

      if (result.phase === 'failed' && age >= 0 && age < 15 * 60_000) {
        writeJsonStorage(NOTIFIED_KEY, { attemptId: result.attemptId, at: Date.now() });
        try {
          localStorage.removeItem(PENDING_KEY);
        } catch {
          // ignore
        }
        showToast(
          'error',
          fmt('toast.failed', {
            reason: [result.stage, result.reason].filter(Boolean).join(': ') || fmt('reason.unknown'),
          }),
          12000,
        );
      }
    }

    // ------------------------------------------------------------ menu items
    function itemText(button) {
      return (button.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function hasAnyLabel(button, labels) {
      const text = itemText(button);
      return labels.some((label) => text.includes(label));
    }

    function findItems(menu) {
      const buttons = Array.from(menu.querySelectorAll('button[role="menuitem"]'));
      if (buttons.length < 2) return null;
      const settings = buttons.find((button) => hasAnyLabel(button, SETTINGS_LABELS));
      const feedback = buttons.find((button) => hasAnyLabel(button, FEEDBACK_LABELS));
      if (!settings || !feedback) return null;
      return { settings, feedback, buttons };
    }

    function svgIcon() {
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('width', '16');
      svg.setAttribute('height', '16');
      svg.setAttribute('viewBox', '0 0 16 16');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '1.2');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('data-dsh-quick-restart-icon', '');
      const path1 = document.createElementNS(ns, 'path');
      path1.setAttribute(
        'd',
        'M14.5001 8C14.5 9.28552 14.1188 10.5422 13.4045 11.611C12.6903 12.6799 11.6752 13.5129 10.4875 14.0049C9.29982 14.4968 7.99295 14.6255 6.73212 14.3747C5.4713 14.124 4.31314 13.505 3.4041 12.596C2.49514 11.687 1.87614 10.5288 1.62537 9.26798C1.37459 8.00716 1.50331 6.70028 1.99525 5.51261C2.48719 4.32494 3.32025 3.30981 4.3891 2.59557C5.45795 1.88134 6.71458 1.50008 8.0001 1.5C9.9001 1.5 11.7001 2.3 13.0001 3.6L14.5001 5.1',
      );
      const path2 = document.createElementNS(ns, 'path');
      path2.setAttribute('d', 'M14.4999 1.5V5.1H10.8999');
      svg.appendChild(path1);
      svg.appendChild(path2);
      return svg;
    }

    function labelElement(button) {
      const spans = Array.from(button.querySelectorAll('span')).filter(
        (span) => (span.textContent || '').trim() && !span.querySelector('svg'),
      );
      if (!spans.length) return null;
      const exact = spans.find((span) =>
        SETTINGS_LABELS.includes((span.textContent || '').trim()),
      );
      return exact || spans[spans.length - 1];
    }

    function syncItem(wrapper) {
      const button = wrapper.querySelector('button');
      if (!button) return;
      const label =
        button.querySelector('[data-dsh-quick-restart-label]') || labelElement(button);
      const busy = state.phase === 'running';
      button.disabled = busy;
      wrapper.setAttribute('aria-busy', busy ? 'true' : 'false');
      const text = busy ? tr('menu.restarting') : tr('menu.restart');
      if (label && label.textContent !== text) label.textContent = text;
      if (button.hasAttribute('aria-label')) button.setAttribute('aria-label', text);
      if (button.hasAttribute('title')) button.setAttribute('title', text);
      const svg = button.querySelector('[data-dsh-quick-restart-icon]');
      if (svg) {
        svg.style.animation = busy ? 'dshQrSpin 900ms linear infinite' : 'none';
        svg.style.transformOrigin = '50% 50%';
      }
    }

    function syncInserted() {
      for (const wrapper of Array.from(inserted)) {
        if (!wrapper.isConnected) {
          inserted.delete(wrapper);
          continue;
        }
        syncItem(wrapper);
      }
    }

    function insertRestartItem(menu, settings, feedback) {
      // Clone the Settings row for consistent styling, but place the new row
      // immediately after Feedback so the order is Settings / Feedback /
      // Restart / Sign out. Any separator the host renders before Sign out
      // stays between Restart and Sign out.
      const styleSource = settings.parentElement;
      const anchor = feedback.parentElement;
      if (!styleSource || !anchor || !anchor.parentElement) return null;

      const clone = styleSource.cloneNode(true);
      clone.setAttribute(ITEM_ATTR, '');
      clone.removeAttribute('id');
      clone.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
      clone.querySelectorAll('[class*="shortcut"]').forEach((node) => node.remove());

      const button = clone.querySelector('button');
      if (!button) return null;
      button.setAttribute(BUTTON_ATTR, '');
      button.setAttribute('type', 'button');
      button.removeAttribute('aria-keyshortcuts');
      button.removeAttribute('aria-describedby');

      const existingIcon = button.querySelector('svg');
      if (existingIcon && existingIcon.parentElement) {
        existingIcon.parentElement.replaceChild(svgIcon(), existingIcon);
      } else if (button.firstElementChild) {
        button.firstElementChild.appendChild(svgIcon());
      }

      const label = labelElement(button);
      if (label) {
        label.setAttribute('data-dsh-quick-restart-label', '');
        label.textContent = tr('menu.restart');
      }
      if (button.hasAttribute('aria-label')) button.setAttribute('aria-label', tr('menu.restart'));
      if (button.hasAttribute('title')) button.setAttribute('title', tr('menu.restart'));

      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (state.phase === 'running') return;
        openConfirm();
      });

      // The host positions this portal once, in a layout effect, using the list's
      // height at that moment. Adding an item afterwards makes the list taller
      // than the computed offset, so for one frame its bottom edge would cover
      // the account trigger. Shift the already-computed top up by exactly the
      // amount the list grew; the host's next animation frame computes the same
      // value and keeps it there.
      const topBefore = parseFloat(menu.style.top);
      const heightBefore = menu.offsetHeight;
      anchor.parentElement.insertBefore(clone, anchor.nextSibling);
      const delta = menu.offsetHeight - heightBefore;
      if (Number.isFinite(topBefore) && topBefore > 0 && delta > 0) {
        const nextTop = topBefore - delta;
        if (nextTop >= 12) menu.style.top = `${nextTop}px`;
      }
      inserted.add(clone);
      syncItem(clone);
      return clone;
    }

    function enhanceMenus() {
      let menus;
      try {
        menus = document.querySelectorAll('[role="menu"]');
      } catch {
        return;
      }
      for (const menu of menus) {
        const found = findItems(menu);
        if (!found) continue;
        let wrapper = menu.querySelector(`[${ITEM_ATTR}]`);
        if (!wrapper) wrapper = insertRestartItem(menu, found.settings, found.feedback);
        if (wrapper) syncItem(wrapper);
      }
    }

    let scanning = false;
    function scanNow() {
      if (scanning) return;
      scanning = true;
      try {
        enhanceMenus();
      } catch {
        // never let menu augmentation break the host UI
      } finally {
        scanning = false;
      }
    }

    function addedNodeHasMenu(node) {
      if (!node || node.nodeType !== 1) return false;
      try {
        if (node.matches('[role="menu"]')) return true;
        if (node.querySelector('[role="menu"]')) return true;
        return Boolean(node.closest('[role="menu"]'));
      } catch {
        return false;
      }
    }

    function startEnhancer() {
      if (enhancerStarted) return;
      enhancerStarted = true;
      // Run enhancement in the MutationObserver callback itself (a microtask,
      // before the next paint). A setTimeout here paints the host menu once
      // without the restart item, which the user sees as a flash.
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          if (record.type === 'attributes') {
            if (record.target && record.target.getAttribute('aria-expanded') === 'true') {
              scanNow();
              return;
            }
            continue;
          }
          if (!record.addedNodes || !record.addedNodes.length) continue;
          for (const node of record.addedNodes) {
            if (addedNodeHasMenu(node)) {
              scanNow();
              return;
            }
          }
        }
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-expanded'],
      });
      enhancerObserver = observer;
      enhancerTimer = setInterval(scanNow, 1200);
      scanNow();
    }

    // ---------------------------------------------------------------- pieces
    function spinner(size) {
      return h('span', {
        'aria-hidden': 'true',
        style: {
          width: size || 14,
          height: size || 14,
          borderRadius: '50%',
          border: '2px solid var(--dsw-alias-border-l2)',
          borderTopColor: 'var(--dsw-alias-brand-primary)',
          display: 'inline-block',
          animation: 'dshQrSpin 800ms linear infinite',
          flex: 'none',
        },
      });
    }

    function iconDot(kind) {
      return h('span', {
        'aria-hidden': 'true',
        style: {
          width: 8,
          height: 8,
          borderRadius: '50%',
          flex: 'none',
          background:
            kind === 'error'
              ? 'var(--dsw-alias-state-error-primary)'
              : 'var(--dsw-alias-state-success-primary)',
        },
      });
    }

    function buttonStyle(kind) {
      const base = {
        appearance: 'none',
        border: '1px solid var(--dsw-alias-border-l2)',
        borderRadius: 8,
        padding: '6px 14px',
        fontSize: 13,
        lineHeight: '20px',
        cursor: 'pointer',
        font: 'inherit',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
      };
      if (kind === 'primary') {
        return {
          ...base,
          borderColor: 'transparent',
          background: 'var(--dsw-alias-button-primary-fill)',
          color: '#ffffff',
        };
      }
      return base;
    }

    function dialogButtons(children) {
      return h(
        'div',
        {
          style: {
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            marginTop: 18,
          },
        },
        ...children,
      );
    }

    function confirmDialog() {
      const ready = Boolean(state.status && state.status.ok);
      return h(
        'div',
        {
          className: 'dsh-qr-panel',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-labelledby': 'dsh-qr-title',
          onPointerDown: (event) => event.stopPropagation(),
        },
        h('div', { id: 'dsh-qr-title', className: 'dsh-qr-title' }, tr('dialog.title')),
        h('div', { className: 'dsh-qr-body' }, tr('dialog.body')),
        h('div', { className: 'dsh-qr-note' }, tr('dialog.note')),
        dialogButtons([
          h(
            'button',
            {
              key: 'cancel',
              type: 'button',
              style: buttonStyle('secondary'),
              autoFocus: true,
              onClick: resetDialog,
            },
            tr('dialog.cancel'),
          ),
          h(
            'button',
            {
              key: 'ok',
              type: 'button',
              disabled: !ready,
              style: {
                ...buttonStyle('primary'),
                opacity: ready ? 1 : 0.55,
                cursor: ready ? 'pointer' : 'default',
              },
              onClick: confirmRestart,
            },
            tr('dialog.confirm'),
          ),
        ]),
      );
    }

    function runningDialog() {
      return h(
        'div',
        {
          className: 'dsh-qr-panel',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-labelledby': 'dsh-qr-title',
          onPointerDown: (event) => event.stopPropagation(),
        },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 10 } },
          spinner(18),
          h('div', { id: 'dsh-qr-title', className: 'dsh-qr-title' }, tr('dialog.runningTitle')),
        ),
        h('div', { className: 'dsh-qr-body', style: { marginTop: 10 } }, tr('dialog.runningBody')),
      );
    }

    function messageDialog(kind) {
      const title = kind === 'error' ? tr('dialog.errorTitle') : tr('dialog.unavailableTitle');
      const message = kind === 'error' ? state.error : state.reason;
      const logPath = state.logPath || (state.status && state.status.logPath) || '';
      return h(
        'div',
        {
          className: 'dsh-qr-panel',
          role: 'alertdialog',
          'aria-modal': 'true',
          'aria-labelledby': 'dsh-qr-title',
          onPointerDown: (event) => event.stopPropagation(),
        },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 9 } },
          iconDot('error'),
          h('div', { id: 'dsh-qr-title', className: 'dsh-qr-title' }, title),
        ),
        h('div', { className: 'dsh-qr-body', style: { marginTop: 9 } }, message),
        logPath
          ? h(
              'div',
              { className: 'dsh-qr-log' },
              h('span', null, tr('dialog.logPath')),
              h('code', null, logPath),
            )
          : null,
        logPath ? h('div', { className: 'dsh-qr-note' }, tr('dialog.openLogHint')) : null,
        dialogButtons([
          kind === 'error'
            ? h(
                'button',
                {
                  key: 'retry',
                  type: 'button',
                  style: buttonStyle('secondary'),
                  onClick: openConfirm,
                },
                tr('dialog.retry'),
              )
            : null,
          h(
            'button',
            {
              key: 'close',
              type: 'button',
              style: buttonStyle('primary'),
              autoFocus: true,
              onClick: resetDialog,
            },
            tr('dialog.close'),
          ),
        ].filter(Boolean)),
      );
    }

    function toastView() {
      if (!state.toast) return null;
      return h(
        'div',
        {
          className: 'dsh-qr-toast',
          role: 'status',
          'aria-live': 'polite',
          style: { pointerEvents: 'auto' },
          onClick: () => setState({ toast: null }),
        },
        iconDot(state.toast.kind),
        h('span', null, state.toast.text),
      );
    }

    function Overlay() {
      const [, setTick] = React.useState(0);

      React.useEffect(() => {
        const listener = () => setTick((value) => value + 1);
        listeners.add(listener);
        return () => listeners.delete(listener);
      }, []);

      React.useEffect(() => {
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return;
          if (state.phase === 'confirm' || state.phase === 'error' || state.phase === 'unavailable') {
            event.stopPropagation();
            resetDialog();
          }
        };
        document.addEventListener('keydown', onKeyDown, true);
        return () => document.removeEventListener('keydown', onKeyDown, true);
      }, []);

      let dialog = null;
      if (state.phase === 'confirm') dialog = confirmDialog();
      else if (state.phase === 'running') dialog = runningDialog();
      else if (state.phase === 'error') dialog = messageDialog('error');
      else if (state.phase === 'unavailable') dialog = messageDialog('unavailable');

      return h(
        React.Fragment,
        null,
        h('style', null, CSS),
        dialog
          ? h(
              'div',
              {
                className: 'dsh-qr-backdrop',
                onPointerDown: (event) => {
                  if (event.target === event.currentTarget && state.phase !== 'running') resetDialog();
                },
              },
              dialog,
            )
          : null,
        toastView(),
      );
    }

    const CSS = `
@keyframes dshQrSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.dsh-qr-backdrop {
  position: fixed; inset: 0; z-index: 2147483000;
  display: flex; align-items: center; justify-content: center;
  padding: 16px; background: rgba(0, 0, 0, 0.42);
  pointer-events: auto;
}
.dsh-qr-panel {
  box-sizing: border-box; width: min(430px, 100%);
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px; padding: 20px;
  color: var(--dsw-alias-label-primary);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
  font-size: 13px; line-height: 1.6;
}
.dsh-qr-title { font-size: 15px; font-weight: 600; line-height: 22px; }
.dsh-qr-body { margin-top: 8px; color: var(--dsw-alias-label-secondary); }
.dsh-qr-note { margin-top: 8px; color: var(--dsw-alias-label-dimmed); font-size: 12px; }
.dsh-qr-log {
  margin-top: 10px; padding: 8px 10px; border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-secondary); font-size: 12px;
  overflow-wrap: anywhere;
}
.dsh-qr-log code { color: var(--dsw-alias-label-primary); font-size: 12px; }
.dsh-qr-toast {
  position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%);
  z-index: 2147483001; display: flex; align-items: center; gap: 9px;
  max-width: min(560px, calc(100vw - 32px));
  padding: 10px 14px; border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l2);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.24);
  color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 20px;
}
`;

    // ----------------------------------------------------------------- apply
    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctxRef = ctx;

        try {
          ctx.effect(() => {
            const disposers = [];
            try {
              // Namespaces outside LocaleNamespaceMap must use the single-locale
              // untyped form; the two-argument form is for declared namespaces.
              disposers.push(ctx.locale.register(NS, 'zh', FLAT_DICTS.zh));
              disposers.push(ctx.locale.register(NS, 'en', FLAT_DICTS.en));
            } catch {
              // Already registered, or an older service: embedded dictionary
              // in tr() still keeps the UI readable.
            }
            return () => {
              for (const dispose of disposers) {
                try {
                  dispose();
                } catch {
                  // ignore
                }
              }
            };
          }, 'dsh-quick-restart: dictionaries');
        } catch {
          try {
            ctx.locale.register(NS, 'zh', FLAT_DICTS.zh);
            ctx.locale.register(NS, 'en', FLAT_DICTS.en);
          } catch {
            // Embedded dictionary still works.
          }
        }

        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            {
              name: 'shell.overlay',
              id: 'dsh-quick-restart',
              order: 900,
            },
            Overlay,
          ),
        );

        const start = () => {
          try {
            startEnhancer();
          } catch {
            // The overlay/dialog still works even if menu augmentation fails.
          }
        };

        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', start, { once: true });
        } else {
          start();
        }

        bootTimer = setTimeout(() => {
          checkBootResult().catch(() => {});
        }, 1200);

        if (typeof window !== 'undefined') {
          window.addEventListener('beforeunload', () => {
            if (bootTimer) clearTimeout(bootTimer);
            clearPoll();
          });
        }

        try {
          ctx.effect(() => () => {
            if (enhancerTimer) clearInterval(enhancerTimer);
            if (enhancerObserver) enhancerObserver.disconnect();
            if (bootTimer) clearTimeout(bootTimer);
            clearPoll();
            if (toastTimer) clearTimeout(toastTimer);
          });
        } catch {
          // Cleanup is best-effort; the page teardown still releases everything.
        }
      },
    };
  },
});
