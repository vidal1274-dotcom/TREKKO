# =============================================================
# scripts/git-release.ps1
# Script de release Git pour le projet Sortie_WE
#
# Usage :
#   .\scripts\git-release.ps1 -Tag "v0.2.0-dashboard-map" -Message "feat: add dashboard map"
# =============================================================

param(
  [Parameter(Mandatory=$false)][string]$Tag = "",
  [Parameter(Mandatory=$false)][string]$Message = ""
)

Set-Location (Split-Path $PSScriptRoot -Parent)

# ── Vérification paramètres ────────────────────────────────
if (-not $Tag) {
  Write-Host "ERREUR : paramètre -Tag obligatoire." -ForegroundColor Red
  Write-Host "Exemple : .\scripts\git-release.ps1 -Tag `"v0.2.0-dashboard-map`" -Message `"feat: add dashboard map`""
  exit 1
}
if (-not $Message) {
  Write-Host "ERREUR : paramètre -Message obligatoire." -ForegroundColor Red
  exit 1
}

# ── Vérification remote origin ─────────────────────────────
$remotes = git remote 2>&1
if (-not ($remotes -match "origin")) {
  Write-Host "ERREUR : aucun remote 'origin' configuré." -ForegroundColor Red
  Write-Host "Commande : git remote add origin https://github.com/vidal1274-dotcom/Sortie_WE.git"
  exit 1
}

# ── Vérification tag inexistant ────────────────────────────
$existingTag = git tag --list $Tag 2>&1
if ($existingTag -eq $Tag) {
  Write-Host "ERREUR : le tag '$Tag' existe déjà." -ForegroundColor Red
  Write-Host "Tags existants :"
  git tag --list
  exit 1
}

# ── Statut avant commit ────────────────────────────────────
Write-Host ""
Write-Host "══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  GIT RELEASE — $Tag" -ForegroundColor Cyan
Write-Host "══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 Statut Git :" -ForegroundColor Yellow
git status --short

# ── Mise à jour fichier VERSION ───────────────────────────
Write-Host ""
Write-Host "📝 Mise à jour VERSION → $Tag" -ForegroundColor Yellow
Set-Content -Path "VERSION" -Value "$Tag`n" -Encoding UTF8

# ── Staging + commit ───────────────────────────────────────
Write-Host ""
Write-Host "📦 Staging de tous les fichiers..." -ForegroundColor Yellow
git add .

Write-Host "💾 Commit : $Message" -ForegroundColor Yellow
git commit -m $Message
if ($LASTEXITCODE -ne 0) {
  Write-Host "ERREUR lors du commit." -ForegroundColor Red
  exit 1
}

# ── Tag annoté ─────────────────────────────────────────────
Write-Host "🏷️  Création du tag $Tag..." -ForegroundColor Yellow
git tag -a $Tag -m $Message
if ($LASTEXITCODE -ne 0) {
  Write-Host "ERREUR lors de la création du tag." -ForegroundColor Red
  exit 1
}

# ── Push main ──────────────────────────────────────────────
Write-Host ""
Write-Host "🚀 Push origin main..." -ForegroundColor Yellow
git push origin main
if ($LASTEXITCODE -ne 0) {
  Write-Host "ERREUR lors du push main." -ForegroundColor Red
  exit 1
}

# ── Push tag ───────────────────────────────────────────────
Write-Host "🏷️  Push tag $Tag..." -ForegroundColor Yellow
git push origin $Tag
if ($LASTEXITCODE -ne 0) {
  Write-Host "ERREUR lors du push du tag." -ForegroundColor Red
  exit 1
}

# ── Résumé ─────────────────────────────────────────────────
Write-Host ""
Write-Host "══════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  ✅ Version poussée : $Tag" -ForegroundColor Green
Write-Host "══════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Vérification :" -ForegroundColor Cyan
Write-Host ""
git tag --list | Sort-Object
Write-Host ""
git log --oneline --decorate --graph -10
Write-Host ""
Write-Host "Dernier tag :" -ForegroundColor Cyan
git describe --tags --always
Write-Host ""
