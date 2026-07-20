@echo off
echo ====================================
echo   ODAK SAVASI BASLATILIYOR...
echo ====================================
echo.

cd /d "%~dp0"

echo Node.js kontrol ediliyor...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo HATA: Node.js bulunamadi!
    echo Lutfen Node.js yukleyin: https://nodejs.org
    pause
    exit /b 1
)

echo.
echo Dependencies yukleniyor...
if not exist node_modules (
    call npm install
) else (
    echo Dependencies zaten yuklu.
)

echo.
echo Yerel ag IP adresi aliniyor...
set netip=
for /f "usebackq tokens=*" %%a in (`powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notmatch '127.0.0.1' -and $_.InterfaceAlias -match 'Wi-Fi|Ethernet' } | Select-Object -ExpandProperty IPAddress -First 1"`) do set netip=%%a

echo.
echo ====================================
echo   SERVER BASLATILIYOR...
echo   Local:   http://localhost:3000
if not "%netip%"=="" (
    echo   Network: http://%netip%:3000 (Ayni WiFi/Agdakiler icin)
) else (
    echo   Network: Ayni WiFi/Agdakiler de baglanabilir.
)
echo ====================================
echo.
echo Kapatmak icin CTRL+C basin
echo.

node server\index.js

pause
