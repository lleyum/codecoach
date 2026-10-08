# Build the downloadable Windows app:
#   dist\CodeCoach-Windows\            (CodeCoach.exe + private Python + app files)
#   dist\CodeCoach-Windows.zip         (portable: unzip anywhere, double-click CodeCoach.exe)
#   dist\CodeCoach-Windows-Setup.exe   (installer, if Inno Setup is available)
# Runs on Windows 10/11 with PowerShell and Python 3 (only for the build). Needs internet.
#   powershell -ExecutionPolicy Bypass -File packaging\windows\build.ps1
param([string]$PyVersion = "3.12.10", [string]$Repo = "", [string]$Version = "")
$ErrorActionPreference = "Stop"
$Root = Resolve-Path "$PSScriptRoot\..\.."
$Out = Join-Path $Root "dist"
$App = Join-Path $Out "CodeCoach-Windows"
if (-not $Version) { $Version = (Select-String -Path "$Root\server.py" -Pattern 'VERSION = "([^"]+)"').Matches[0].Groups[1].Value }
Write-Host "== CodeCoach $Version for Windows (x64)"
if (Test-Path $App) { Remove-Item -Recurse -Force $App }
New-Item -ItemType Directory -Force -Path $App, "$Out\cache" | Out-Null

# 1. app files (+ editor/font files, so it works offline)
python "$Root\packaging\fetch_vendor.py"; if ($LASTEXITCODE) { throw "vendor download failed" }
python "$Root\packaging\stage.py" "$App\app" --repo "$Repo" --version "$Version"; if ($LASTEXITCODE) { throw "staging failed" }

# 2. a private Python (the official "embeddable" build from python.org)
$zip = "$Out\cache\python-$PyVersion-embed-amd64.zip"
if (-not (Test-Path $zip)) {
  Invoke-WebRequest -UseBasicParsing "https://www.python.org/ftp/python/$PyVersion/python-$PyVersion-embed-amd64.zip" -OutFile $zip
}
Expand-Archive -Force $zip "$App\python"
# let the bundled Python find the standard library and run scripts from any folder
$pth = Get-ChildItem "$App\python\python*._pth" | Select-Object -First 1
(Get-Content $pth.FullName) -replace '^#\s*import site', 'import site' | Set-Content $pth.FullName
& "$App\python\python.exe" -c "import ssl, json, zipfile, ctypes; print('-- bundled Python', __import__('sys').version.split()[0], 'ok')"
if ($LASTEXITCODE) { throw "bundled Python doesn't work" }

# 3. the launcher (CodeCoach.exe), compiled with the C# compiler that ships with Windows
$csc = Get-ChildItem "$env:WINDIR\Microsoft.NET\Framework64\v4*\csc.exe" | Sort-Object FullName | Select-Object -Last 1
& $csc.FullName /nologo /target:winexe /optimize+ /win32icon:"$PSScriptRoot\codecoach.ico" /r:System.Windows.Forms.dll /out:"$App\CodeCoach.exe" "$PSScriptRoot\CodeCoach.cs"
if ($LASTEXITCODE) { throw "launcher build failed" }
Copy-Item "$PSScriptRoot\codecoach.ico" "$App\codecoach.ico"
@"
CodeCoach $Version

Double-click CodeCoach.exe to start. Your notes and progress live in your Library folder
(you choose it the first time). Settings and API keys stay in %USERPROFILE%\.codecoach

For Java, install a JDK (e.g. Temurin from adoptium.net). Python is built in.
"@ | Set-Content "$App\README.txt"

# 4. portable zip + installer
$portable = "$Out\CodeCoach-Windows.zip"
if (Test-Path $portable) { Remove-Item $portable }
Compress-Archive -Path "$App\*" -DestinationPath $portable
$iscc = (Get-Command iscc -ErrorAction SilentlyContinue).Source
if (-not $iscc) { $iscc = @("${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe", "$env:ProgramFiles\Inno Setup 6\ISCC.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1 }
if ($iscc) {
  & $iscc /Q "/DAppVersion=$($Version.TrimStart('v'))" "$PSScriptRoot\installer.iss"
  if ($LASTEXITCODE) { throw "installer build failed" }
  Write-Host "== done: $Out\CodeCoach-Windows-Setup.exe and $portable"
} else {
  Write-Host "== done: $portable  (install Inno Setup 6 to also build the installer)"
}
