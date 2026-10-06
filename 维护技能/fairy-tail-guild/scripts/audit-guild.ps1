#requires -Version 7.0
param(
  [string]$ProjectRoot='C:\Users\ASUS\Documents\Codex\2026-09-14\wo\outputs',
  [string]$MirrorRoot='D:\开开的读研记录本',
  [switch]$CompareMirror
)
# Read-only: no APIs, browser storage, export, deletion, or file writes.
$ErrorActionPreference='Stop'
$guildRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path.TrimEnd('\','/')
$checks=[Collections.Generic.List[object]]::new()
function Add-Check([string]$Name,[bool]$Passed,[string]$Detail) {
  $checks.Add([pscustomobject]@{name=$Name;passed=$Passed;detail=$Detail})
}
function Resolve-GuildReference([string]$Reference,[string]$Parent) {
  if ($Reference -match '^(?:https?:|data:|//|#)') {return $null}
  $clean=[Uri]::UnescapeDataString(($Reference -replace '[?#].*$',''))
  $candidate=[IO.Path]::GetFullPath((Join-Path $Parent $clean))
  if (-not $candidate.StartsWith($guildRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) {
    Add-Check ('outside reference: '+$Reference) $false 'Not read.'; return $null
  }
  return $candidate
}
$indexPath=Join-Path $guildRoot 'index.html'
$chinesePath=Join-Path $guildRoot '每日日程表.html'
foreach ($file in @($indexPath,$chinesePath)) {
  Add-Check ('entry: '+[IO.Path]::GetFileName($file)) (Test-Path -LiteralPath $file -PathType Leaf) $file
}
if (-not (Test-Path -LiteralPath $indexPath -PathType Leaf)) {
  [pscustomobject]@{passed=$false;checks=$checks.ToArray()} | ConvertTo-Json -Depth 5;exit 1
}
$html=Get-Content -LiteralPath $indexPath -Raw -Encoding utf8
if (Test-Path -LiteralPath $chinesePath -PathType Leaf) {
  Add-Check 'HTML byte equality' ((Get-FileHash -LiteralPath $indexPath).Hash -eq (Get-FileHash -LiteralPath $chinesePath).Hash) 'Both entrances'
}
$scripts=@([regex]::Matches($html,'(?is)<script\b[^>]*\bsrc\s*=\s*["'']([^"'']+)["'']') | ForEach-Object {$_.Groups[1].Value})
$styles=@([regex]::Matches($html,'(?is)<link\b[^>]*>') | Where-Object {$_.Value -match '\brel\s*=\s*["'']stylesheet["'']'} | ForEach-Object {
  $m=[regex]::Match($_.Value,'\bhref\s*=\s*["'']([^"'']+)["'']');if ($m.Success) {$m.Groups[1].Value}
})
$syntaxFiles=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$directFiles=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($ref in @($scripts)+@($styles)) {
  $file=Resolve-GuildReference $ref $guildRoot;if (-not $file) {continue}
  $exists=Test-Path -LiteralPath $file -PathType Leaf
  Add-Check ('direct asset: '+$ref) $exists ([IO.Path]::GetFileName($file))
  if (-not $exists) {continue}
  [void]$directFiles.Add($file)
  if ([IO.Path]::GetExtension($file) -eq '.js') {[void]$syntaxFiles.Add($file)}
  if ([IO.Path]::GetExtension($file) -eq '.css') {
    $css=Get-Content -LiteralPath $file -Raw -Encoding utf8
    foreach ($m in [regex]::Matches($css,'url\(\s*["'']?([^)"'']+)["'']?\s*\)')) {
      $asset=Resolve-GuildReference $m.Groups[1].Value.Trim() (Split-Path -Parent $file)
      if ($asset) {Add-Check ('CSS asset: '+$m.Groups[1].Value) (Test-Path -LiteralPath $asset -PathType Leaf) ([IO.Path]::GetFileName($asset))}
    }
  }
}
$swPath=Join-Path $guildRoot 'guild-sw.js';$cacheObservation='SW unavailable'
if (Test-Path -LiteralPath $swPath -PathType Leaf) {
  [void]$syntaxFiles.Add($swPath);[void]$directFiles.Add($swPath)
  $sw=Get-Content -LiteralPath $swPath -Raw -Encoding utf8
  $sm=[regex]::Match($sw,'\bCACHE_VER\s*=\s*["'']([^"'']+)["'']')
  Add-Check 'SW CACHE_VER exists' $sm.Success $sm.Groups[1].Value
  $versions=@(@($scripts)+@($styles) | ForEach-Object {$m=[regex]::Match($_,'[?&]v=([^&#]+)');if ($m.Success) {$m.Groups[1].Value}} | Select-Object -Unique)
  $unversioned=@(@($scripts)+@($styles) | Where-Object {$_ -notmatch '[?&]v=' -and $_ -notmatch '^(https?:|//)'})
  Add-Check 'Core references versioned' ($versions.Count -ge 1 -and $unversioned.Count -eq 0) ($versions -join ', ')
  Add-Check 'Core reference versions consistent' ($versions.Count -eq 1) ($versions -join ', ')
  $cacheObservation=if ($sm.Success -and $versions.Count -eq 1 -and $sm.Groups[1].Value -eq $versions[0]) {'Versions aligned.'} else {'Check actual SW matching policy; independent SW version may be intentional.'}
} else {Add-Check 'Service Worker file' $false 'guild-sw.js missing'}
$nodeCommand=Get-Command node -ErrorAction SilentlyContinue
$nodePath=if ($nodeCommand) {$nodeCommand.Source} else {'C:\Users\ASUS\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'}
if (Test-Path -LiteralPath $nodePath -PathType Leaf) {
  foreach ($file in $syntaxFiles) {
    $output=& $nodePath --check $file 2>&1;$code=$LASTEXITCODE
    $detail=if ($code -eq 0) {'Passed'} else {$output -join [Environment]::NewLine}
    Add-Check ('JS syntax: '+[IO.Path]::GetFileName($file)) ($code -eq 0) $detail
  }
} else {Add-Check 'Node runtime' $false 'Unavailable; nothing installed.'}
if ($CompareMirror) {
  foreach ($file in @($indexPath,$chinesePath)+@($directFiles)) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {continue}
    $relative=[IO.Path]::GetRelativePath($guildRoot,$file);$target=Join-Path $MirrorRoot $relative
    $equal=(Test-Path -LiteralPath $target -PathType Leaf) -and ((Get-FileHash -LiteralPath $file).Hash -eq (Get-FileHash -LiteralPath $target).Hash)
    Add-Check ('Mirror SHA256: '+$relative) $equal 'Direct files only; no exhaustive image comparison.'
  }
}
$failed=@($checks | Where-Object {-not $_.passed})
[pscustomobject]@{
  project=$guildRoot;passed=($failed.Count -eq 0);failures=$failed.Count;cacheObservation=$cacheObservation
  scope='Static read-only: entrance, direct script/style/CSS references, JS syntax.'
  notValidated=@('Inline scripts','Dynamic registry and image identity','Browser interactions','Personal data','Cloud merge','Live deployment')
  checks=$checks.ToArray()
} | ConvertTo-Json -Depth 6
if ($failed.Count) {exit 1}
