$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

if (-not $env:WIN_CSC_LINK) { throw "Set WIN_CSC_LINK to the PFX file path or secure certificate URL." }
if (-not $env:WIN_CSC_KEY_PASSWORD) { throw "Set WIN_CSC_KEY_PASSWORD in the local shell or CI secret store." }

$env:CSC_LINK = $env:WIN_CSC_LINK
$env:CSC_KEY_PASSWORD = $env:WIN_CSC_KEY_PASSWORD
Set-Location $Root
npm run pack:win

Get-ChildItem (Join-Path $Root "release") -Filter "*.exe" | ForEach-Object {
  $signature = Get-AuthenticodeSignature $_.FullName
  if ($signature.Status -ne "Valid") { throw "Invalid signature on $($_.Name): $($signature.StatusMessage)" }
  Write-Host "Valid signature: $($_.FullName)"
}
