$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path

try {
    Set-Location -LiteralPath $root
    & npm.cmd run infra:down
    if ($LASTEXITCODE -ne 0) { throw "Docker Compose tra ve exit code $LASTEXITCODE." }
    Write-Host "Da dung infrastructure. Named volume va du lieu local van duoc giu." -ForegroundColor Green
}
catch {
    Write-Host "Dung infrastructure that bai: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
