# gitled-import.ps1
# Sends git pull output to the GitLed API as a new commit record.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File gitled-import.ps1 `
#              -PullLog git_pull.log -ProjectId 1
#
# Parameters:
#   PullLog   — path to the file containing raw git pull output (default: git_pull.log)
#   ProjectId — GitLed project id (see GET http://localhost:3001/api/projects)
#   ApiUrl    — GitLed API base URL (default: http://localhost:3001/api/commits)

param(
    [string]$PullLog   = "git_pull.log",
    [int]   $ProjectId = 1,
    [string]$ApiUrl    = "http://localhost:3001/api/commits"
)

$pullContent = Get-Content $PullLog -Raw -ErrorAction SilentlyContinue
if (-not $pullContent) {
    Write-Host "GitLed: $PullLog not found or empty, skipping"
    exit 0
}

$header  = "=== " + (Get-Date -Format "ddd MM/dd/yyyy HH:mm:ss.ff") + " ============================`n"
$rawText = $header + $pullContent
$body    = (@{ project_id = $ProjectId; raw_text = $rawText } | ConvertTo-Json -Depth 3)

try {
    $result = Invoke-RestMethod -Method Post -Uri $ApiUrl `
              -ContentType "application/json" -Body $body -ErrorAction Stop
    Write-Host "GitLed: imported $($result.Count) commit(s) OK"
} catch {
    Write-Host "GitLed: import skipped (server not running?)"
}
