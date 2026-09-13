<#
    Publishes the configured Nebrel version and starts the GitHub release build.

    Run from the repository root or double-click scripts\publish-release.cmd.
#>

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Invoke-Checked([string]$Command, [string[]]$Arguments) {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Command failed with exit code $LASTEXITCODE"
    }
}

$version = node -p "require('./src-tauri/tauri.conf.json').version"
if ([string]::IsNullOrWhiteSpace($version)) {
    throw "Could not read the version from src-tauri/tauri.conf.json"
}
$tag = "v$version"

Write-Host "==> Running frontend build" -ForegroundColor Cyan
Invoke-Checked "yarn" @("build")

Write-Host "==> Staging all repository changes" -ForegroundColor Cyan
Invoke-Checked "git" @("add", "-A")

$stagedChanges = git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
    Write-Host "==> Creating commit: Release $tag" -ForegroundColor Cyan
    Invoke-Checked "git" @("commit", "-m", "Release $tag")
} else {
    Write-Host "==> No file changes to commit" -ForegroundColor Yellow
}

$existingTag = git tag --list $tag
if (-not [string]::IsNullOrWhiteSpace($existingTag)) {
    throw "Tag $tag already exists locally. Increase the version before publishing again."
}

Write-Host "==> Pushing the current branch" -ForegroundColor Cyan
Invoke-Checked "git" @("push", "origin", "HEAD")

Write-Host "==> Pushing $tag and starting the GitHub build" -ForegroundColor Cyan
Invoke-Checked "git" @("tag", "-a", $tag, "-m", "Release $tag")
Invoke-Checked "git" @("push", "origin", $tag)

Write-Host ""
Write-Host "Release $tag pushed. GitHub Actions is now building and publishing the signed installer." -ForegroundColor Green
Read-Host "Press Enter to close"
