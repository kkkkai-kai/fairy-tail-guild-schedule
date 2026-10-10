param([switch]$Silent)
$ErrorActionPreference = 'Stop'
$guildLiteratureScript = Join-Path $PSScriptRoot '公会文献服务.cjs'
$guildNodeExecutable = (Get-Command node -ErrorAction Stop).Source
try {
    $guildLiteratureResponse = Invoke-RestMethod -Uri 'http://127.0.0.1:18765/api/summary' -TimeoutSec 2
} catch {
    Start-Process -FilePath $guildNodeExecutable -ArgumentList ('"' + $guildLiteratureScript + '" serve') -WindowStyle Hidden
    Start-Sleep -Seconds 2
}
if (-not $Silent) {
    Start-Process 'http://127.0.0.1:18765/'
}