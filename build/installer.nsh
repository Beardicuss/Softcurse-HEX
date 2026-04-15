!macro customUnInstall
  ; Remove the registry keys set by app.setLoginItemSettings()
  ; Electron usually uses the app 'name' or 'productName' or executable name
  DeleteRegValue HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\Run" "softcurse-hex"
  DeleteRegValue HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\Run" "Softcurse H.E.X."
  DeleteRegValue HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\Run" "softcurse-hex (Update)"
  DeleteRegValue HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\Run" "Softcurse H.E.X. (Update)"
!macroend
