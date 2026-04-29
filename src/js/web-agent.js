'use strict';
// ── HEX Web Agent ─────────────────────────────────────────────────────────────
// Two browser modes:
//
//  1. HEADLESS  — scrapeUrl(), searchWeb()
//     Invisible Playwright browser, scrapes pages and Google.
//
//  2. CONTROLLED  — navigateTo(), smartSearch(), typeText(), clickElement(),
//                   findAndClick(), fillAndSubmit(), goBack(), goForward(),
//                   refreshPage(), readCurrentPage()
//     A VISIBLE browser that stays open and accepts commands from HEX.
//     Used when user says "open YouTube and search for X" or
//     "go to myauto.ge and filter by Ford 2020 hybrid".
//
// Site-aware search: smartSearch() knows where the search box is on
// popular sites (YouTube, Google, Amazon, myauto.ge …) and falls
// back to generic heuristics for everything else.

const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Fallback HEX-only profile dir (used when Chrome profile is locked)
const HEX_BROWSER_DIR = path.join(os.tmpdir(), 'hex-browser-profile');
if (!fs.existsSync(HEX_BROWSER_DIR)) fs.mkdirSync(HEX_BROWSER_DIR, { recursive: true });

// ── Chrome profile sync ──────────────────────────────────────────────────────
// Copies essential files from the user's last-used Chrome profile into
// HEX's temp dir so Playwright can use them (Chrome blocks remote debugging
// on the real user data dir).

const PROFILE_FILES = [
  'Cookies', 'Cookies-journal',
  'Login Data', 'Login Data-journal',
  'Web Data', 'Web Data-journal',
  'Preferences', 'Secure Preferences',
  'Bookmarks', 'Favicons', 'Favicons-journal',
  'History', 'History-journal',
];

function syncChromeProfile() {
  try {
    const LOCALAPPDATA = process.env.LOCALAPPDATA || '';
    const chromeUserData = path.join(LOCALAPPDATA, 'Google', 'Chrome', 'User Data');
    const localStatePath = path.join(chromeUserData, 'Local State');
    if (!fs.existsSync(localStatePath)) return false;

    const localState = JSON.parse(fs.readFileSync(localStatePath, 'utf8'));
    const lastUsed = localState.profile?.last_used || 'Default';

    const srcProfile = path.join(chromeUserData, lastUsed);
    if (!fs.existsSync(srcProfile)) return false;

    // Copy into HEX's controlled dir under Default/ so Chrome treats it as the profile
    const destProfile = path.join(HEX_BROWSER_DIR, 'controlled', 'Default');
    if (!fs.existsSync(destProfile)) fs.mkdirSync(destProfile, { recursive: true });

    let copied = 0;
    for (const file of PROFILE_FILES) {
      const src = path.join(srcProfile, file);
      const dst = path.join(destProfile, file);
      try {
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dst);
          copied++;
        }
      } catch (_) { /* file may be locked by Chrome — skip it */ }
    }

    // Also copy Local State and First Run marker to the user data dir level
    const destUserData = path.join(HEX_BROWSER_DIR, 'controlled');
    try {
      fs.copyFileSync(localStatePath, path.join(destUserData, 'Local State'));
    } catch (_) { }
    // Write First Run marker so Chrome doesn't show setup
    try {
      fs.writeFileSync(path.join(destUserData, 'First Run'), '', { flag: 'wx' });
    } catch (_) { }

    console.log(`[HEX Web Agent] Synced ${copied} files from Chrome profile "${lastUsed}"`);
    return copied > 0;
  } catch (err) {
    console.warn('[HEX Web Agent] Profile sync failed:', err.message);
    return false;
  }
}

const MAX_TEXT_CHARS = 4000;

// ── Browser path detection ────────────────────────────────────────────────────

function findBrowserPath() {
  const LOCALAPPDATA = process.env.LOCALAPPDATA || '';
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    path.join(LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════════════
//  HEADLESS SESSION (scraping / searching)
// ══════════════════════════════════════════════════════════════════════════════

// launchPersistentContext avoids the --user-data-dir flag ban in launch()
let _headlessCtx = null;
let _headlessTimer = null;
const HEADLESS_DIR = path.join(HEX_BROWSER_DIR, 'headless');

async function getHeadlessBrowser() {
  if (_headlessTimer) clearTimeout(_headlessTimer);
  _headlessTimer = setTimeout(closeHeadless, 30000);
  if (_headlessCtx) return _headlessCtx;
  const execPath = findBrowserPath();
  if (!execPath) throw new Error('No browser found. Install Chrome or Edge.');
  if (!fs.existsSync(HEADLESS_DIR)) fs.mkdirSync(HEADLESS_DIR, { recursive: true });
  _headlessCtx = await chromium.launchPersistentContext(HEADLESS_DIR, {
    executablePath: execPath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--no-first-run', '--no-default-browser-check'],
  });
  return _headlessCtx;
}

async function closeHeadless() {
  if (_headlessCtx) {
    try { await _headlessCtx.close(); } catch (_) { }
    _headlessCtx = null;
  }
}

async function headlessPage() {
  const ctx = await getHeadlessBrowser();
  return ctx.newPage();
}

async function scrapeUrl(url) {
  const page = await headlessPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500);
    const text = await page.evaluate(() => {
      document.querySelectorAll('script,style,nav,footer,header,iframe,[role="navigation"],[role="banner"],.ad,.ads,.advertisement')
        .forEach(el => el.remove());
      const main = document.querySelector('article,main,[role="main"],.content,.post,.entry');
      return (main || document.body).innerText || '';
    });
    const title = await page.title();
    const cleaned = text.replace(/\n{3,}/g, '\n\n').trim();
    return {
      success: true, title, url,
      text: cleaned.length > MAX_TEXT_CHARS ? cleaned.slice(0, MAX_TEXT_CHARS) + '\n\n[... truncated]' : cleaned,
      charCount: cleaned.length,
    };
  } catch (err) {
    return { success: false, error: err.message, url };
  } finally {
    await page.close();
  }
}

async function searchWeb(query) {
  const page = await headlessPage();
  try {
    await page.goto('https://www.google.com/search?q=' + encodeURIComponent(query) + '&hl=en', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500);
    const results = await page.evaluate(() => {
      const items = [];
      for (const el of document.querySelectorAll('div.g,div[data-sokoban-container]')) {
        if (items.length >= 5) break;
        const a = el.querySelector('a[href^="http"]');
        const h = el.querySelector('h3');
        const s = el.querySelector('.VwiC3b,[data-snf],.st,span[style*="-webkit-line-clamp"]');
        if (a && h) items.push({ title: h.textContent.trim(), url: a.href, snippet: s ? s.textContent.trim() : '' });
      }
      return items;
    });
    const featured = await page.evaluate(() => {
      const b = document.querySelector('.hgKElc,.IZ6rdc,[data-attrid="wa:/description"]');
      return b ? b.textContent.trim() : null;
    });
    return { success: true, query, results, featured, count: results.length };
  } catch (err) {
    return { success: false, error: err.message, query };
  } finally {
    await page.close();
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  CONTROLLED VISIBLE SESSION
// ══════════════════════════════════════════════════════════════════════════════

let _ctrlBrowser = null;
let _ctrlPage = null;
let _ctrlTimer = null;
const CTRL_IDLE = 5 * 60 * 1000;

// ── Site-specific search box selectors ───────────────────────────────────────

const SITE_SEARCH_SELECTORS = {
  'youtube.com': { input: 'input#search,input[name="search_query"]', submit: 'button#search-icon-legacy,button[aria-label*="Search"]' },
  'google.com': { input: 'input[name="q"],textarea[name="q"]', submit: null },
  'amazon.com': { input: 'input#twotabsearchtextbox', submit: 'input#nav-search-submit-button' },
  'amazon.co.uk': { input: 'input#twotabsearchtextbox', submit: 'input#nav-search-submit-button' },
  'github.com': { input: 'input[name="q"],input[placeholder*="Search"]', submit: null },
  'reddit.com': { input: 'input[placeholder*="Search"]', submit: null },
  'twitter.com': { input: 'input[data-testid="SearchBox_Search_Input"]', submit: null },
  'x.com': { input: 'input[data-testid="SearchBox_Search_Input"]', submit: null },
  'myauto.ge': { input: 'input[placeholder*="ძებნ"],input[placeholder*="Search"],input[type="search"],input[name*="q"],input[name*="search"]', submit: 'button[type="submit"],button.search-btn,.search-button' },
  'ss.ge': { input: 'input[name="q"],input[type="search"],input[placeholder*="ძებნ"]', submit: 'button[type="submit"]' },
  'myhome.ge': { input: 'input[type="search"],input[placeholder*="Search"]', submit: null },
  'ebay.com': { input: 'input#gh-ac', submit: 'input#gh-btn' },
  'bing.com': { input: 'input#sb_form_q', submit: null },
  'duckduckgo.com': { input: 'input[name="q"]', submit: null },
  'wikipedia.org': { input: 'input#searchInput,input[name="search"]', submit: null },
  'stackoverflow.com': { input: 'input[placeholder*="Search"]', submit: null },
  'aliexpress.com': { input: 'input.search-key', submit: null },
};

function getSiteSelectors(url) {
  try {
    const host = new URL(url).hostname.replace('www.', '');
    for (const [site, sel] of Object.entries(SITE_SEARCH_SELECTORS)) {
      if (host.includes(site)) return sel;
    }
  } catch (_) { }
  return {
    input: 'input[type="search"],input[name="q"],input[name="query"],input[placeholder*="earch" i],input[aria-label*="earch" i]',
    submit: 'button[type="submit"],input[type="submit"],button[aria-label*="earch" i]',
  };
}

// ── Controlled browser lifecycle ──────────────────────────────────────────────

async function getControlledPage() {
  if (_ctrlTimer) clearTimeout(_ctrlTimer);
  _ctrlTimer = setTimeout(closeControlled, CTRL_IDLE);

  if (_ctrlBrowser && _ctrlPage && !_ctrlPage.isClosed()) {
    return _ctrlPage;
  }

  const execPath = findBrowserPath();
  if (!execPath) throw new Error('No browser found. Install Chrome or Edge.');

  // Sync cookies/logins/bookmarks from user's last Chrome profile
  syncChromeProfile();

  const CTRL_DIR = path.join(HEX_BROWSER_DIR, 'controlled');
  if (!fs.existsSync(CTRL_DIR)) fs.mkdirSync(CTRL_DIR, { recursive: true });

  const ctrlCtx = await chromium.launchPersistentContext(CTRL_DIR, {
    executablePath: execPath,
    headless: false,
    viewport: null,
    args: ['--no-sandbox', '--start-maximized',
      '--no-first-run', '--no-default-browser-check'],
  });

  // Store the context as _ctrlBrowser so closeControlled() can .close() it
  _ctrlBrowser = ctrlCtx;
  _ctrlPage = await ctrlCtx.newPage();

  ctrlCtx.on('close', () => {
    _ctrlBrowser = null; _ctrlPage = null;
    if (_ctrlTimer) { clearTimeout(_ctrlTimer); _ctrlTimer = null; }
  });
  _ctrlPage.on('close', () => { _ctrlPage = null; });

  return _ctrlPage;
}

async function closeControlled() {
  if (_ctrlBrowser) {
    try { await _ctrlBrowser.close(); } catch (_) { }
    _ctrlBrowser = null; _ctrlPage = null;
  }
}

// ── Controlled actions ────────────────────────────────────────────────────────

async function navigateTo(url) {
  const page = await getControlledPage();
  try {
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1200);
    return { success: true, url: page.url(), title: await page.title() };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function smartSearch(query, siteUrl) {
  if (siteUrl) {
    const nav = await navigateTo(siteUrl);
    if (!nav.success) return nav;
    await _ctrlPage.waitForTimeout(2500);
  }
  const page = _ctrlPage;
  if (!page) return { success: false, error: 'No browser session.' };

  const sel = getSiteSelectors(page.url());
  try {
    const inputHandle = await page.waitForSelector(sel.input, { timeout: 6000 }).catch(() => null);

    if (!inputHandle) {
      // Fallback: Google site search
      const host = new URL(page.url()).hostname;
      const fallbackUrl = 'https://www.google.com/search?q=site:' + host + '+' + encodeURIComponent(query);
      await page.goto(fallbackUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      return { success: true, method: 'google-site-search', url: page.url(), query };
    }

    await inputHandle.click({ clickCount: 3 });
    await inputHandle.type(query, { delay: 35 });

    if (sel.submit) {
      const btn = await page.$(sel.submit);
      if (btn) await btn.click();
      else await inputHandle.press('Enter');
    } else {
      await inputHandle.press('Enter');
    }

    await page.waitForTimeout(2200);
    return { success: true, method: 'typed', query, url: page.url(), title: await page.title() };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function typeText(selector, text) {
  const page = _ctrlPage;
  if (!page) return { success: false, error: 'No active browser session.' };
  try {
    const el = await page.waitForSelector(selector, { timeout: 5000 });
    await el.click({ clickCount: 3 });
    await el.type(text, { delay: 35 });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function clickElement(selector) {
  const page = _ctrlPage;
  if (!page) return { success: false, error: 'No active browser session.' };
  try {
    const el = await page.waitForSelector(selector, { timeout: 5000 });
    await el.click();
    await page.waitForTimeout(800);
    return { success: true, url: page.url() };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function findAndClick(visibleText) {
  const page = _ctrlPage;
  if (!page) return { success: false, error: 'No active browser session.' };
  try {
    const selectors = [
      'text="' + visibleText + '"',
      'button:has-text("' + visibleText + '")',
      'a:has-text("' + visibleText + '")',
      '[aria-label="' + visibleText + '"]',
      '[title="' + visibleText + '"]',
    ];
    for (const sel of selectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          await el.click();
          await page.waitForTimeout(1000);
          return { success: true, found: sel, url: page.url() };
        }
      } catch (_) { }
    }
    return { success: false, error: 'Could not find element with text: "' + visibleText + '"' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function fillAndSubmit(selector, text) {
  const page = _ctrlPage;
  if (!page) return { success: false, error: 'No active browser session.' };
  try {
    const el = await page.waitForSelector(selector, { timeout: 5000 });
    await el.click({ clickCount: 3 });
    await el.type(text, { delay: 35 });
    await el.press('Enter');
    await page.waitForTimeout(2000);
    return { success: true, url: page.url() };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function goBack() {
  const page = _ctrlPage;
  if (!page) return { success: false, error: 'No active browser session.' };
  try {
    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 });
    return { success: true, url: page.url(), title: await page.title() };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function goForward() {
  const page = _ctrlPage;
  if (!page) return { success: false, error: 'No active browser session.' };
  try {
    await page.goForward({ waitUntil: 'domcontentloaded', timeout: 10000 });
    return { success: true, url: page.url(), title: await page.title() };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function refreshPage() {
  const page = _ctrlPage;
  if (!page) return { success: false, error: 'No active browser session.' };
  try {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
    return { success: true, url: page.url(), title: await page.title() };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function readCurrentPage() {
  const page = _ctrlPage;
  if (!page) return { success: false, error: 'No active browser session.' };
  try {
    await page.waitForTimeout(600);
    const text = await page.evaluate(() => {
      document.querySelectorAll('script,style,nav,footer,header').forEach(el => el.remove());
      const main = document.querySelector('article,main,[role="main"],.content');
      return (main || document.body).innerText || '';
    });
    const title = await page.title();
    const cleaned = text.replace(/\n{3,}/g, '\n\n').trim();
    return {
      success: true, title, url: page.url(),
      text: cleaned.length > MAX_TEXT_CHARS ? cleaned.slice(0, MAX_TEXT_CHARS) + '\n\n[... truncated]' : cleaned,
      charCount: cleaned.length,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function screenshotPage() {
  const page = _ctrlPage;
  if (!page || page.isClosed()) return { success: false, error: 'No active browser session.' };
  try {
    const buffer = await page.screenshot({ type: 'jpeg', quality: 70 });
    const base64 = buffer.toString('base64');
    return {
      success: true,
      image: 'data:image/jpeg;base64,' + base64,
      url: page.url(),
      title: await page.title(),
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function getSessionStatus() {
  const open = !!(_ctrlBrowser && _ctrlPage && !_ctrlPage.isClosed());
  return {
    open,
    url: open ? _ctrlPage.url() : null,
    title: open ? await _ctrlPage.title().catch(() => null) : null,
  };
}

async function closeBrowser() {
  await closeHeadless();
  await closeControlled();
}

module.exports = {
  // Headless
  scrapeUrl, searchWeb,
  // Controlled visible
  navigateTo, smartSearch, typeText, clickElement,
  findAndClick, fillAndSubmit, goBack, goForward,
  refreshPage, readCurrentPage, screenshotPage, getSessionStatus, closeControlled,
  // Utilities
  closeBrowser, findBrowserPath,
};