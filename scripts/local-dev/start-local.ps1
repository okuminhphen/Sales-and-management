param(
    [switch]$CheckOnly,
    [switch]$SkipHealthCheck
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$stateDirectory = Join-Path $root ".local-runtime"
$stateFile = Join-Path $stateDirectory "processes.json"
$serviceHost = Join-Path $PSScriptRoot "run-service.ps1"
$processes = @()

function Assert-Command([string]$Name, [string]$Help) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Khong tim thay '$Name'. $Help"
    }
}

function Test-PortAvailable([int]$Port) {
    $listeners = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
    return -not ($listeners | Where-Object { $_.Port -eq $Port })
}

function Wait-ForWorkers([array]$Entries, [int]$TimeoutSeconds) {
    $markers = @{ Outbox = "outbox.v2.broker_ready"; InventoryExpiry = "inventory_reservation.expiry_worker_started" }
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        $ready = $true
        foreach ($entry in $Entries) {
            if (-not $markers.ContainsKey($entry.service)) { continue }
            $process = Get-Process -Id $entry.pid -ErrorAction SilentlyContinue
            if (-not $process) { throw "Worker $($entry.service) da dung. Xem .local-runtime log." }
            $log = Join-Path $stateDirectory "$($entry.service).stdout.log"
            if (-not (Test-Path -LiteralPath $log) -or
                -not (Select-String -LiteralPath $log -SimpleMatch -Pattern $markers[$entry.service] -Quiet)) {
                $ready = $false
            }
        }
        if ($ready) { return }
        Start-Sleep -Seconds 1
    }
    throw "Workers chua san sang. Xem .local-runtime/*.stdout.log va *.stderr.log."
}

function Wait-ForServices([hashtable]$Endpoints, [int]$TimeoutSeconds) {
    $pending = @{}
    foreach ($entry in $Endpoints.GetEnumerator()) { $pending[$entry.Key] = $entry.Value }
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)

    while ($pending.Count -gt 0 -and [DateTime]::UtcNow -lt $deadline) {
        foreach ($name in @($pending.Keys)) {
            try {
                $response = Invoke-WebRequest -Uri $pending[$name] -UseBasicParsing -TimeoutSec 3
                if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
                    Write-Host "  [OK] $name - $($pending[$name])" -ForegroundColor Green
                    $pending.Remove($name)
                }
            }
            catch {
                # Service dang khoi dong; retry den deadline.
            }
        }
        if ($pending.Count -gt 0) { Start-Sleep -Seconds 2 }
    }

    if ($pending.Count -gt 0) {
        $failed = ($pending.Keys | Sort-Object) -join ", "
        throw "Qua thoi gian cho health check: $failed. Xem log trong terminal tuong ung."
    }
}

try {
    Set-Location -LiteralPath $root
    Write-Host "HappyShop local development - preflight" -ForegroundColor Cyan

    Assert-Command "node.exe" "Hay cai Node.js 22 LTS."
    Assert-Command "npm.cmd" "npm phai di kem Node.js."
    Assert-Command "docker.exe" "Hay cai va mo Docker Desktop."

    if (-not (Test-Path -LiteralPath (Join-Path $root ".env") -PathType Leaf)) {
        throw "Thieu .env. Sao chep .env.example thanh .env va dien cau hinh local."
    }
    if (-not (Test-Path -LiteralPath (Join-Path $root "node_modules") -PathType Container)) {
        throw "Thieu node_modules. Chay 'npm ci' mot lan truoc khi dung launcher."
    }
    if (-not (Test-Path -LiteralPath (Join-Path $root "apps/ai-service/.venv/Scripts/python.exe") -PathType Leaf)) {
        throw "Thieu AI virtual environment. Tao apps/ai-service/.venv va cai package truoc."
    }

    & docker.exe info --format "{{.ServerVersion}}" *> $null
    if ($LASTEXITCODE -ne 0) { throw "Docker daemon chua san sang. Hay mo Docker Desktop." }

    $composeWorkers = & docker.exe compose -f compose.yml ps --status running --services outbox-publisher inventory-reservation-expiry 2>$null
    if ($LASTEXITCODE -ne 0) { throw "Khong kiem tra duoc Compose worker topology." }
    if ($composeWorkers) { throw "Compose workers dang chay. Khong start host worker trung; dung Compose app stack truoc." }
    if (Test-Path -LiteralPath $stateFile -PathType Leaf) {
        foreach ($entry in @(Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json)) {
            $process = Get-Process -Id $entry.pid -ErrorAction SilentlyContinue
            if ($process -and [Math]::Abs(($process.StartTime.ToUniversalTime() - [DateTime]::Parse($entry.startedAtUtc).ToUniversalTime()).TotalSeconds) -lt 2) {
                throw "Local service $($entry.service) van chay; dung stop-local.cmd truoc."
            }
        }
    }

    foreach ($port in @(3000, 8000, 8080)) {
        if (-not (Test-PortAvailable $port)) {
            throw "Cong $port dang duoc su dung. Dong service cu hoac chay stop-local.cmd truoc."
        }
    }

    if ($CheckOnly) {
        & node.exe (Join-Path $PSScriptRoot "check-database.cjs")
        if ($LASTEXITCODE -ne 0) { throw "Ket noi MySQL that bai. Kiem tra cong publish Docker va MYSQL_PORT trong .env." }
        Write-Host "Preflight PASS: .env, dependency, Docker va cac cong deu san sang." -ForegroundColor Green
        exit 0
    }

    Write-Host "Khoi dong MySQL, Redis, Qdrant va RabbitMQ..." -ForegroundColor Cyan
    & npm.cmd run infra:up
    if ($LASTEXITCODE -ne 0) { throw "Khong khoi dong duoc Docker infrastructure." }

    $databaseReady = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        & node.exe (Join-Path $PSScriptRoot "check-database.cjs")
        if ($LASTEXITCODE -eq 0) { $databaseReady = $true; break }
        Start-Sleep -Seconds 2
    }
    if (-not $databaseReady) { throw "MySQL chua san sang. Kiem tra MYSQL_HOST/MYSQL_PORT va database trong .env." }

    $shellCommand = Get-Command "pwsh.exe" -ErrorAction SilentlyContinue
    $shellExecutable = if ($shellCommand) { $shellCommand.Source } else { "powershell.exe" }
    New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null

    foreach ($service in @("Api", "Web", "Ai", "Outbox", "InventoryExpiry")) {
        $arguments = @(
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-File", ('"{0}"' -f $serviceHost),
            "-Service", $service,
            "-Root", ('"{0}"' -f $root)
        )
        $process = Start-Process -FilePath $shellExecutable -ArgumentList $arguments -WindowStyle Hidden -RedirectStandardOutput (Join-Path $stateDirectory "$service.stdout.log") -RedirectStandardError (Join-Path $stateDirectory "$service.stderr.log") -PassThru
        $processes += [pscustomobject]@{
            service = $service
            pid = $process.Id
            startedAtUtc = $process.StartTime.ToUniversalTime().ToString("O")
        }
    }

    New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
    $processes | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8

    if (-not $SkipHealthCheck) {
        Write-Host "Cho ba ung dung san sang..." -ForegroundColor Cyan
        Wait-ForServices -Endpoints @{
            "Web" = "http://localhost:3000/"
            "API" = "http://127.0.0.1:8080/health/live"
            "AI" = "http://127.0.0.1:8000/health/live"
        } -TimeoutSeconds 90
        Wait-ForWorkers -Entries $processes -TimeoutSeconds 45
    }

    Write-Host ""
    Write-Host "HappyShop da san sang:" -ForegroundColor Green
    Write-Host "  Web:      http://localhost:3000"
    Write-Host "  API:      http://localhost:8080/health/live"
    Write-Host "  FastAPI:  http://localhost:8000/docs"
    Write-Host "Workers: outbox va inventory expiry da duoc launcher quan ly. Logs: .local-runtime/"
    Write-Host "Dung stop-local.cmd de dung app va workers; Docker va du lieu se duoc giu lai."
}
catch {
    # Roll back only processes started by this invocation, using the PID/start-time guard.
    foreach ($entry in $processes) {
        $process = Get-Process -Id $entry.pid -ErrorAction SilentlyContinue
        if ($process -and [Math]::Abs(($process.StartTime.ToUniversalTime() - [DateTime]::Parse($entry.startedAtUtc).ToUniversalTime()).TotalSeconds) -lt 2) {
            & taskkill.exe /PID $entry.pid /T /F *> $null
        }
    }
    Write-Host ""
    Write-Host "Khong the khoi dong HappyShop: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
