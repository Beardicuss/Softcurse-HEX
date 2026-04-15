'use strict';
// ── HEX Web Sub-Agent: Headless browser for scraping & searching ─────────────
// Uses playwright-core with system Chromium/Edge for zero-download operation.

const { chromium } = require('playwright-core');
const path = require('path');

let _browser = null;
let _idleTimer = null;
const IDLE_TIMEOUT = 30000; // close browser after 30s of inactivity
const MAX_TEXT_CHARS = 4000; // limit text to avoid overloading LLM context

// Find a system browser (Edge on Windows, Chrome, or Chromium)
function findBrowserPath() {
    const candidates = [
        // Windows Edge (most common)
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        // Windows Chrome
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        // User-level Chrome
        path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ];
    const fs = require('fs');
    for (const p of candidates) {
        if (p && fs.existsSync(p)) return p;
    }
    return null;
}

async function getBrowser() {
    // Reset idle timer
    if (_idleTimer) clearTimeout(_idleTimer);
    _idleTimer = setTimeout(closeBrowser, IDLE_TIMEOUT);

    if (_browser && _browser.isConnected()) return _browser;

    const execPath = findBrowserPath();
    if (!execPath) throw new Error('No system browser found (Edge/Chrome). Install one to enable web browsing.');

    _browser = await chromium.launch({
        executablePath: execPath,
        headless: true,
        args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
    });
    return _browser;
}

async function closeBrowser() {
    if (_browser) {
        try { await _browser.close(); } catch (_) { }
        _browser = null;
    }
}

// ── Scrape a URL and return clean text ───────────────────────────────────────
async function scrapeUrl(url) {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        // Wait a bit for dynamic content
        await page.waitForTimeout(1500);

        // Extract main text content
        const text = await page.evaluate(() => {
            // Remove scripts, styles, nav, footer, ads
            const remove = document.querySelectorAll('script, style, nav, footer, header, iframe, [role="navigation"], [role="banner"], .ad, .ads, .advertisement');
            remove.forEach(el => el.remove());

            // Try to find article/main content first
            const main = document.querySelector('article, main, [role="main"], .content, .post, .entry');
            const target = main || document.body;
            return target.innerText || target.textContent || '';
        });

        const title = await page.title();
        const cleaned = text.replace(/\n{3,}/g, '\n\n').trim();
        const truncated = cleaned.length > MAX_TEXT_CHARS
            ? cleaned.substring(0, MAX_TEXT_CHARS) + '\n\n[... truncated]'
            : cleaned;

        return { success: true, title, url, text: truncated, charCount: cleaned.length };
    } catch (err) {
        return { success: false, error: err.message, url };
    } finally {
        await page.close();
    }
}

// ── Google Search and extract results ────────────────────────────────────────
async function searchWeb(query) {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(1500);

        const results = await page.evaluate(() => {
            const items = [];
            // Google search result containers
            const resultEls = document.querySelectorAll('div.g, div[data-sokoban-container]');
            for (const el of resultEls) {
                if (items.length >= 5) break;
                const linkEl = el.querySelector('a[href^="http"]');
                const titleEl = el.querySelector('h3');
                const snippetEl = el.querySelector('.VwiC3b, [data-snf], .st, span[style*="-webkit-line-clamp"]');
                if (linkEl && titleEl) {
                    items.push({
                        title: titleEl.textContent.trim(),
                        url: linkEl.href,
                        snippet: snippetEl ? snippetEl.textContent.trim() : ''
                    });
                }
            }
            return items;
        });

        // Also get the featured snippet if present
        const featured = await page.evaluate(() => {
            const box = document.querySelector('.hgKElc, .IZ6rdc, [data-attrid="wa:/description"]');
            return box ? box.textContent.trim() : null;
        });

        return { success: true, query, results, featured, count: results.length };
    } catch (err) {
        return { success: false, error: err.message, query };
    } finally {
        await page.close();
    }
}

module.exports = { scrapeUrl, searchWeb, closeBrowser, findBrowserPath };
