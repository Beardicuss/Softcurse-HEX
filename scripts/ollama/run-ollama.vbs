Dim shell, fso, scriptDir, ps1Path

Set shell = CreateObject("WScript.Shell")
Set fso   = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
ps1Path   = scriptDir & "\run-ollama.ps1"

' WindowStyle 0 = hidden PowerShell window
shell.Run "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1Path & """", 0, False
