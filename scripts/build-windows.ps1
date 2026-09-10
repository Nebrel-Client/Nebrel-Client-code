# Builds a Windows NSIS installer for manual installation, without updater signatures.
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)
& npx --yes yarn@1.22.22 install --frozen-lockfile --network-timeout 600000
if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed" }
& npx tauri build --bundles nsis --config scripts/windows-installer.json
if ($LASTEXITCODE -ne 0) { throw "Windows installer build failed" }
Get-ChildItem -LiteralPath "src-tauri\target\release\bundle\nsis" -Filter *.exe |
    Select-Object FullName, Length
