param(
  [string]$HostName = "127.0.0.1",
  [int]$Port = 8080,
  [int]$Context = 8192,
  [int]$Threads = 8
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$modelPath = Join-Path $repoRoot "models\qwen3\Qwen3-8B-Q4_K_M.gguf"

if (-not (Test-Path -LiteralPath $modelPath)) {
  throw "Model not found: $modelPath"
}

$candidates = @()
if ($env:LLAMA_SERVER_EXE) { $candidates += $env:LLAMA_SERVER_EXE }
$candidates += (Join-Path $repoRoot "bin\llama-server.exe")
$candidates += "D:\Dev\Artificial intelligence\llama.cpp\llama-server.exe"
$cmd = Get-Command llama-server -ErrorAction SilentlyContinue
if ($cmd) { $candidates += $cmd.Source }

$server = $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $server) {
  Write-Host "llama-server.exe not found." -ForegroundColor Yellow
  Write-Host "Set LLAMA_SERVER_EXE to your llama.cpp server binary, or place it at: $repoRoot\bin\llama-server.exe"
  Write-Host "Model is ready at: $modelPath"
  exit 1
}

Write-Host "Starting llama.cpp server for Qwen3..." -ForegroundColor Cyan
Write-Host "Model: $modelPath"
Write-Host "URL:   http://$HostName`:$Port"

& $server `
  --model $modelPath `
  --host $HostName `
  --port $Port `
  --ctx-size $Context `
  --threads $Threads