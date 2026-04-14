Dim shell
Set shell = CreateObject("WScript.Shell")

' Kill all ollama processes silently (no popup in bundled mode)
shell.Run "taskkill /IM ollama.exe /F", 0, True
