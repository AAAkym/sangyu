@echo off
chcp 65001 >nul
REM 需要管理员权限：右键本文件 → 以管理员身份运行
netsh advfirewall firewall add rule name="sangyu-server-3000" dir=in action=allow protocol=TCP localport=3000
echo ============================================
echo   已放行 3000 端口入站（TCP）
echo   手机浏览器访问 http://192.168.1.17:3000/healthz
echo   能看到 JSON 即网络互通
echo ============================================
pause
