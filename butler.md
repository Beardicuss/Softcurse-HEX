# PC Butler Actions for HEX (Windows Edition)

> **Note:** Dangerous actions (marked with ⚠️) will always show a **confirmation dialog** before executing.

## 📁 File & Folder Management

| Action | AI Tag | What It Does | Danger |
|--------|--------|--------------|--------|
| Copy file/folder | `[ACTION:copy:SOURCE:DEST]` | `fs.copyFileSync` / `shell.moveItem` | Low |
| Move file/folder | `[ACTION:move:SOURCE:DEST]` | `fs.renameSync` | Low |
| Delete file/folder (to trash) | `[ACTION:delete:ITEM]` | `shell.trashItem` | Medium (⚠️ confirm) |
| Permanently delete | `[ACTION:delete_perm:ITEM]` | `fs.unlinkSync` / `fs.rmdirSync` | High (⚠️ confirm) |
| Rename file/folder | `[ACTION:rename:OLD:NEW]` | `fs.renameSync` | Low |
| Create folder | `[ACTION:create_folder:PATH]` | `fs.mkdirSync` (recursive) | Low |
| List directory contents | `[ACTION:list_dir:PATH]` | `fs.readdirSync` | Low |
| Get file properties | `[ACTION:file_info:PATH]` | size, dates, permissions | Low |
| Zip / compress | `[ACTION:zip:SOURCE:OUTPUT]` | `adm-zip` or native | Low |
| Unzip | `[ACTION:unzip:ZIP:DEST]` | extract archive | Low |

## ⚙️ Process & System

| Action | AI Tag | What It Does | Danger |
|--------|--------|--------------|--------|
| List running processes | `[ACTION:list_processes]` | `tasklist` | Low |
| Kill process by name | `[ACTION:kill_process:NAME]` | `taskkill /IM name.exe` | High (⚠️ confirm) |
| Kill process by PID | `[ACTION:kill_pid:PID]` | `taskkill /PID` | High (⚠️ confirm) |
| Start program with args | `[ACTION:run:CMD:ARGS]` | `exec()` | Medium |
| Run as admin (UAC) | `[ACTION:run_as_admin:CMD]` | `runas` / `sudo-prompt` | High (⚠️ confirm) |
| Get system info | `[ACTION:sys_info]` | OS, RAM, CPU, hostname, uptime | Low |
| Get battery status | `[ACTION:battery]` | percentage, charging, time left | Low |
| Get disk space | `[ACTION:disk_usage:PATH]` | free/total GB | Low |
| Open task manager | `[ACTION:open_taskmgr]` | `start taskmgr` | Low |
| Open system settings | `[ACTION:open_settings]` | `ms-settings:` URI | Low |

## 🪟 Window & UI

| Action | AI Tag | What It Does | Danger |
|--------|--------|--------------|--------|
| List open windows | `[ACTION:list_windows]` | via `win32` or `powershell` | Low |
| Focus/minimize/maximize window | `[ACTION:window:ACTION:TITLE]` | e.g., `minimize:Notepad` | Low |
| Close window | `[ACTION:close_window:TITLE]` | send `WM_CLOSE` | Medium |
| Send keystrokes | `[ACTION:send_keys:TEXT]` | `robotjs` or `nircmd` | High (privacy) |
| Move mouse to position | `[ACTION:mouse_move:X:Y]` | `robotjs` | High |
| Click mouse | `[ACTION:mouse_click:BUTTON]` | left/right/double | High |
| Type clipboard content | `[ACTION:paste_clipboard]` | `Ctrl+V` simulation | Medium |

## 📋 Clipboard & Data

| Action | AI Tag | What It Does | Danger |
|--------|--------|--------------|--------|
| Get clipboard text | `[ACTION:get_clipboard]` | read text from clipboard | Low |
| Set clipboard text | `[ACTION:set_clipboard:TEXT]` | write text to clipboard | Low |
| Get clipboard image | `[ACTION:get_clipboard_img]` | save to temp file | Low |
| Clear clipboard | `[ACTION:clear_clipboard]` | empty clipboard | Low |

## 🔊 Audio & Volume

| Action | AI Tag | What It Does | Danger |
|--------|--------|--------------|--------|
| Set volume percentage | `[ACTION:set_volume:0-100]` | via `nircmd` or PowerShell | Low |
| Mute / unmute | `[ACTION:mute]` / `[ACTION:unmute]` | toggle audio | Low |
| Get volume level | `[ACTION:get_volume]` | current level | Low |

## 🌐 Network

| Action | AI Tag | What It Does | Danger |
|--------|--------|--------------|--------|
| Get IP addresses | `[ACTION:get_ip]` | local + public (via API) | Low |
| Ping host | `[ACTION:ping:HOST]` | `ping -n 1` | Low |
| Flush DNS | `[ACTION:flush_dns]` | `ipconfig /flushdns` | Low (admin) |
| List Wi-Fi networks | `[ACTION:list_wifi]` | `netsh wlan show networks` | Low |
| Connect to Wi-Fi | `[ACTION:connect_wifi:SSID:PASSWORD]` | `netsh wlan connect` | Medium |
| Disable / enable network adapter | `[ACTION:net_adapter:ADAPTER:ACTION]` | PowerShell | High (⚠️ confirm) |

## ⏰ Automation & Scheduling

| Action | AI Tag | What It Does | Danger |
|--------|--------|--------------|--------|
| Wait / sleep | `[ACTION:sleep:SECONDS]` | delay next actions | Low |
| Schedule one‑time task | `[ACTION:schedule_once:TIME:COMMAND]` | `schtasks` | Medium |
| Cancel scheduled task | `[ACTION:cancel_task:NAME]` | remove from scheduler | Low |
| Run on startup (add/remove) | `[ACTION:startup:ADD/REMOVE:CMD]` | registry / startup folder | Medium |

## 🔧 Environment & Registry

| Action | AI Tag | What It Does | Danger |
|--------|--------|--------------|--------|
| Get environment variable | `[ACTION:get_env:VAR]` | `process.env` | Low |
| Set environment variable | `[ACTION:set_env:VAR:VALUE]` | user or system | Medium |
| Read registry key | `[ACTION:reg_read:HIVE:KEY:VALUE]` | `reg query` | Medium |
| Write registry key | `[ACTION:reg_write:HIVE:KEY:VALUE:DATA]` | `reg add` | High (⚠️ confirm) |

## 📦 Software & Packages

| Action | AI Tag | What It Does | Danger |
|--------|--------|--------------|--------|
| List installed software | `[ACTION:list_software]` | `wmic` or registry | Low |
| Uninstall program | `[ACTION:uninstall:NAME]` | run uninstaller silently | High (⚠️ confirm) |
| Check for updates (winget) | `[ACTION:check_updates]` | `winget upgrade` | Low |
| Install package | `[ACTION:install_pkg:NAME]` | `winget install` | High (⚠️ confirm) |

## 🖨️ Peripherals

| Action | AI Tag | What It Does | Danger |
|--------|--------|--------------|--------|
| Eject USB drive | `[ACTION:eject_usb:LETTER]` | PowerShell `Eject-Volume` | Medium |
| Lock screen | `[ACTION:lock_screen]` | `rundll32 user32.dll,LockWorkStation` | Low |
| Log off user | `[ACTION:logoff]` | `shutdown /l` | High (⚠️ confirm) |
| Set wallpaper | `[ACTION:set_wallpaper:IMAGE_PATH]` | via registry or `SystemParametersInfo` | Low |

## 📜 Scripting & Extensibility

| Action | AI Tag | What It Does | Danger |
|--------|--------|--------------|--------|
| Execute PowerShell | `[ACTION:run_ps:SCRIPT]` | `powershell -Command` | High (⚠️ confirm) |
| Execute CMD | `[ACTION:run_cmd:COMMAND]` | `cmd /c` | High (⚠️ confirm) |
| Run custom script (isolated) | `[ACTION:run_js:CODE]` | `eval` in sandbox | Extreme (⚠️ sandbox) |

## 🗑️ Maintenance

| Action | AI Tag | What It Does | Danger |
|--------|--------|--------------|--------|
| Empty recycle bin | `[ACTION:empty_trash]` | `Clear-RecycleBin -Force` | High (⚠️ confirm) |
| Clean temporary files | `[ACTION:clean_temp]` | `%TEMP%` deletion | Medium |
| Defrag drive | `[ACTION:defrag:DRIVE]` | `defrag C: /U` | Medium |
| Check disk for errors | `[ACTION:chkdsk:DRIVE]` | `chkdsk /f` | High (⚠️ confirm, may need reboot) |

---

## Implementation Notes for Windows

1. **Confirmation** – For all ⚠️ actions, always show a confirmation dialog before executing.
2. **Privilege elevation** – Use `sudo-prompt` or `electron-sudo` for actions that need admin rights (reg_write, net_adapter, install_pkg, run_ps, run_cmd).
3. **Async safety** – Long actions (zip, ping, chkdsk) should run asynchronously and return progress/errors to the AI.
4. **Return values** – Actions that produce output (list_dir, sys_info, ping) should return the result as text so HEX can respond intelligently.
5. **Security** – Consider a “sandbox mode” that disables all dangerous actions unless explicitly allowed by the user.

---

**Files to update:**
- `main.js` – Add IPC handlers for each new action
- `preload.js` – Expose the butler API to renderer
- `ai.js` – Include all new ACTION tags in the system prompt
- `renderer.js` – Wire the actions to UI (if needed)