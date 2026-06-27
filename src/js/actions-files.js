'use strict';
  const noteDesktopOutcome = (...args) => window.hexActionHelpers?.noteDesktopOutcome?.(...args);


window.hexFileActionHandler = (() => {
  function findLearnedAliasPath(kind, query = '') {
    const q = String(query || '').trim().toLowerCase();
    if (!q || !Array.isArray(window.hexMemory?.nodes)) return null;
    const prefix = `${kind}_alias:`;
    const exact = window.hexMemory.nodes.find((node) => {
      const content = String(node?.content || '').trim();
      if (!content.toLowerCase().startsWith(prefix)) return false;
      const match = content.match(new RegExp(`^${kind}_alias:([^=]+)=(.+)$`, 'i'));
      return match && match[1].trim().toLowerCase() === q && match[2].trim();
    });
    if (!exact) return null;
    const match = String(exact.content || '').match(new RegExp(`^${kind}_alias:([^=]+)=(.+)$`, 'i'));
    return match?.[2]?.trim() || null;
  }

  function findLearnedPlaylistPath(query = '') {
    return findLearnedAliasPath('playlist', query);
  }

  function findLearnedFilePath(query = '') {
    return findLearnedAliasPath('file', query);
  }

  function publishFileCandidates(files) {
    return window.hexCandidatePublishers?.publishFiles(files) || [];
  }

  async function handle(action) {
    switch (action.type) {
      case 'find_files': {
        const qParams = action.args.join(' ').trim().split(':');
        const query = (qParams[0] || '').trim();
        const category = (qParams.length > 1 ? qParams[1].trim() : '');
        if (query) {
          addLog('BUTLER', `Searching PC for files: ${query} ${category ? '(' + category + ')' : ''}`);
          addHexMessage(`*Scanning all drives for "**${query}**"...* 🔍`);
          const r = await window.hexAPI.butler.findFiles(query, category);
          if (r && r.success) {
            if (r.count > 0) {
              publishFileCandidates(r.files);
              window.hexPcEntityMemory?.ingest?.((r.files || []).map(function (f) { return {
                kind: 'file',
                label: f.name || String(f.path || '').split(/[\/]/).pop() || '',
                path: f.path || null,
                value: f.path || f.name || '',
                meta: { sourceQuery: query, category: category || '', targetType: 'file' }
              }; }), 'file', 1.2);
              const folderCandidates = r.files.map(function (f) {
                const folderPath = f.path.substring(0, Math.max(f.path.lastIndexOf('\\'), f.path.lastIndexOf('/')));
                return { name: folderPath.split(/[\\/]/).pop() || folderPath, path: folderPath, value: folderPath, meta: { targetType: 'folder', sourceQuery: query } };
              }).filter(function (f) { return f.path; });
              window.hexCandidatePublishers?.publishFolders?.(folderCandidates);
              let msg = `**Found ${r.count} result(s) for "${query}":**\n\n`;
              const actions = [];
              r.files.forEach(f => {
                const sizeMB = (f.size / (1024 * 1024)).toFixed(1);
                const folderPath = f.path.substring(0, Math.max(f.path.lastIndexOf('\\'), f.path.lastIndexOf('/')));
                msg += `- 📄 **${f.name}** (${sizeMB} MB)\n  \`${f.path}\`\n\n`;
                actions.push(
                  { label: `Open: ${f.name}`, kind: 'openFile', path: f.path },
                  { label: `Locate: ${f.name}`, kind: 'openFolder', path: folderPath }
                );
              });
              addHexMessage(msg, { actions });
            } else {
              addHexMessage(`I couldn't find any files matching "**${query}**" on your PC.`);
            }
          } else {
            addHexMessage(`Something went wrong while searching: ${r.error}`);
          }
        }
        return { handled: true };
      }

      case 'create_file': {
        if (action.args[0]) {
          const content = action.args.slice(1).join(':');
          const fileResult = await window.hexAPI.butler.createFile(action.args[0], content);
          if (fileResult.success) {
            addLog('BUTLER', `Created file: ${fileResult.path}`);
            addHexMessage(`**File created** on your Desktop: \`${action.args[0]}\``);
            if (window.hexMemory) window.hexMemory.recordActionOutcome(`create_file:${action.args[0]}`, true);
          } else {
            addLog('BUTLER', `File creation failed: ${fileResult.error}`, 'error');
            if (window.hexMemory) window.hexMemory.recordActionOutcome(`create_file:${action.args[0]}`, false, fileResult.error);
          }
        }
        return { handled: true };
      }

      case 'create_doc': {
        if (action.args[0]) {
          const docContent = action.args.slice(1).join(':');
          const docResult = await window.hexAPI.butler.createDoc(action.args[0], docContent);
          if (docResult.success) {
            addLog('BUTLER', `Created document: ${docResult.path}`);
            addHexMessage(`**Document created** on your Desktop: \`${action.args[0]}\`${docResult.format === 'rtf' ? ' (RTF format)' : ''}`);
            if (window.hexMemory) window.hexMemory.recordActionOutcome(`create_doc:${action.args[0]}`, true);
          } else {
            addLog('BUTLER', `Document creation failed: ${docResult.error}`, 'error');
            if (window.hexMemory) window.hexMemory.recordActionOutcome(`create_doc:${action.args[0]}`, false, docResult.error);
          }
        }
        return { handled: true };
      }

      case 'open_folder': {
        if (action.args[0]) {
          const p = action.args.join(':');
          const folderResult = await window.hexAPI.butler.openFolder(p);
          if (folderResult.success) {
            addLog('BUTLER', `Opened folder: ${folderResult.path}`);
            const recentFolder = {
              kind: 'folder',
              label: folderResult.path || p,
              path: folderResult.path || p,
              value: folderResult.path || p,
              meta: { targetType: 'folder' }
            };
            noteDesktopOutcome(recentFolder, 'folder', true);
            if (window.hexMemory) window.hexMemory.recordActionOutcome(`open_folder:${p}`, true);
          } else {
            addLog('BUTLER', `Folder error: ${folderResult.error}`, 'error');
            noteDesktopOutcome({
              kind: 'folder',
              label: p,
              path: p,
              value: p,
              meta: { targetType: 'folder', source: 'open-folder' }
            }, 'folder', false, folderResult.error || '');
            if (window.hexMemory) window.hexMemory.recordActionOutcome(`open_folder:${p}`, false, folderResult.error);
          }
        }
        return { handled: true };
      }

      case 'open_playlist': {
        const query = action.args.join(' ').trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '');
        if (!query) return { handled: true };
        const learnedPath = findLearnedPlaylistPath(query);
        if (learnedPath) {
          addLog('BUTLER', `Opening learned playlist alias: ${query} -> ${learnedPath}`);
          const learnedOpen = await window.hexAPI.butler.openFile(learnedPath);
          if (learnedOpen?.success) {
            addHexMessage(`**Opening playlist:** ${query}`);
            noteDesktopOutcome({
              kind: 'file',
              label: query,
              path: learnedOpen.path || learnedPath,
              value: learnedOpen.path || learnedPath,
              meta: { targetType: 'playlist', source: 'playlist-alias-memory', exact: true }
            }, 'file', true);
            return { handled: true };
          }
          addLog('BUTLER', `Learned playlist alias failed, falling back to search: ${learnedOpen?.error || 'unknown error'}`, 'warn');
        }

        addLog('BUTLER', `Searching playlists for: ${query}`);
        const result = await window.hexAPI.butler.findFiles(query, 'music');
        const files = Array.isArray(result?.files) ? result.files : [];
        const normalizedQuery = query.toLowerCase().replace(/\.(xspf|m3u8?|pls|wpl)$/i, '').trim();
        const playlistFiles = files.filter((file) => /\.(xspf|m3u8?|pls|wpl)$/i.test(file?.path || file?.name || ''));
        const exact = playlistFiles.find((file) => {
          const base = String(file.name || file.path || '').split(/[\\/]/).pop().replace(/\.(xspf|m3u8?|pls|wpl)$/i, '').toLowerCase();
          return base === normalizedQuery;
        });
        const contains = playlistFiles.find((file) => {
          const base = String(file.name || file.path || '').split(/[\\/]/).pop().replace(/\.(xspf|m3u8?|pls|wpl)$/i, '').toLowerCase();
          return base.includes(normalizedQuery) || normalizedQuery.includes(base);
        });
        const picked = exact || contains || playlistFiles[0] || files[0] || null;
        if (!picked?.path) {
          addHexMessage(`I couldn't find a playlist named **${query}** in your Music library.`);
          addLog('BUTLER', `Playlist not found: ${query}`, 'error');
          return { handled: true };
        }
        const openResult = await window.hexAPI.butler.openFile(picked.path);
        if (openResult?.success) {
          addLog('BUTLER', `Opened playlist: ${openResult.path || picked.path}`);
          addHexMessage(`**Opening playlist:** ${picked.name || query}`);
          noteDesktopOutcome({
            kind: 'file',
            label: picked.name || query,
            path: openResult.path || picked.path,
            value: openResult.path || picked.path,
            meta: { targetType: 'playlist', source: 'playlist-search', exact: picked === exact }
          }, 'file', true);
        } else {
          addHexMessage(`**Could not open playlist** "${query}". ${openResult?.error || ''}`);
          addLog('BUTLER', `Playlist open failed: ${query} - ${openResult?.error || ''}`, 'error');
        }
        return { handled: true };
      }
      case 'open_file': {
        if (action.args[0]) {
          const p = action.args.join(':');
          const learnedPath = findLearnedFilePath(p);
          const targetPath = learnedPath || p;
          if (learnedPath) addLog('BUTLER', `Opening learned file alias: ${p} -> ${learnedPath}`);
          const openResult = await window.hexAPI.butler.openFile(targetPath);
          if (openResult.success) {
            addLog('BUTLER', `Opened file: ${openResult.path}`);
            const recentFile = {
              kind: 'file',
              label: learnedPath ? p : String(openResult.path || p).split(/[\\/]/).pop(),
              path: openResult.path || targetPath,
              value: openResult.path || targetPath,
              meta: { targetType: 'file', source: learnedPath ? 'file-alias-memory' : 'open-file', exact: !!learnedPath }
            };
            noteDesktopOutcome(recentFile, 'file', true);
            if (window.hexMemory) window.hexMemory.recordActionOutcome(`open_file:${targetPath}`, true);
          } else {
            addLog('BUTLER', `File error: ${openResult.error}`, 'error');
            noteDesktopOutcome({
              kind: 'file',
              label: String(targetPath).split(/[\\/]/).pop() || targetPath,
              path: targetPath,
              value: targetPath,
              meta: { targetType: 'file', source: learnedPath ? 'file-alias-memory' : 'open-file', exact: !!learnedPath }
            }, 'file', false, openResult.error || '');
            if (window.hexMemory) window.hexMemory.recordActionOutcome(`open_file:${targetPath}`, false, openResult.error);
          }
        }
        return { handled: true };
      }

      case 'copy': {
        const [src, ...dParts] = action.args;
        const dest = dParts.join(':');
        const r = await window.hexAPI.butler.copy(src, dest);
        addLog('BUTLER', r.success ? `Copied to ${r.dest}` : `Copy failed: ${r.error}`);
        if (r.success) {
          addHexMessage(`**Copied** to \`${r.dest}\``);
          if (window.hexMemory) window.hexMemory.recordActionOutcome(`copy:${src}`, true);
        } else if (window.hexMemory) {
          window.hexMemory.recordActionOutcome(`copy:${src}`, false, r.error);
        }
        return { handled: true };
      }

      case 'move': {
        const [src, ...dParts] = action.args;
        const dest = dParts.join(':');
        const r = await window.hexAPI.butler.move(src, dest);
        addLog('BUTLER', r.success ? `Moved to ${r.dest}` : `Move failed: ${r.error}`);
        if (r.success) {
          addHexMessage(`**Moved** to \`${r.dest}\``);
          if (window.hexMemory) window.hexMemory.recordActionOutcome(`move:${src}`, true);
        } else if (window.hexMemory) {
          window.hexMemory.recordActionOutcome(`move:${src}`, false, r.error);
        }
        return { handled: true };
      }

      case 'delete': {
        const target = action.args.join(':');
        const r = await window.hexAPI.butler.delete(target, false);
        addLog('BUTLER', r.success ? `Deleted: ${target}` : `Delete: ${r.error}`);
        if (window.hexMemory) window.hexMemory.recordActionOutcome(`delete:${target}`, !!r.success, r.success ? '' : r.error);
        return { handled: true };
      }

      case 'delete_perm': {
        const target = action.args.join(':');
        const r = await window.hexAPI.butler.delete(target, true);
        addLog('BUTLER', r.success ? `Permanently deleted: ${target}` : `Delete: ${r.error}`);
        if (window.hexMemory) window.hexMemory.recordActionOutcome(`delete_perm:${target}`, !!r.success, r.success ? '' : r.error);
        return { handled: true };
      }

      case 'rename': {
        const target = action.args[0];
        const r = await window.hexAPI.butler.rename(target, action.args[1]);
        addLog('BUTLER', r.success ? `Renamed to ${r.path}` : `Rename: ${r.error}`);
        if (r.success) {
          addHexMessage(`**Renamed** to \`${r.path}\``);
          if (window.hexMemory) window.hexMemory.recordActionOutcome(`rename:${target}`, true);
        } else if (window.hexMemory) {
          window.hexMemory.recordActionOutcome(`rename:${target}`, false, r.error);
        }
        return { handled: true };
      }

      case 'create_folder': {
        const folderPath = action.args.join(':');
        const r = await window.hexAPI.butler.createFolder(folderPath);
        addLog('BUTLER', r.success ? `Folder created: ${r.path}` : `Folder: ${r.error}`);
        if (r.success) {
          addHexMessage(`**Folder created:** \`${r.path}\``);
          if (window.hexMemory) window.hexMemory.recordActionOutcome(`create_folder:${folderPath}`, true);
        } else if (window.hexMemory) {
          window.hexMemory.recordActionOutcome(`create_folder:${folderPath}`, false, r.error);
        }
        return { handled: true };
      }

      case 'list_dir': {
        const targetDir = action.args.join(':') || 'desktop';
        const r = await window.hexAPI.butler.listDir(targetDir);
        if (r.success) {
          const dirs = r.items.filter(function (i) { return i.type === 'dir'; }).map(function (i) { return '[DIR] ' + i.name; });
          window.hexCandidatePublishers?.publishFolders?.((r.items || []).filter(function (i) { return i.type === 'dir'; }).map(function (i) { return { name: i.name, path: i.path || [r.path, i.name].join(/[\\/]$/.test(r.path) ? '' : '\\'), value: i.path || [r.path, i.name].join(/[\\/]$/.test(r.path) ? '' : '\\'), meta: { parent: r.path, targetType: 'folder' } }; }));
          const files = r.items.filter(function (i) { return i.type === 'file'; }).map(function (i) { return '[FILE] ' + i.name; });
          const preview = dirs.slice(0, 8).concat(files.slice(0, 8));
          const more = r.count > 16 ? ('..and ' + (r.count - 16) + ' more') : '';
          addHexMessage('**' + r.path + '** - ' + r.count + ' items\n' + preview.join('\n') + more);
          const listedFolder = {
            kind: 'folder',
            label: String(r.path || targetDir).split(/[\\/]/).pop() || (r.path || targetDir),
            path: r.path || targetDir,
            value: r.path || targetDir,
            meta: { targetType: 'folder', listedAt: Date.now() }
          };
          noteDesktopOutcome(listedFolder, 'folder', true);
          addLog('BUTLER', 'Listed ' + r.count + ' items in ' + r.path);
          if (window.hexMemory) window.hexMemory.recordActionOutcome(`list_dir:${targetDir}`, true);
        } else {
          addHexMessage('Could not list directory: ' + r.error);
          noteDesktopOutcome({
            kind: 'folder',
            label: String(targetDir || 'desktop').split(/[\/]/).pop() || targetDir || 'desktop',
            path: targetDir,
            value: targetDir,
            meta: { targetType: 'folder', source: 'list-dir' }
          }, 'folder', false, r.error || '');
          if (window.hexMemory) window.hexMemory.recordActionOutcome(`list_dir:${targetDir}`, false, r.error);
        }
        return { handled: true };
      }

      case 'file_info': {
        const filePath = action.args.join(':');
        const r = await window.hexAPI.butler.fileInfo(filePath);
        if (r.success) {
          addHexMessage(`**${filePath}**\nSize: ${r.sizeHuman}\nType: ${r.isDir ? 'Folder' : 'File'}\nModified: ${r.modified}`);
          if (window.hexMemory) window.hexMemory.recordActionOutcome(`file_info:${filePath}`, true);
        } else {
          addHexMessage(`File info error: ${r.error}`);
          if (window.hexMemory) window.hexMemory.recordActionOutcome(`file_info:${filePath}`, false, r.error);
        }
        return { handled: true };
      }

      case 'find_file': {
        const fileName = action.args[0];
        const searchRoot = action.args.slice(1).join(':') || 'C:\\Users';
        addHexMessage(`Searching for **${fileName}** in \`${searchRoot}\`…`);
        const r = await window.hexAPI.butler.findFile(fileName, searchRoot);
        if (r.success) addHexMessage('**Found:**\n```\n' + r.output.substring(0, 800) + '\n```');
        else addHexMessage('Search failed: ' + r.error);
        return { handled: true };
      }

      case 'grep_file': {
        const pattern = action.args[0];
        const filePath = action.args.slice(1).join(':');
        const r = await window.hexAPI.butler.grepFile(pattern, filePath);
        if (r.success) addHexMessage('**Grep match:**\n```\n' + r.output.substring(0, 800) + '\n```');
        else addHexMessage('Grep failed: ' + r.error);
        return { handled: true };
      }

      case 'zip': {
        const src = action.args[0];
        const out = action.args[1] || src + '.zip';
        if (!src) {
          addHexMessage('Specify a source path to zip.');
          return { handled: true };
        }
        addHexMessage('Compressing **' + src + '**…');
        const r = await window.hexAPI.butler.zip(src, out);
        if (r.success) addHexMessage('**Zipped** to `' + (r.output || out) + '`');
        else addHexMessage('Zip failed: ' + r.error);
        addLog('BUTLER', r.success ? 'Zipped: ' + (r.output || out) : 'Zip error: ' + r.error);
        return { handled: true };
      }

      case 'unzip': {
        const zipPath = action.args[0];
        const dest = action.args[1] || '';
        if (!zipPath) {
          addHexMessage('Specify an archive path to extract.');
          return { handled: true };
        }
        addHexMessage('Extracting **' + zipPath + '**…');
        const r = await window.hexAPI.butler.unzip(zipPath, dest);
        if (r.success) addHexMessage('**Extracted** to `' + r.dest + '`');
        else addHexMessage('Unzip failed: ' + r.error);
        addLog('BUTLER', r.success ? 'Unzipped to: ' + r.dest : 'Unzip error: ' + r.error);
        return { handled: true };
      }

      case 'clean_temp': {
        const r = await window.hexAPI.butler.cleanTemp();
        addLog('BUTLER', r.success ? `Temp cleaned: ${r.freed || 'unknown'} freed` : r.error);
        if (r.success) {
          const detail = r.count != null
            ? ` ${r.count} items removed${r.skipped != null ? `, ${r.skipped} skipped` : ''}.`
            : '.';
          addHexMessage(`**Temp files cleaned:**${r.freed ? ' ' + r.freed + ' freed,' : ''}${detail}`);
        } else {
          addHexMessage(`Clean temp failed: ${r.error}`);
        }
        return { handled: true };
      }
    }

    return { handled: false };
  }

  return { handle, publishFileCandidates };
})();
