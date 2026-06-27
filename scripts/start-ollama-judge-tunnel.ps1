# Expose local Ollama for the GPU Arena API judge (Railway).
# Keep this window open while the arena is live.
#
# After it starts, copy the https://....trycloudflare.com URL into Railway:
#   OLLAMA_URL=<that URL>
#   JUDGE_MODEL=llama3.1:8b

$ErrorActionPreference = "Stop"

Write-Host "Starting Ollama (open to tunnel)..." -ForegroundColor Cyan
$env:OLLAMA_ORIGINS = "*"
$env:OLLAMA_HOST = "0.0.0.0:11434"

# Stop tray Ollama if it grabbed the port
Get-Process -Name "ollama app" -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process -Name "ollama" -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne $PID } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Minimized
Start-Sleep -Seconds 3

Write-Host "Starting Cloudflare tunnel to port 11434..." -ForegroundColor Cyan
Write-Host "Copy the https://....trycloudflare.com URL into Railway -> OLLAMA_URL" -ForegroundColor Yellow
cloudflared tunnel --url http://127.0.0.1:11434
