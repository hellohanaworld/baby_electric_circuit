@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ⚡ 꼬마 전기 실험실 서버를 시작합니다...
start "" "http://localhost:8080"
node server.js
pause
