[CmdletBinding()]
param(
  [string]$Version,
  [string]$IdentityName = 'Movena.movena',
  [string]$Publisher = 'CN=835348BD-2CCC-485D-9650-265D1D9D4E15',
  [string]$CertificateThumbprint,
  [string]$OutputDirectory,
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

function Find-WindowsSdkTool([string]$Name) {
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }

  $kitsRoot = ${env:ProgramFiles(x86)}
  if (-not $kitsRoot) { return $null }
  $sdkBin = Join-Path $kitsRoot 'Windows Kits\10\bin'
  if (-not (Test-Path $sdkBin)) { return $null }

  return Get-ChildItem -Path $sdkBin -Directory |
    Sort-Object Name -Descending |
    ForEach-Object { Join-Path $_.FullName "x64\\$Name" } |
    Where-Object { Test-Path $_ } |
    Select-Object -First 1
}

function Get-MsixVersion([string]$SourceVersion) {
  $numeric = ($SourceVersion -split '-', 2)[0]
  $parts = $numeric.Split('.')
  $hasInvalidPart = @($parts | Where-Object { $_ -notmatch '^\d+$' }).Count -gt 0
  if ($parts.Count -gt 4 -or $parts.Count -eq 0 -or $hasInvalidPart) {
    throw "'$SourceVersion' is not a valid numeric MSIX version."
  }
  while ($parts.Count -lt 4) { $parts += '0' }
  $numbers = $parts | ForEach-Object { [int]$_ }
  if (@($numbers | Where-Object { $_ -lt 0 -or $_ -gt 65535 }).Count -gt 0) {
    throw 'Every MSIX version component must be between 0 and 65535.'
  }
  return $numbers -join '.'
}

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$tauriDirectory = Join-Path $repositoryRoot 'src-tauri'
$manifestTemplate = Join-Path $tauriDirectory 'msix\AppxManifest.xml.template'
$releaseDirectory = Join-Path $tauriDirectory 'target\release'
$makeAppx = Find-WindowsSdkTool 'MakeAppx.exe'

if (-not $makeAppx) {
  throw 'MakeAppx.exe was not found. Install the Windows SDK (App Certification Kit / MSIX Packaging Tools) and retry.'
}

if (-not $Version) {
  $cargoToml = Get-Content -Raw (Join-Path $tauriDirectory 'Cargo.toml')
  $match = [regex]::Match($cargoToml, '(?m)^version\s*=\s*"([^"]+)"')
  if (-not $match.Success) { throw 'Could not determine the app version from src-tauri/Cargo.toml.' }
  $Version = $match.Groups[1].Value
}
$msixVersion = Get-MsixVersion $Version

if (-not $SkipBuild) {
  Push-Location $repositoryRoot
  try {
    & npm.cmd run setup:mpv
    if ($LASTEXITCODE -ne 0) { throw 'The libmpv setup step failed.' }
    & npm.cmd run setup:twitch
    if ($LASTEXITCODE -ne 0) { throw 'The Twitch resolver setup step failed.' }
    & npx.cmd tauri build --no-bundle --config src-tauri/tauri.bundle.windows.conf.json
    if ($LASTEXITCODE -ne 0) { throw 'The Tauri release build failed.' }
  }
  finally { Pop-Location }
}

$executable = Join-Path $releaseDirectory 'movena.exe'
$mpvLibrary = Join-Path $releaseDirectory 'libmpv-2.dll'
$ytdlp = Join-Path $releaseDirectory 'yt-dlp.exe'
$twitchResolver = Join-Path $releaseDirectory 'twitch-resolver'
foreach ($file in @($manifestTemplate, $executable, $mpvLibrary, $ytdlp, $twitchResolver)) {
  if (-not (Test-Path $file)) { throw "Required MSIX input is missing: $file" }
}

if (-not $OutputDirectory) { $OutputDirectory = Join-Path $releaseDirectory 'bundle\msix' }
$stagingDirectory = Join-Path $releaseDirectory 'msix-staging'
Remove-Item -LiteralPath $stagingDirectory -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $stagingDirectory, $OutputDirectory -Force | Out-Null

Copy-Item -LiteralPath $executable, $mpvLibrary, $ytdlp -Destination $stagingDirectory
Copy-Item -LiteralPath $twitchResolver -Destination $stagingDirectory -Recurse
$assetsDirectory = Join-Path $stagingDirectory 'Assets'
New-Item -ItemType Directory -Path $assetsDirectory -Force | Out-Null
$assetFiles = Get-ChildItem -Path (Join-Path $tauriDirectory 'icons') -Filter '*.png' |
  Where-Object { $_.Name -match '^(StoreLogo|Square44x44Logo|Square150x150Logo)' }
foreach ($asset in $assetFiles) {
  Copy-Item -LiteralPath $asset.FullName -Destination $assetsDirectory
}
$manifest = Get-Content -Raw $manifestTemplate
$manifest = $manifest.Replace('{{VERSION}}', $msixVersion)
$manifest = $manifest.Replace('{{IDENTITY_NAME}}', [System.Security.SecurityElement]::Escape($IdentityName))
$manifest = $manifest.Replace('{{PUBLISHER}}', [System.Security.SecurityElement]::Escape($Publisher))
[System.IO.File]::WriteAllText((Join-Path $stagingDirectory 'AppxManifest.xml'), $manifest, [System.Text.UTF8Encoding]::new($false))

$packagePath = Join-Path $OutputDirectory "Movena_$msixVersion`_x64.msix"
Remove-Item -LiteralPath $packagePath -Force -ErrorAction SilentlyContinue
& $makeAppx pack /d $stagingDirectory /p $packagePath /o
if ($LASTEXITCODE -ne 0) { throw 'MakeAppx failed to create the MSIX package.' }

if ($CertificateThumbprint) {
  $signTool = Find-WindowsSdkTool 'SignTool.exe'
  if (-not $signTool) { throw 'SignTool.exe was not found. Install the Windows SDK and retry.' }
  $thumbprint = ($CertificateThumbprint -replace '\s', '').ToUpperInvariant()
  $certificate = Get-ChildItem "Cert:\CurrentUser\My\$thumbprint" -ErrorAction SilentlyContinue
  if (-not $certificate) { throw "No CurrentUser\\My certificate exists for thumbprint $thumbprint." }
  if ($certificate.Subject -ne $Publisher) {
    throw "The certificate subject '$($certificate.Subject)' must exactly match the MSIX publisher '$Publisher'."
  }
  & $signTool sign /fd SHA256 /sha1 $thumbprint /tr 'http://timestamp.digicert.com' /td SHA256 $packagePath
  if ($LASTEXITCODE -ne 0) { throw 'SignTool failed to sign the MSIX package.' }
}

Write-Host "Created MSIX package: $packagePath"
if (-not $CertificateThumbprint) {
  Write-Warning 'The MSIX package is unsigned. It must be signed with a trusted code-signing certificate before end users can install it.'
}
