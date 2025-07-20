@echo off
REM Construction Issue Tracker - Windows Batch Setup Script
REM Run this in Command Prompt: setup.bat

echo 🏗️  Construction Issue Tracker - Windows Setup
echo =============================================

REM Check if Docker is installed
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not installed. Please install Docker Desktop first.
    echo    Visit: https://docs.docker.com/desktop/windows/
    pause
    exit /b 1
)

REM Check if Docker Compose is available
docker-compose --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker Compose is not available. Please ensure Docker Desktop is running.
    pause
    exit /b 1
)

REM Create .env file if it doesn't exist
if not exist .env (
    echo 📝 Creating .env file from template...
    copy .env.example .env >nul
    echo ✅ Environment file created (.env)
    echo    You can edit this file to customize your setup
) else (
    echo ✅ Environment file already exists
)

REM Create uploads directory
if not exist uploads mkdir uploads
echo ✅ Uploads directory ready

REM Pull Docker images
echo 📦 Pulling Docker images...
docker-compose pull

REM Build the application
echo 🔧 Building application...
docker-compose build

REM Start the services
echo 🚀 Starting services...
docker-compose up -d

REM Wait for services to be ready
echo ⏳ Waiting for services to start...
timeout /t 10 /nobreak >nul

echo.
echo 🎉 Construction Issue Tracker should now be running!
echo.
echo 📍 Access your application:
echo    Web Interface: http://localhost:3000
echo    API Documentation: http://localhost:3000/api
echo    Health Check: http://localhost:3000/health
echo.
echo 🔑 Default Admin Login:
echo    Email: admin@construction.local
echo    Password: admin123
echo.
echo 📊 Additional Services:
echo    MinIO Console: http://localhost:9001 (minioadmin/minioadmin)
echo    PostgreSQL: localhost:5432
echo    Redis: localhost:6379
echo.
echo 📖 Next Steps:
echo    1. Change the default admin password
echo    2. Create your first project
echo    3. Add team members
echo    4. Start tracking issues!
echo.
echo 🛠️  Management Commands:
echo    Stop:    docker-compose down
echo    Restart: docker-compose restart
echo    Logs:    docker-compose logs -f
echo    Update:  git pull ^&^& docker-compose build ^&^& docker-compose up -d
echo.
echo If you encounter issues, check the logs with: docker-compose logs
echo.
pause