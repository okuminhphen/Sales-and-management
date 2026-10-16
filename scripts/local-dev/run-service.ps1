param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("Api", "Web", "Ai", "Outbox", "InventoryExpiry")]
    [string]$Service,

    [Parameter(Mandatory = $true)]
    [string]$Root
)

$ErrorActionPreference = "Stop"
$host.UI.RawUI.WindowTitle = "HappyShop - $Service"

try {
    Set-Location -LiteralPath $Root
    switch ($Service) {
        "Api" {
            & npm.cmd run dev:api
        }
        "Web" {
            & npm.cmd run dev:web
        }
        "Ai" {
            Set-Location -LiteralPath (Join-Path $Root "apps/ai-service")
            $python = Join-Path $Root "apps/ai-service/.venv/Scripts/python.exe"
            & $python -m uvicorn app.main:app --reload --port 8000
        }
        "Outbox" {
            $env:V2_OUTBOX_PUBLISHER_ENABLED = "true"
            # The host launcher observes the worker's info-level readiness marker.
            $env:LOG_LEVEL = "info"
            & npm.cmd run outbox:publish:v2 --workspace @sales/api
        }
        "InventoryExpiry" {
            $env:V2_INVENTORY_RESERVATION_EXPIRY_ENABLED = "true"
            $env:LOG_LEVEL = "info"
            & npm.cmd run inventory-reservation:expire --workspace @sales/api
        }
    }

    if ($LASTEXITCODE -ne 0) {
        throw "$Service exited with code $LASTEXITCODE."
    }
}
catch {
    Write-Host ""
    Write-Host "[$Service] Khoi dong that bai: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Xem .local-runtime/$Service.stderr.log va $Service.stdout.log." -ForegroundColor Yellow
    exit 1
}
