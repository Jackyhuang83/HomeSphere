$ErrorActionPreference = 'Stop'

$Repo = 'Jackyhuang83/HomeSphere'
$Tag = 'windows-helper-latest'
$Asset = 'HomeSpherePlayerHelper.exe'
$Base = "https://github.com/$Repo/releases/download/$Tag"
$InstallDir = Join-Path $env:LOCALAPPDATA 'HomeSphere'
$Exe = Join-Path $InstallDir $Asset
$Tmp = Join-Path $env:TEMP ("homesphere-helper-" + [guid]::NewGuid().ToString('N'))
$TmpExe = Join-Path $Tmp $Asset
$TmpSha = "$TmpExe.sha256"

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path $Tmp | Out-Null

try {
    Write-Host '==> 下载 HomeSphere Windows 播放助手'
    Invoke-WebRequest -UseBasicParsing -Uri "$Base/$Asset" -OutFile $TmpExe
    Invoke-WebRequest -UseBasicParsing -Uri "$Base/$Asset.sha256" -OutFile $TmpSha

    $Expected = ((Get-Content $TmpSha -Raw) -split '\s+')[0].Trim().ToLowerInvariant()
    $Actual = (Get-FileHash -Algorithm SHA256 $TmpExe).Hash.ToLowerInvariant()
    if ($Expected -ne $Actual) {
        throw "SHA256 校验失败。Expected=$Expected Actual=$Actual"
    }

    Get-Process -Name 'HomeSpherePlayerHelper' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Copy-Item -Force $TmpExe $Exe
    Unblock-File -Path $Exe -ErrorAction SilentlyContinue

    $RunKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
    New-Item -Path $RunKey -Force | Out-Null
    New-ItemProperty -Path $RunKey -Name 'HomeSpherePlayerHelper' -PropertyType String -Value ('"' + $Exe + '"') -Force | Out-Null

    Write-Host '==> 启动播放助手'
    Start-Process -FilePath $Exe -WindowStyle Hidden

    $Ok = $false
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Milliseconds 500
        try {
            $Health = Invoke-RestMethod -UseBasicParsing -Uri 'http://127.0.0.1:17865/health' -TimeoutSec 2
            if ($Health.ok) {
                $Ok = $true
                break
            }
        } catch {}
    }

    if (-not $Ok) {
        throw '播放助手已安装，但本机 127.0.0.1:17865 健康检查没有通过。'
    }

    Write-Host ''
    Write-Host 'HomeSphere Windows 播放助手安装成功。'
    Write-Host '它只监听 127.0.0.1:17865，并已设置为当前用户登录 Windows 后自动启动。'
    Write-Host '现在回到 HomeSphere 页面刷新后即可播放。'
}
finally {
    Remove-Item -Recurse -Force $Tmp -ErrorAction SilentlyContinue
}
