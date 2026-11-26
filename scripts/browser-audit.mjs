import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const PORT = 3199;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SCREENSHOT_DIR = '/home/znekm/.gemini/antigravity/brain/a34dbe38-177c-4589-bb0e-62cde9204a69/scratch';

const ROUTES = [
  '/',
  '/analiz',
  '/profil',
  '/ayarlar',
  '/premium',
  '/sehir/ankara',
  '/kaynak/kariyer-kapisi',
  '/kpss-arsivi',
  '/giris',
  '/kayit',
  '/kayitli',
  '/gizlilik-politikasi',
  '/kullanim-kosullari',
];

const MATRIX_ROUTES = ['/', '/analiz', '/profil', '/ayarlar', '/kpss-arsivi'];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureBuildReady() {
  const buildIdPath = path.join(REPO_ROOT, '.next', 'BUILD_ID');
  const lockPath = path.join(REPO_ROOT, '.next', 'lock');

  // If another worker is currently running next build, wait briefly for lock release
  for (let i = 0; i < 60; i += 1) {
    if (fs.existsSync(lockPath)) {
      await sleep(1000);
    } else {
      break;
    }
  }

  if (!fs.existsSync(buildIdPath)) {
    console.log('[audit] .next/BUILD_ID not found; running npm run build...');
    const res = spawnSync('npm', ['run', 'build'], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      env: process.env,
    });
    if (res.status !== 0) {
      throw new Error(`npm run build failed with exit code ${res.status}`);
    }
  }
}

async function waitForHealth(timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) {
        return;
      }
    } catch {
      // retry
    }
    await sleep(300);
  }
  throw new Error(`Timed out waiting for ${BASE_URL}/api/health`);
}

async function launchChromium(profileDir) {
  const chromeBin = process.env.CHROME_BIN || '/usr/bin/chromium';
  const child = spawn(
    chromeBin,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-background-networking',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${profileDir}`,
      'about:blank',
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  let stderrBuf = '';
  child.stderr.on('data', (chunk) => {
    stderrBuf += chunk.toString();
  });

  const activePortFile = path.join(profileDir, 'DevToolsActivePort');
  const started = Date.now();
  let wsUrl = null;

  while (Date.now() - started < 15000) {
    const match = stderrBuf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
    if (match) {
      wsUrl = match[1];
      break;
    }
    if (fs.existsSync(activePortFile)) {
      const lines = fs.readFileSync(activePortFile, 'utf8').trim().split(/\r?\n/);
      if (lines.length >= 2 && lines[0] && lines[1]) {
        wsUrl = `ws://127.0.0.1:${lines[0]}${lines[1]}`;
        break;
      }
    }
    if (child.exitCode !== null) {
      throw new Error(`Chromium exited early (${child.exitCode}): ${stderrBuf}`);
    }
    await sleep(100);
  }

  if (!wsUrl) {
    child.kill('SIGKILL');
    throw new Error(`Timed out waiting for Chromium DevTools WS URL. stderr: ${stderrBuf}`);
  }

  return { child, wsUrl };
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      const onOpen = () => {
        this.ws.removeEventListener('error', onError);
        resolve();
      };
      const onError = (err) => {
        this.ws.removeEventListener('open', onOpen);
        reject(new Error(`CDP WebSocket error: ${err?.message || 'unknown'}`));
      };
      this.ws.addEventListener('open', onOpen);
      this.ws.addEventListener('error', onError);
    });

    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data));
      if (typeof msg.id === 'number') {
        const entry = this.pending.get(msg.id);
        if (entry) {
          this.pending.delete(msg.id);
          if (msg.error) {
            entry.reject(new Error(`${entry.method}: ${msg.error.message} (${msg.error.code})`));
          } else {
            entry.resolve(msg.result);
          }
        }
        return;
      }
      if (msg.method) {
        const list = this.listeners.get(msg.method);
        if (list) {
          for (const cb of list) {
            cb(msg.params || {}, msg.sessionId);
          }
        }
      }
    });
  }

  on(method, cb) {
    if (!this.listeners.has(method)) {
      this.listeners.set(method, new Set());
    }
    this.listeners.get(method).add(cb);
    return () => this.listeners.get(method)?.delete(cb);
  }

  send(method, params = {}, sessionId = undefined) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout waiting for ${method}`));
      }, 20000);
      this.pending.set(id, {
        method,
        resolve: (res) => {
          clearTimeout(timer);
          resolve(res);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      this.ws.send(JSON.stringify(payload));
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {
      // ignore
    }
  }
}

class PageSession {
  constructor(cdp, sessionId, targetId) {
    this.cdp = cdp;
    this.sessionId = sessionId;
    this.targetId = targetId;
    this.consoleErrors = [];
    this.pageErrors = [];
    this.badResponses = [];
    this.docStatus = null;
    this.mainFrameId = null;

    this.unsubs = [
      cdp.on('Runtime.consoleAPICalled', (params, sid) => {
        if (sid !== this.sessionId) return;
        if (params.type === 'error') {
          const text = (params.args || [])
            .map((a) => a.value ?? a.description ?? a.type)
            .join(' ');
          this.consoleErrors.push(text);
        }
      }),
      cdp.on('Runtime.exceptionThrown', (params, sid) => {
        if (sid !== this.sessionId) return;
        const details = params.exceptionDetails || {};
        const msg =
          details.exception?.description ||
          details.text ||
          'Uncaught runtime exception';
        this.pageErrors.push(msg);
      }),
      cdp.on('Log.entryAdded', (params, sid) => {
        if (sid !== this.sessionId) return;
        const entry = params.entry || {};
        if (entry.level === 'error') {
          this.consoleErrors.push(`[Log:${entry.source}] ${entry.text}`);
        }
      }),
      cdp.on('Network.responseReceived', (params, sid) => {
        if (sid !== this.sessionId) return;
        const resp = params.response || {};
        if (
          params.type === 'Document' &&
          params.frameId === this.mainFrameId &&
          resp.url.startsWith(BASE_URL)
        ) {
          this.docStatus = resp.status;
        }
        if (resp.status >= 400 && resp.url.startsWith(BASE_URL)) {
          this.badResponses.push({
            status: resp.status,
            url: resp.url.replace(BASE_URL, ''),
            type: params.type,
          });
        }
      }),
    ];
  }

  async init() {
    await this.cdp.send('Page.enable', {}, this.sessionId);
    await this.cdp.send('Runtime.enable', {}, this.sessionId);
    await this.cdp.send('Network.enable', {}, this.sessionId);
    await this.cdp.send('Log.enable', {}, this.sessionId);
    const tree = await this.cdp.send('Page.getFrameTree', {}, this.sessionId);
    this.mainFrameId = tree.frameTree?.frame?.id || null;
  }

  resetLogs() {
    this.consoleErrors = [];
    this.pageErrors = [];
    this.badResponses = [];
    this.docStatus = null;
  }

  async setViewport(width, height, mobile = false) {
    await this.cdp.send(
      'Emulation.setDeviceMetricsOverride',
      {
        width,
        height,
        deviceScaleFactor: mobile ? 2 : 1,
        mobile,
      },
      this.sessionId
    );
  }

  async setTheme(mode) {
    await this.eval(`(() => {
      try { localStorage.setItem('kbs_theme', ${JSON.stringify(mode)}); } catch {}
      const root = document.documentElement;
      if (${JSON.stringify(mode)} === 'dark') {
        root.classList.add('dark');
        root.classList.remove('light');
        root.style.colorScheme = 'dark';
      } else {
        root.classList.add('light');
        root.classList.remove('dark');
        root.style.colorScheme = 'light';
      }
    })()`);
    await sleep(150);
  }

  async goto(routePath, { waitMs = 600 } = {}) {
    this.resetLogs();
    const url = `${BASE_URL}${routePath}`;
    const loaded = new Promise((resolve) => {
      const off = this.cdp.on('Page.loadEventFired', (_params, sid) => {
        if (sid === this.sessionId) {
          off();
          resolve();
        }
      });
      setTimeout(() => {
        off();
        resolve();
      }, 15000);
    });

    await this.cdp.send('Page.navigate', { url }, this.sessionId);
    await loaded;
    await sleep(waitMs);
  }

  async eval(expression) {
    const res = await this.cdp.send(
      'Runtime.evaluate',
      {
        expression,
        awaitPromise: true,
        returnByValue: true,
      },
      this.sessionId
    );
    if (res.exceptionDetails) {
      throw new Error(
        `Eval error: ${res.exceptionDetails.exception?.description || res.exceptionDetails.text}`
      );
    }
    return res.result?.value;
  }

  async waitForCondition(fnExpr, timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const ok = await this.eval(`Boolean((${fnExpr})())`);
      if (ok) return true;
      await sleep(120);
    }
    return false;
  }

  async screenshot(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const res = await this.cdp.send(
      'Page.captureScreenshot',
      { format: 'png' },
      this.sessionId
    );
    fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
  }

  dispose() {
    for (const off of this.unsubs) off();
  }
}

async function killProcess(proc) {
  if (!proc || proc.exitCode !== null) return;
  proc.kill('SIGTERM');
  for (let i = 0; i < 20; i += 1) {
    if (proc.exitCode !== null) return;
    await sleep(150);
  }
  if (proc.exitCode === null) {
    proc.kill('SIGKILL');
  }
}

async function main() {
  await ensureBuildReady();

  const serverProc = spawn('npm', ['run', 'start', '--', '-p', String(PORT)], {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: String(PORT),
      HOSTNAME: '127.0.0.1',
      SESSION_SECRET:
        process.env.SESSION_SECRET ||
        'kbs-local-browser-audit-session-secret-0123456789',
    },
  });

  let serverLogs = '';
  serverProc.stdout.on('data', (d) => {
    serverLogs += d.toString();
  });
  serverProc.stderr.on('data', (d) => {
    serverLogs += d.toString();
  });

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kbs-chrome-audit-'));
  let chromeProc = null;
  let cdp = null;
  let page = null;

  const failures = [];
  const summary = {
    routesChecked: [],
    ilanRoute: null,
    overflowMatrix: [],
    interactions: [],
    screenshots: [],
  };

  try {
    await waitForHealth(30000);
    const launched = await launchChromium(profileDir);
    chromeProc = launched.child;
    cdp = new CdpClient(launched.wsUrl);
    await cdp.connect();

    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', {
      targetId,
      flatten: true,
    });

    page = new PageSession(cdp, sessionId, targetId);
    await page.init();
    await page.setViewport(1440, 900, false);

    // 1. Audit all 13 routes on unauthenticated initial load
    console.log('[audit] Auditing 13 routes (HTTP 200, console.error, pageerror, >=400 network)...');
    for (const route of ROUTES) {
      await page.goto(route, { waitMs: 700 });
      const status = page.docStatus;
      const bodyLen = await page.eval('document.body?.innerText?.trim().length || 0');
      const result = {
        route,
        status,
        bodyLen,
        consoleErrors: [...page.consoleErrors],
        pageErrors: [...page.pageErrors],
        badResponses: [...page.badResponses],
      };
      summary.routesChecked.push(result);

      if (status !== 200) {
        failures.push(`Route ${route} returned HTTP ${status} (expected 200)`);
      }
      if (bodyLen < 20) {
        failures.push(`Route ${route} rendered empty body (${bodyLen} chars)`);
      }
      if (result.consoleErrors.length > 0) {
        failures.push(`Route ${route} consoleErrors: ${JSON.stringify(result.consoleErrors)}`);
      }
      if (result.pageErrors.length > 0) {
        failures.push(`Route ${route} pageErrors: ${JSON.stringify(result.pageErrors)}`);
      }
      if (result.badResponses.length > 0) {
        failures.push(`Route ${route} >=400 responses: ${JSON.stringify(result.badResponses)}`);
      }
    }

    // 2. Click first announcement card link on `/` to navigate to `/ilan/<id>`
    console.log('[audit] Checking navigation from / to /ilan/<id>...');
    await page.goto('/', { waitMs: 700 });
    const firstIlanHref = await page.eval(`(() => {
      const link = document.querySelector('a[href^="/ilan/"]');
      if (!link) return null;
      const href = link.getAttribute('href');
      link.click();
      return href;
    })()`);

    if (!firstIlanHref) {
      failures.push('No a[href^="/ilan/"] link found on /');
    } else {
      const navigated = await page.waitForCondition(
        `() => window.location.pathname === ${JSON.stringify(firstIlanHref)}`
      );
      await sleep(600);
      const detailCheck = await fetch(`${BASE_URL}${firstIlanHref}`);
      const detailOk = detailCheck.status === 200;
      summary.ilanRoute = {
        href: firstIlanHref,
        clientNavigated: navigated,
        httpStatus: detailCheck.status,
        consoleErrors: [...page.consoleErrors],
        pageErrors: [...page.pageErrors],
        badResponses: [...page.badResponses],
      };
      if (!navigated || !detailOk) {
        failures.push(`/ilan navigation failed: href=${firstIlanHref} nav=${navigated} status=${detailCheck.status}`);
      }
      if (page.consoleErrors.length > 0 || page.pageErrors.length > 0 || page.badResponses.length > 0) {
        failures.push(`/ilan errors: console=${JSON.stringify(page.consoleErrors)} page=${JSON.stringify(page.pageErrors)} net=${JSON.stringify(page.badResponses)}`);
      }
    }

    // 3. Layout & Theme matrix on 5 key routes (1440x900 Light/Dark + 390x844 Light/Dark)
    console.log('[audit] Running Desktop/Mobile x Light/Dark overflow matrix & capturing screenshots...');
    const viewports = [
      { label: 'desktop', width: 1440, height: 900, mobile: false },
      { label: 'mobile', width: 390, height: 844, mobile: true },
    ];
    const themes = ['light', 'dark'];

    for (const vp of viewports) {
      await page.setViewport(vp.width, vp.height, vp.mobile);
      for (const theme of themes) {
        for (const route of MATRIX_ROUTES) {
          await page.setTheme(theme);
          await page.goto(route, { waitMs: 550 });
          if (route === '/kpss-arsivi') {
            await page.waitForCondition(
              "() => document.body.innerText.includes('Hızlı Kadro Arama')",
              8000
            );
          }
          await page.setTheme(theme);

          const metrics = await page.eval(`(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            innerWidth: window.innerWidth,
            isDark: document.documentElement.classList.contains('dark'),
          }))()`);

          const overflow =
            metrics.scrollWidth > metrics.innerWidth || metrics.scrollWidth > vp.width;
          summary.overflowMatrix.push({
            route,
            viewport: `${vp.width}x${vp.height}`,
            theme,
            scrollWidth: metrics.scrollWidth,
            innerWidth: metrics.innerWidth,
            overflow,
          });

          if (overflow) {
            failures.push(
              `Horizontal overflow on ${route} (${vp.label} ${vp.width}x${vp.height}, ${theme}): scrollWidth=${metrics.scrollWidth} innerWidth=${metrics.innerWidth} vpWidth=${vp.width}`
            );
          }

          if (route === '/' && vp.label === 'desktop' && theme === 'light') {
            const p = path.join(SCREENSHOT_DIR, 'home-desktop-light.png');
            await page.screenshot(p);
            summary.screenshots.push(p);
          } else if (route === '/' && vp.label === 'desktop' && theme === 'dark') {
            const p = path.join(SCREENSHOT_DIR, 'home-desktop-dark.png');
            await page.screenshot(p);
            summary.screenshots.push(p);
          } else if (route === '/' && vp.label === 'mobile' && theme === 'light') {
            const p = path.join(SCREENSHOT_DIR, 'home-mobile-light.png');
            await page.screenshot(p);
            summary.screenshots.push(p);
          } else if (route === '/analiz' && vp.label === 'desktop' && theme === 'dark') {
            const p = path.join(SCREENSHOT_DIR, 'analiz-desktop-dark.png');
            await page.screenshot(p);
            summary.screenshots.push(p);
          }
        }
      }
    }

    // Reset to desktop light for interactive R-35 checks
    await page.setViewport(1440, 900, false);
    await page.setTheme('light');

    // 4. Interactive Check 1: Theme toggle button flips html.classList.contains('dark')
    console.log('[audit] R-35 Check 1: Theme toggle...');
    await page.goto('/', { waitMs: 500 });
    await page.setTheme('light');
    const themeToggleResult = await page.eval(`(() => {
      const before = document.documentElement.classList.contains('dark');
      const btn = document.querySelector('button[aria-label*="temaya geç"]');
      if (!btn) return { found: false };
      btn.click();
      const afterFirst = document.documentElement.classList.contains('dark');
      btn.click();
      const afterSecond = document.documentElement.classList.contains('dark');
      return { found: true, before, afterFirst, afterSecond };
    })()`);
    summary.interactions.push({ check: 'theme-toggle', ...themeToggleResult });
    if (!themeToggleResult.found || themeToggleResult.before === themeToggleResult.afterFirst || themeToggleResult.before !== themeToggleResult.afterSecond) {
      failures.push(`Theme toggle failed: ${JSON.stringify(themeToggleResult)}`);
    }

    // 5. Interactive Check 2: On `/`, use search/filter control and verify visible results update
    console.log('[audit] R-35 Check 2: Home feed search/filter...');
    const homeFilterResult = await page.eval(`(async () => {
      const input = document.querySelector('#feed-search');
      if (!input) return { found: false };
      const initialCount = document.querySelectorAll('a[href^="/ilan/"]').length;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'Adalet');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 150));
      const filteredCards = Array.from(document.querySelectorAll('a[href^="/ilan/"]'));
      const filteredCount = filteredCards.length;
      const bodyText = document.body.innerText;
      setter.call(input, '');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return {
        found: true,
        initialCount,
        filteredCount,
        hasAdalet: /Adalet/i.test(bodyText),
      };
    })()`);
    summary.interactions.push({ check: 'home-search-filter', ...homeFilterResult });
    if (!homeFilterResult.found || homeFilterResult.filteredCount === 0 || homeFilterResult.filteredCount >= homeFilterResult.initialCount || !homeFilterResult.hasAdalet) {
      failures.push(`Home feed search/filter failed: ${JSON.stringify(homeFilterResult)}`);
    }
    if (page.consoleErrors.length > 0 || page.pageErrors.length > 0) {
      failures.push(`Home search/filter logged console/page errors: ${JSON.stringify(page.consoleErrors)}`);
    }

    // 6. Interactive Check 4 (before auth): On `/kpss-arsivi`, search `3011` and assert matching rows appear
    console.log('[audit] R-35 Check 4: /kpss-arsivi search 3011...');
    await page.goto('/kpss-arsivi', { waitMs: 600 });
    await page.waitForCondition(
      "() => document.body.innerText.includes('Hızlı Kadro Arama')",
      8000
    );
    const kpssResult = await page.eval(`(async () => {
      // Switch to Hızlı Kadro Arama mode and search 3011
      const buttons = Array.from(document.querySelectorAll('button'));
      const directBtn = buttons.find((b) => b.textContent && b.textContent.includes('Hızlı Kadro Arama'));
      if (!directBtn) return { foundDirectTab: false };
      directBtn.click();
      await new Promise((r) => setTimeout(r, 120));
      const input = document.querySelector('#direct-search-input');
      if (!input) return { foundDirectTab: true, foundInput: false };
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, '3011');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 80));
      const submitBtn = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent && b.textContent.includes('Kadrolarda Ara')
      );
      if (!submitBtn) return { foundDirectTab: true, foundInput: true, foundSubmit: false };
      submitBtn.click();
      await new Promise((r) => setTimeout(r, 250));
      const bodyText = document.body.innerText;
      const countMatch = bodyText.match(/([\\d.]+)\\s+Kadro Listeleniyor/);
      const listedCount = countMatch ? Number(countMatch[1].replace(/\\./g, '')) : 0;
      const rows = document.querySelectorAll('tbody tr').length;
      return {
        foundDirectTab: true,
        foundInput: true,
        foundSubmit: true,
        listedCount,
        tableRows: rows,
        has3011Text: bodyText.includes('3011'),
      };
    })()`);
    summary.interactions.push({ check: 'kpss-arsivi-3011', ...kpssResult });
    if (!kpssResult.listedCount || kpssResult.listedCount <= 0 || kpssResult.tableRows <= 0) {
      failures.push(`/kpss-arsivi search 3011 returned 0 rows: ${JSON.stringify(kpssResult)}`);
    }

    // Create a fresh session via /api/auth/register inside browser context to verify authenticated /profil & /ayarlar
    console.log('[audit] Creating browser audit user session for authenticated /profil & /ayarlar checks...');
    await page.goto('/', { waitMs: 300 });
    const authReg = await page.eval(`(async () => {
      const email = 'audit-' + Date.now() + '@kamubildirimsepeti.test';
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password: 'AuditPassword123!',
          fullName: 'Audit Kullanici',
          acceptedTerms: true,
          acceptedPrivacy: true,
        }),
      });
      return { ok: res.ok, status: res.status };
    })()`);
    if (!authReg.ok) {
      failures.push(`Could not register browser audit session user: ${JSON.stringify(authReg)}`);
    }

    // 7. Interactive Check 3: On `/profil`, test Senaryo Karsilastirma panel interaction
    console.log('[audit] R-35 Check 3: /profil Senaryo Karsilastirma...');
    await page.goto('/profil', { waitMs: 700 });
    const profilLoaded = await page.waitForCondition(
      `() => Boolean(document.querySelector('#scenario-kpss-score'))`
    );
    const scenarioResult = profilLoaded
      ? await page.eval(`(async () => {
          const scoreInput = document.querySelector('#scenario-kpss-score');
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(scoreInput, '90.00');
          scoreInput.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise((r) => setTimeout(r, 80));
          const btn = Array.from(document.querySelectorAll('button')).find(
            (b) => b.textContent && b.textContent.includes('Senaryoyu Karşılaştır')
          );
          if (!btn) return { foundBtn: false };
          btn.click();
          await new Promise((r) => setTimeout(r, 200));
          const text = document.body.innerText;
          return {
            foundBtn: true,
            hasBaseCount: text.includes('Mevcut Uygun İlan'),
            hasAltCount: text.includes('Senaryo Uygun İlan'),
            hasDelta: text.includes('Net Fark'),
          };
        })()`)
      : { loaded: false };
    summary.interactions.push({ check: 'profil-scenario', profilLoaded, ...scenarioResult });
    if (!profilLoaded || !scenarioResult.foundBtn || !scenarioResult.hasBaseCount || !scenarioResult.hasAltCount || !scenarioResult.hasDelta) {
      failures.push(`/profil Senaryo Karsilastirma failed: ${JSON.stringify({ profilLoaded, ...scenarioResult })}`);
    }
    if (page.consoleErrors.length > 0 || page.pageErrors.length > 0 || page.badResponses.length > 0) {
      failures.push(`/profil (authenticated) errors: console=${JSON.stringify(page.consoleErrors)} page=${JSON.stringify(page.pageErrors)} net=${JSON.stringify(page.badResponses)}`);
    }

    // 8. Interactive Check 5: On `/ayarlar`, verify Sistem Altyapi Hazirligi 4 chips & Web Push section render cleanly
    console.log('[audit] R-35 Check 5: /ayarlar Sistem Altyapi Hazirligi & Web Push...');
    await page.goto('/ayarlar', { waitMs: 700 });
    const ayarlarLoaded = await page.waitForCondition(
      `() => document.body.innerText.includes('Sistem Altyapı Hazırlığı')`
    );
    const ayarlarResult = ayarlarLoaded
      ? await page.eval(`(() => {
          const text = document.body.innerText;
          return {
            hasReadinessHeading: text.includes('Sistem Altyapı Hazırlığı'),
            hasDbChip: text.includes('Veritabanı:'),
            hasEmailChip: text.includes('E-posta:'),
            hasPaymentChip: text.includes('Ödeme:'),
            hasPushChip: text.includes('Web Push:'),
            hasWebPushSection: text.includes('Tarayıcı Anlık Bildirimleri (Web Push)'),
            scrollWidth: document.documentElement.scrollWidth,
            innerWidth: window.innerWidth,
          };
        })()`)
      : { loaded: false };
    summary.interactions.push({ check: 'ayarlar-readiness-push', ayarlarLoaded, ...ayarlarResult });
    if (
      !ayarlarLoaded ||
      !ayarlarResult.hasReadinessHeading ||
      !ayarlarResult.hasDbChip ||
      !ayarlarResult.hasEmailChip ||
      !ayarlarResult.hasPaymentChip ||
      !ayarlarResult.hasPushChip ||
      !ayarlarResult.hasWebPushSection ||
      ayarlarResult.scrollWidth > ayarlarResult.innerWidth
    ) {
      failures.push(`/ayarlar check failed: ${JSON.stringify({ ayarlarLoaded, ...ayarlarResult })}`);
    }
    if (page.consoleErrors.length > 0 || page.pageErrors.length > 0 || page.badResponses.length > 0) {
      failures.push(`/ayarlar (authenticated) errors: console=${JSON.stringify(page.consoleErrors)} page=${JSON.stringify(page.pageErrors)} net=${JSON.stringify(page.badResponses)}`);
    }

    // Clean up audit user
    await page.eval(`fetch('/api/account', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'SIL' })
    }).catch(() => null)`);

    console.log(JSON.stringify(summary, null, 2));

    if (failures.length > 0) {
      console.error('\n[AUDIT FAILURES]');
      for (const f of failures) {
        console.error(`- ${f}`);
      }
      process.exitCode = 1;
    } else {
      console.log('\n[AUDIT PASSED] All routes, layout/theme matrix, R-35 interactions, and screenshots succeeded.');
    }
  } catch (err) {
    if (serverLogs) {
      console.error('\n[server logs tail]\n' + serverLogs.slice(-1500));
    }
    throw err;
  } finally {
    if (page) page.dispose();
    if (cdp) cdp.close();
    await killProcess(chromeProc);
    await killProcess(serverProc);
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    if (process.exitCode && serverLogs) {
      console.error('\n[server logs tail]\n' + serverLogs.slice(-1500));
    }
  }
}

main().catch((err) => {
  console.error('[audit fatal]', err);
  process.exit(1);
});
