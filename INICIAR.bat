@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto node_missing
where npm >nul 2>nul
if errorlevel 1 goto node_missing

if not exist "config.local.bat" call :create_default_config
if not exist "config.local.bat" goto config_missing
call "config.local.bat"
if not defined DATA_DIR goto config_missing
if not defined BACKUP_DIR goto config_missing

if not exist "%DATA_DIR%\" mkdir "%DATA_DIR%"
if not exist "%DATA_DIR%\" goto data_unavailable
if not exist "%BACKUP_DIR%\" mkdir "%BACKUP_DIR%"
if not exist "%BACKUP_DIR%\" goto backup_unavailable
> "%BACKUP_DIR%\prueba-escritura.tmp" echo ok
if errorlevel 1 goto backup_unavailable
del /q "%BACKUP_DIR%\prueba-escritura.tmp" >nul 2>nul

call :check_service
if not errorlevel 1 goto open_app
if errorlevel 2 goto legacy_service
if not exist "node_modules\next\package.json" (
  call npm ci
  if errorlevel 1 goto build_failed
)
if not exist ".next\BUILD_ID" (
  call npm run build
  if errorlevel 1 goto build_failed
)
start "Micro Empaques Cheches - Servicio" /D "%~dp0" "%ComSpec%" /k "call config.local.bat && npm start"
set "ATTEMPT=0"
:wait_for_service
call :check_service
if not errorlevel 1 goto open_app
set /a ATTEMPT+=1
if %ATTEMPT% GEQ 25 goto service_failed
timeout /t 1 /nobreak >nul
goto wait_for_service

:open_app
call :create_desktop_shortcuts
set "APP_URL=http://localhost:4173/"
if /I "%~1"=="planeacion" set "APP_URL=http://localhost:4173/planeacion"
start "" "%APP_URL%"
echo La aplicacion se abrira en el navegador. Mantenga abierta la ventana del servicio.
echo Para otras pantallas de la misma red, use la direccion IP de este computador con el puerto 4173.
exit /b 0

:create_desktop_shortcuts
set "MC_APP_LAUNCHER=%~dp0ABRIR APLICACION.bat"
set "MC_PLAN_LAUNCHER=%~dp0ABRIR PLANEACION.bat"
powershell -NoProfile -NonInteractive -Command "$w=New-Object -ComObject WScript.Shell; $d=[Environment]::GetFolderPath('Desktop'); foreach($x in @(@('Micro Empaques Cheches.lnk',$env:MC_APP_LAUNCHER),@('Planeacion de planta - Micro Empaques Cheches.lnk',$env:MC_PLAN_LAUNCHER))){$p=Join-Path $d $x[0]; $s=$w.CreateShortcut($p); $s.TargetPath=$x[1]; $s.WorkingDirectory=(Split-Path -Parent $x[1]); $s.Description='Abrir Micro Empaques Cheches'; $s.Save() }" >nul 2>nul
exit /b 0

:check_service
powershell -NoProfile -NonInteractive -Command "try { $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:4173/api/health' -TimeoutSec 2; if ($r.StatusCode -eq 200) { if (($r.Content | ConvertFrom-Json).application -eq 'nextjs') { exit 0 }; exit 2 }; exit 1 } catch { exit 1 }" >nul 2>nul
exit /b %errorlevel%

:create_default_config
set "DATA_DIR=%USERPROFILE%\Documents\Codex\MicroEmpaquesCheches-Datos"
set "BACKUP_DIR=%USERPROFILE%\Documents\Codex\MicroEmpaquesCheches-Respaldos"
set "REQUIRE_SEPARATE_BACKUP=0"
> "config.local.bat" echo @echo off
>> "config.local.bat" echo set "DATA_DIR=%DATA_DIR%"
>> "config.local.bat" echo set "BACKUP_DIR=%BACKUP_DIR%"
>> "config.local.bat" echo set "REQUIRE_SEPARATE_BACKUP=%REQUIRE_SEPARATE_BACKUP%"
exit /b 0

:node_missing
echo No se encontro Node.js. Instale Node.js 20.9 o posterior y vuelva a ejecutar INICIAR.bat.
pause
exit /b 1

:config_missing
echo No se pudo preparar config.local.bat o faltan las rutas de datos y respaldo.
pause
exit /b 1

:data_unavailable
echo No se puede crear o escribir en la carpeta de datos: %DATA_DIR%
pause
exit /b 1

:backup_unavailable
echo No se puede escribir en la carpeta de respaldo: %BACKUP_DIR%
echo Revise la ruta configurada en config.local.bat.
pause
exit /b 1

:legacy_service
echo Detenga la version anterior en el puerto 4173 antes de iniciar Next.js.
pause
exit /b 1

:build_failed
echo No se pudo instalar o compilar la aplicacion. Revise los mensajes de npm.
pause
exit /b 1

:service_failed
echo El servicio no respondio en http://127.0.0.1:4173.
echo Revise la ventana del servicio para ver el error.
pause
exit /b 1
