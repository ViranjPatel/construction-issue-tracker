# Construction Issue Tracker - Windows Setup Script
# Run this in PowerShell: .\setup.ps1

Write-Host "🏗️  Construction Issue Tracker - Windows Setup" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# Check if Docker is installed
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Docker is not installed. Please install Docker Desktop first." -ForegroundColor Red
    Write-Host "   Visit: https://docs.docker.com/desktop/windows/" -ForegroundColor Yellow
    exit 1
}

# Check if Docker Compose is available
if (-not (Get-Command docker-compose -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Docker Compose is not available. Please ensure Docker Desktop is running." -ForegroundColor Red
    exit 1
}

# Create .env file if it doesn't exist
if (-not (Test-Path .env)) {
    Write-Host "📝 Creating .env file from template..." -ForegroundColor Green
    Copy-Item .env.example .env
    
    # Generate a random JWT secret (PowerShell method)
    $JWT_SECRET = [System.Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes([System.Guid]::NewGuid().ToString() + [System.Guid]::NewGuid().ToString()))
    
    # Update the .env file with the generated secret
    (Get-Content .env) -replace 'your-super-secret-key-change-in-production-make-it-long-and-random', $JWT_SECRET | Set-Content .env
    
    Write-Host "✅ Environment file created (.env)" -ForegroundColor Green
    Write-Host "   You can edit this file to customize your setup" -ForegroundColor Yellow
} else {
    Write-Host "✅ Environment file already exists" -ForegroundColor Green
}

# Create uploads directory
if (-not (Test-Path uploads)) {
    New-Item -ItemType Directory -Path uploads | Out-Null
}
Write-Host "✅ Uploads directory ready" -ForegroundColor Green

# Pull Docker images
Write-Host "📦 Pulling Docker images..." -ForegroundColor Yellow
docker-compose pull

# Build the application
Write-Host "🔧 Building application..." -ForegroundColor Yellow
docker-compose build

# Start the services
Write-Host "🚀 Starting services..." -ForegroundColor Yellow
docker-compose up -d

# Wait for services to be ready
Write-Host "⏳ Waiting for services to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Check if services are running
$services = docker-compose ps --format json | ConvertFrom-Json
$runningServices = $services | Where-Object { $_.State -eq "running" }

if ($runningServices.Count -gt 0) {
    Write-Host ""
    Write-Host "🎉 Construction Issue Tracker is now running!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📍 Access your application:" -ForegroundColor Cyan
    Write-Host "   Web Interface: http://localhost:3000" -ForegroundColor White
    Write-Host "   API Documentation: http://localhost:3000/api" -ForegroundColor White
    Write-Host "   Health Check: http://localhost:3000/health" -ForegroundColor White
    Write-Host ""
    Write-Host "🔑 Default Admin Login:" -ForegroundColor Cyan
    Write-Host "   Email: admin@construction.local" -ForegroundColor White
    Write-Host "   Password: admin123" -ForegroundColor White
    Write-Host ""
    Write-Host "📊 Additional Services:" -ForegroundColor Cyan
    Write-Host "   MinIO Console: http://localhost:9001 (minioadmin/minioadmin)" -ForegroundColor White
    Write-Host "   PostgreSQL: localhost:5432" -ForegroundColor White
    Write-Host "   Redis: localhost:6379" -ForegroundColor White
    Write-Host ""
    Write-Host "📖 Next Steps:" -ForegroundColor Cyan
    Write-Host "   1. Change the default admin password" -ForegroundColor White
    Write-Host "   2. Create your first project" -ForegroundColor White
    Write-Host "   3. Add team members" -ForegroundColor White
    Write-Host "   4. Start tracking issues!" -ForegroundColor White
    Write-Host ""
    Write-Host "🛠️  Management Commands:" -ForegroundColor Cyan
    Write-Host "   Stop:    docker-compose down" -ForegroundColor White
    Write-Host "   Restart: docker-compose restart" -ForegroundColor White
    Write-Host "   Logs:    docker-compose logs -f" -ForegroundColor White
    Write-Host "   Update:  git pull && docker-compose build && docker-compose up -d" -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "❌ Some services failed to start. Check the logs:" -ForegroundColor Red
    Write-Host "   docker-compose logs" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "🔧 Troubleshooting:" -ForegroundColor Yellow
    Write-Host "   - Make sure ports 3000, 5432, 6379, 9000, 9001 are available" -ForegroundColor White
    Write-Host "   - Check Docker Desktop is running" -ForegroundColor White
    Write-Host "   - Review the logs for specific error messages" -ForegroundColor White
}