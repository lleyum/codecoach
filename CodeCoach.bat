@echo off
rem CodeCoach for Windows: double-click to start. (Needs Python 3 from python.org and, for Java, a JDK such as Temurin.)
setlocal
cd /d "%~dp0"
set PORT=8765
set URL=http://127.0.0.1:%PORT%/

rem ---- already running?
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing %URL%api/ping -TimeoutSec 1; if ($r.Content -match 'vault_ok') { exit 0 } else { exit 2 } } catch { exit 1 }"
if %errorlevel%==0 goto openwindow
if %errorlevel%==2 (
  rem an older CodeCoach is running: stop it so the new one can start
  for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:"127.0.0.1:%PORT% .*LISTENING"') do taskkill /PID %%p /F >nul 2>&1
  timeout /t 1 /nobreak >nul
)

rem ---- find Python (windowless version first, so no extra console stays open)
set "PYW="
where pyw >nul 2>&1 && set "PYW=pyw -3"
if not defined PYW where pythonw >nul 2>&1 && set "PYW=pythonw"
if not defined PYW where py >nul 2>&1 && set "PYW=py -3"
if not defined PYW where python >nul 2>&1 && set "PYW=python"
if not defined PYW (
  echo.
  echo CodeCoach needs Python 3. Install it from https://www.python.org/downloads/
  echo (tick "Add python.exe to PATH" in the installer), then double-click CodeCoach.bat again.
  echo.
  pause
  exit /b 1
)
if not exist "%USERPROFILE%\.codecoach" mkdir "%USERPROFILE%\.codecoach"
start "CodeCoach server" /min %PYW% -B server.py --port %PORT% --no-browser

rem ---- wait up to 15 seconds for it to answer
set /a tries=0
:wait
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing %URL%api/ping -TimeoutSec 1 | Out-Null; exit 0 } catch { exit 1 }"
if %errorlevel%==0 goto openwindow
set /a tries+=1
if %tries% geq 15 (
  echo CodeCoach could not start. Try running:  python server.py   in this folder to see the error.
  pause
  exit /b 1
)
timeout /t 1 /nobreak >nul
goto wait

:openwindow
rem ---- open as an app window (no browser bars). Edge comes with Windows; Chrome is used if installed.
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" (
  start "" "%CHROME%" --app=%URL% --window-size=1400,900
) else if exist "%EDGE%" (
  start "" "%EDGE%" --app=%URL% --window-size=1400,900
) else (
  start "" %URL%
)
endlocal
