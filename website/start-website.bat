@echo off
title InstaPDF Web Application
echo ======================================================
echo           Starting InstaPDF Web Application
echo ======================================================
echo.
echo Launching local server on http://localhost:3000 ...
start http://localhost:3000
node server.js
pause
