@echo off
title RAVENMOOR
cd /d "%~dp0"
echo.
echo   R A V E N M O O R  -  a gothic tale
echo   Starting the parish server...
echo.
start "Ravenmoor Server" /min cmd /c "node server.mjs"
timeout /t 1 >nul
start "" http://localhost:8130
echo   The moor awaits at http://localhost:8130
echo   (Close the minimized server window to stop playing.)
echo.
