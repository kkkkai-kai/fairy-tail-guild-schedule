@echo off
chcp 65001 >nul
title 妖精的尾巴 · 公会云端启动器
cd /d "C:\Users\ASUS\Documents\Codex\2026-09-14\wo\outputs"

echo 正在启动本地门户服务器（云端同步依赖它）...
start "" /min cmd /c "node "工具/旧版门户/cloud-server.js""
timeout /t 2 >nul

echo 正在打开每日日程表...
start "" "http://localhost:8787/%E6%AF%8F%E6%97%A5%E6%97%A5%E7%A8%8B%E8%A1%A8.html"
echo 完成！右下角浮标显示「云端：已同步」即代表云端连接正常。
echo 若显示离线：请确认本窗口内 node 窗口未被关闭。
pause
