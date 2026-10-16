$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$stateFile = Join-Path $root ".local-runtime/processes.json"

if (-not (Test-Path -LiteralPath $stateFile -PathType Leaf)) {
    Write-Host "Khong co service nao duoc start-local.cmd ghi nhan." -ForegroundColor Yellow
    exit 0
}

try {
    $entries = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    foreach ($entry in $entries) {
        $processId = [int]$entry.pid
        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if (-not $process) {
            Write-Host "  [OK] $($entry.service) da dung."
            continue
        }

        $expectedStart = [DateTime]::Parse([string]$entry.startedAtUtc).ToUniversalTime()
        $actualStart = $process.StartTime.ToUniversalTime()
        if ([Math]::Abs(($actualStart - $expectedStart).TotalSeconds) -gt 2) {
            Write-Warning "Bo qua PID $($entry.pid): PID da duoc process khac tai su dung."
            continue
        }

        & taskkill.exe /PID $processId /T /F *> $null
        Write-Host "  [OK] Da dung $($entry.service)." -ForegroundColor Green
    }

    Remove-Item -LiteralPath $stateFile -Force
    Write-Host "Da dung cac app local. Docker infrastructure va volume van duoc giu." -ForegroundColor Green
}
catch {
    Write-Host "Dung app that bai: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
