# Set CORS so the browser can talk to Ollama
$env:OLLAMA_ORIGINS = "*"
$env:OLLAMA_HOST = "0.0.0.0:11434"

# Resolve paths relative to this script's location
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

# Use user-configured models dir, or fall back to %APPDATA%\softcurse-hex\OllamaModels
$modelsDir = $env:OLLAMA_MODELS
if (-not $modelsDir) {
    $modelsDir = Join-Path $env:APPDATA "softcurse-hex\OllamaModels"
}
$env:OLLAMA_MODELS = $modelsDir
if (-not (Test-Path $modelsDir)) { New-Item -ItemType Directory -Path $modelsDir -Force | Out-Null }

# Find ollama.exe — check common locations
$ollamaExe = $null
$searchPaths = @(
    (Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"),
    (Join-Path $env:ProgramFiles "Ollama\ollama.exe"),
    "C:\Ollama\ollama.exe"
)

# Also check if ollama is already on PATH
$pathOllama = Get-Command ollama.exe -ErrorAction SilentlyContinue
if ($pathOllama) { $ollamaExe = $pathOllama.Source }

if (-not $ollamaExe) {
    foreach ($p in $searchPaths) {
        if (Test-Path $p) { $ollamaExe = $p; break }
    }
}

if (-not $ollamaExe) {
    Write-Error "Ollama not found. Install from https://ollama.ai"
    exit 1
}

# Kill existing Ollama if running
Get-Process -Name "ollama*" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500

# Start Ollama fully hidden — no console window
Start-Process -FilePath $ollamaExe -ArgumentList "serve" -WindowStyle Hidden
