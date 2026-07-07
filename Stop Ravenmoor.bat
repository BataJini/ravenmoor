@echo off
title Stop RAVENMOOR
echo Stopping the Ravenmoor server...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8130 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
echo Done. The parish sleeps.
timeout /t 2 >nul
