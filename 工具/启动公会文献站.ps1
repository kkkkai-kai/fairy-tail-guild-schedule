param([switch]$Silent)
$ErrorActionPreference = 'Stop'
$guildLiteratureScript = Join-Path $PSScriptRoot '公会文献服务.cjs'
$guildNodeCandidates = @(
  'C:\Program Files\nodejs\node.exe',
  'C:\Program Files (x86)\nodejs\node.exe',
  "$env:LOCALAPPDATA\Programs\nodejs\node.exe"
)
$guildNodeExecutable = $guildNodeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $guildNodeExecutable) {
    $guildCmdNode = Get-Command node -ErrorAction SilentlyContinue
    if ($guildCmdNode) { $guildNodeExecutable = $guildCmdNode.Source }
}
if (-not $guildNodeExecutable) { throw '未找到 node.exe，请安装 Node.js 后再试' }
try {
    $guildLiteratureResponse = Invoke-RestMethod -Uri 'http://127.0.0.1:18765/api/summary' -TimeoutSec 2
} catch {
    Start-Process -FilePath $guildNodeExecutable -ArgumentList ('"' + $guildLiteratureScript + '" serve') -WindowStyle Hidden
    Start-Sleep -Seconds 2
}
if (-not $Silent) {
    Start-Process 'http://127.0.0.1:18765/'
}