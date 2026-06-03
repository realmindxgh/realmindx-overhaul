@echo off
cd /d "%~dp0realmindx-site"
.venv\Scripts\python.exe -m flask --app backend:create_app run --host 127.0.0.1 --port 5000
