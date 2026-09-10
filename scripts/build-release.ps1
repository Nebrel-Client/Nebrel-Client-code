<#
    Builds the Nebrel launcher end to end: dependencies, icons, frontend and
    the signed Windows installers. Run from anywhere.

        powershell -ExecutionPolicy Bypass -File scripts\build-release.ps1
#>

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# Node and Rust land in the machine and user paths, which a fresh shell does
# not always pick up. Rebuilding the path here avoids "command not found".
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("Path", "User")

# Signs the updater artifacts. Without these the build fails at the last step.
$keyPath = Join-Path $env:USERPROFILE ".nebrel\nebrel-updater.key"
if (-not (Test-Path $keyPath)) {
    throw "Updater signing key missing at $keyPath. Generate one with: npx @tauri-apps/cli signer generate -w `"$keyPath`""
}
# Tauri wants the key itself, not a path to it.
$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content -Raw -Path $keyPath).Trim()
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""

$yarn = @("--yes", "yarn@1.22.22")

Write-Host "==> Installing dependencies" -ForegroundColor Magenta
& npx @yarn install --network-timeout 600000
if ($LASTEXITCODE -ne 0) { throw "yarn install failed" }

Write-Host "==> Type checking" -ForegroundColor Magenta
& npx tsc --noEmit
if ($LASTEXITCODE -ne 0) { throw "type check failed" }

Write-Host "==> Building installers" -ForegroundColor Magenta
& npx @yarn tauri build
if ($LASTEXITCODE -ne 0) { throw "tauri build failed" }

Write-Host "==> Artifacts" -ForegroundColor Magenta
Get-ChildItem -Path "src-tauri\target\release\bundle" -Recurse -Include *.exe, *.msi |
    Select-Object FullName, @{ Name = "MB"; Expression = { [math]::Round($_.Length / 1MB, 1) } } |
    Format-Table -AutoSize
