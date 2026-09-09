@echo off
chcp 65001 >nul
title 桑榆智伴 - 后端服务
cd /d "%~dp0server"
echo ============================================
echo   桑榆智伴 后端启动中（保持此窗口开启）
echo   电脑局域网地址请看下方启动日志之后
echo   运行 ipconfig 查看 IPv4 地址
echo   手机需与电脑连同一 Wi-Fi
echo ============================================
node app.js
pause
