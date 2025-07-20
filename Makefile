# Construction Issue Tracker - Development Makefile
# Simplifies common development and deployment tasks

.PHONY: help setup dev start stop restart logs clean test build deploy

# Default target
help: ## Show this help message
	@echo "Construction Issue Tracker - Available Commands:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'
	@echo ""

setup: ## Initial setup - run this first
	@echo "🏗️ Setting up Construction Issue Tracker..."
	@chmod +x setup.sh
	@./setup.sh

dev: ## Start development environment with hot reload
	@echo "🔧 Starting development environment..."
	@docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
	@echo "✅ Development environment started"
	@echo "   App: http://localhost:3000"
	@echo "   Debug port: 9229"

start: ## Start production environment
	@echo "🚀 Starting production environment..."
	@docker-compose up -d
	@echo "✅ Production environment started at http://localhost:3000"

stop: ## Stop all services
	@echo "⏹️ Stopping all services..."
	@docker-compose down
	@echo "✅ All services stopped"

restart: ## Restart all services
	@echo "🔄 Restarting services..."
	@docker-compose restart
	@echo "✅ Services restarted"

logs: ## Show logs from all services
	@docker-compose logs -f

logs-app: ## Show logs from app service only
	@docker-compose logs -f app

status: ## Show status of all services
	@docker-compose ps

build: ## Rebuild application container
	@echo "🔨 Rebuilding application..."
	@docker-compose build app
	@echo "✅ Application rebuilt"

clean: ## Clean up containers, volumes, and images
	@echo "🧹 Cleaning up..."
	@docker-compose down -v --remove-orphans
	@docker system prune -f
	@echo "✅ Cleanup completed"

test: ## Run tests
	@echo "🧪 Running tests..."
	@npm test

test-watch: ## Run tests in watch mode
	@echo "🧪 Running tests in watch mode..."
	@npm run test:watch

test-coverage: ## Run tests with coverage report
	@echo "🧪 Running tests with coverage..."
	@npm run test:coverage

install: ## Install dependencies
	@echo "📦 Installing dependencies..."
	@npm install
	@echo "✅ Dependencies installed"

migrate: ## Run database migrations
	@echo "🗃️ Running database migrations..."
	@docker-compose exec postgres psql -U postgres -d construction_tracker -f /docker-entrypoint-initdb.d/init.sql
	@echo "✅ Database migrations completed"

backup-db: ## Create database backup
	@echo "💾 Creating database backup..."
	@docker-compose exec postgres pg_dump -U postgres construction_tracker > backup_$(shell date +%Y%m%d_%H%M%S).sql
	@echo "✅ Database backup created"

shell-app: ## Access application container shell
	@docker-compose exec app sh

shell-db: ## Access database container shell
	@docker-compose exec postgres psql -U postgres -d construction_tracker

shell-redis: ## Access Redis container shell
	@docker-compose exec redis redis-cli

update: ## Update application (git pull + rebuild + restart)
	@echo "🔄 Updating application..."
	@git pull
	@docker-compose build app
	@docker-compose up -d
	@echo "✅ Application updated"

deploy: ## Deploy to production (build + start)
	@echo "🚀 Deploying to production..."
	@make build
	@make start
	@echo "✅ Deployment completed"

health: ## Check application health
	@echo "🏥 Checking application health..."
	@curl -s http://localhost:3000/health | python -m json.tool || echo "Application not responding"

api-docs: ## Show API documentation
	@echo "📚 API Documentation:"
	@curl -s http://localhost:3000/api | python -m json.tool || echo "Application not responding"

monitor: ## Show real-time resource usage
	@echo "📊 Resource usage:"
	@docker stats

lint: ## Run code linting (if configured)
	@echo "🔍 Running linter..."
	@npm run lint 2>/dev/null || echo "No linter configured"

format: ## Format code (if configured)
	@echo "💄 Formatting code..."
	@npm run format 2>/dev/null || echo "No formatter configured"

env: ## Show current environment variables
	@echo "🌍 Environment variables:"
	@docker-compose config

ports: ## Show which ports are being used
	@echo "🔌 Port usage:"
	@docker-compose ps --format "table {{.Name}}\t{{.Ports}}"

# Development helpers
dev-reset: ## Reset development environment completely
	@echo "🔄 Resetting development environment..."
	@make clean
	@make setup
	@echo "✅ Development environment reset"

quick-start: ## Quick start for first-time users
	@echo "⚡ Quick start for Construction Issue Tracker..."
	@make setup
	@make dev
	@echo ""
	@echo "🎉 Ready! Access your application at http://localhost:3000"
	@echo "🔑 Login with: admin@construction.local / admin123"