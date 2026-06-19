'use strict';

window.hexBrowserActionHandler = (() => {
  async function handle(action) {
    const helpers = window.hexActionHelpers;
    if (!helpers) return { handled: false };

    switch (action.type) {
      case 'browser_open': {
        const bUrl = action.args.join(':').trim();
        if (bUrl) {
          const r = await window.hexAPI.browser.open(bUrl);
          if (r?.success) {
            addHexMessage(`🌐 Opened: ${r.url || bUrl}`);
            if (window.hexBrain) window.hexBrain.recordOutcome(`browser_open:${bUrl}`, true);
          } else {
            addHexMessage(`Browser open failed: ${r?.error || 'Unknown error'}`);
            if (window.hexBrain) window.hexBrain.recordOutcome(`browser_open:${bUrl}`, false, r?.error || '');
          }
        }
        return { handled: true };
      }

      case 'browser_search': {
        const query = action.args.join(' ').trim();
        if (query) {
          addHexMessage(`🔍 Searching the web for: "${query}"...`);
          try {
            const r = await window.hexAPI.browser.search(query);
            if (r.success && r.results.length > 0) {
              let msg = `**Web Results for "${query}":**\n\n`;
              if (r.featured) msg += `> ${r.featured}\n\n`;
              for (const item of r.results) {
                msg += `• **${item.title}**\n  ${item.snippet}\n  [${item.url}](${item.url})\n\n`;
              }
              addHexMessage(msg);
              const context = r.results.map(i => `${i.title}: ${i.snippet}`).join('\n');
              return { handled: true, result: { data: `Web search results for "${query}":\n${r.featured ? 'Featured: ' + r.featured + '\n' : ''}${context}` } };
            }
            addHexMessage(`No results found for "${query}".`);
          } catch (e) {
            const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
            await window.hexAPI.browser.open(searchUrl);
            addHexMessage(`**Opened Google in browser:** ${query}`);
          }
        }
        return { handled: true };
      }

      case 'web_navigate': {
        const url = action.args.join(':').trim();
        if (!url) return { handled: true };
        helpers.autoEnableWebVision();
        addHexMessage(`🌐 Navigating to **${url}**...`);
        const r = await window.hexAPI.browser.navigate(url);
        if (r.success) {
          addHexMessage(`✅ Opened: **${r.title || r.url}**`);
          await helpers.refreshBrowserReferenceCandidates('after navigation');
          const visionCtx = await helpers.captureWebVision('after navigation');
          if (visionCtx) return { handled: true, result: { data: `Navigated to ${r.title} (${r.url}). ${visionCtx}` } };
        } else {
          addHexMessage(`❌ Navigation failed: ${r.error}`);
        }
        return { handled: true };
      }

      case 'web_search': {
        const parts = action.args;
        let siteUrl = null;
        let query = '';
        if (parts[0] && /^https?:\/\/|^\w+\.\w+/.test(parts[0])) {
          siteUrl = parts[0];
          query = parts.slice(1).join(' ').trim();
        } else {
          query = parts.join(' ').trim();
        }
        if (!query) return { handled: true };
        helpers.autoEnableWebVision();
        const label = siteUrl ? `**${new URL(siteUrl.startsWith('http') ? siteUrl : 'https://' + siteUrl).hostname}**` : 'current page';
        addHexMessage(`🔍 Searching ${label} for: **${query}**...`);
        const r = await window.hexAPI.browser.smartSearch(query, siteUrl);
        if (r.success) {
          addHexMessage(`✅ Search done — page: **${r.title || r.url}**`);
          await helpers.refreshBrowserReferenceCandidates(`after search "${query}"`);
          const visionCtx = await helpers.captureWebVision(`search results for "${query}"`);
          if (visionCtx) {
            return { handled: true, result: { data: `Browser searched for "${query}" — now on page: ${r.title} (${r.url}). ${visionCtx}` } };
          }

          const currentUrl = r.url || '';
          if (currentUrl.includes('youtube.com')) {
            addHexMessage(`▶️ Clicking first video result...`);
            const playResult = await window.hexAPI.browser.click('ytd-video-renderer a#video-title')
              .catch(() => window.hexAPI.browser.click('a#video-title'))
              .catch(() => window.hexAPI.browser.click('ytd-video-renderer a'))
              .catch(() => null);
            if (playResult && playResult.success) {
              addHexMessage(`🎵 Now playing!`);
            }
          }

          return { handled: true, result: { data: `Browser searched for "${query}" — now on page: ${r.title} (${r.url})` } };
        } else {
          addHexMessage(`❌ Search failed: ${r.error}`);
        }
        return { handled: true };
      }

      case 'web_click': {
        const selector = action.args.join(':').trim();
        if (!selector) return { handled: true };
        const r = await window.hexAPI.browser.click(selector);
        if (r.success) addHexMessage(`✅ Clicked: \`${selector}\``);
        else addHexMessage(`❌ Click failed: ${r.error}`);
        return { handled: true };
      }

      case 'web_find_click': {
        let text = action.args.join(' ').trim();
        if (!text) return { handled: true };
        try {
          const st = await window.hexAPI.browser.status();
          if (st.open && st.url && st.url.includes('youtube.com/watch')) return { handled: true };
        } catch (_) { }
        const resolvedRef = window.hexContextState?.resolveReference?.(text, 'browser');
        if (resolvedRef?.label || resolvedRef?.text) {
          addLog('WEB', `Resolved browser reference "${text}" -> "${resolvedRef.label || resolvedRef.text}"`);
          text = resolvedRef.label || resolvedRef.text;
        }
        addHexMessage(`🖱 Clicking: **${text}**...`);
        const r = await window.hexAPI.browser.findClick(text);
        if (r.success) {
          addHexMessage(`✅ Clicked "${text}"`);
          if (resolvedRef) window.hexContextState.state.lastResolvedReference = { ...resolvedRef };
          await helpers.refreshBrowserReferenceCandidates(`after clicking "${text}"`);
          const visionCtx = await helpers.captureWebVision(`after clicking "${text}"`);
          if (visionCtx) return { handled: true, result: { data: `Clicked "${text}". ${visionCtx}` } };
        } else {
          addHexMessage(`❌ Could not click "${text}": ${r.error}`);
        }
        return { handled: true };
      }

      case 'web_type': {
        const selector = action.args[0] || '';
        const text = action.args.slice(1).join(':').trim();
        if (!selector || !text) return { handled: true };
        const r = await window.hexAPI.browser.type(selector, text);
        if (r.success) addHexMessage(`⌨️ Typed into \`${selector}\``);
        else addHexMessage(`❌ Type failed: ${r.error}`);
        return { handled: true };
      }

      case 'web_back': {
        const r = await window.hexAPI.browser.back();
        if (r.success) {
          addHexMessage(`⬅️ Back — now on: **${r.title || r.url}**`);
          await helpers.refreshBrowserReferenceCandidates('after back');
          const visionCtx = await helpers.captureWebVision('after going back');
          if (visionCtx) return { handled: true, result: { data: `Went back to ${r.title} (${r.url}). ${visionCtx}` } };
        } else addHexMessage(`❌ Back failed: ${r.error}`);
        return { handled: true };
      }

      case 'web_forward': {
        const r = await window.hexAPI.browser.forward();
        if (r.success) {
          addHexMessage(`➡️ Forward — now on: **${r.title || r.url}**`);
          await helpers.refreshBrowserReferenceCandidates('after forward');
        } else addHexMessage(`❌ Forward failed: ${r.error}`);
        return { handled: true };
      }

      case 'web_refresh': {
        const r = await window.hexAPI.browser.refresh();
        if (r.success) {
          addHexMessage(`🔄 Page refreshed: **${r.title}**`);
          await helpers.refreshBrowserReferenceCandidates('after refresh');
        } else addHexMessage(`❌ Refresh failed: ${r.error}`);
        return { handled: true };
      }

      case 'web_read': {
        addHexMessage(`📖 Reading current page...`);
        const r = await window.hexAPI.browser.readPage();
        if (r.success) {
          addHexMessage(`✅ Read **${r.title}** (${r.charCount} chars)`);
          await helpers.refreshBrowserReferenceCandidates('after read');
          return { handled: true, result: { data: `Current page content — ${r.title} (${r.url}):\n\n${r.text}` } };
        } else {
          addHexMessage(`❌ Read failed: ${r.error}`);
        }
        return { handled: true };
      }

      case 'web_close': {
        await window.hexAPI.browser.close();
        window._webVisionData = null;
        window._webVisionMeta = null;
        addHexMessage(`🔌 Browser session closed.`);
        return { handled: true };
      }

      case 'web_look': {
        helpers.autoEnableWebVision();
        addHexMessage(`👁 Looking at browser...`);
        const visionCtx = await helpers.captureWebVision('user requested visual inspection');
        if (visionCtx) {
          addHexMessage(`✅ Screenshot captured — analyzing...`);
          await helpers.refreshBrowserReferenceCandidates('after look');
          return { handled: true, result: { data: visionCtx } };
        } else {
          addHexMessage(`❌ No active browser session or screenshot failed.`);
        }
        return { handled: true };
      }
    }

    return { handled: false };
  }

  return { handle };
})();
