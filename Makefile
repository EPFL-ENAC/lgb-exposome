.PHONY: setup install clean uninstall help docker-build docker-run docker-stop docker-dev docker-prod

# Default target
help:
	@echo "Available commands:"
	@echo "  setup      - Set up repository from template (first-time setup)"
	@echo "  install    - Install dependencies and set up git hooks"
	@echo "  clean      - Clean node_modules and package-lock.json"
	@echo "  uninstall  - Remove git hooks and clean dependencies"
	@echo "  lint       - Run linter"
	@echo "  format     - Run formatter"
	@echo "  docker-build - Build Docker image"
	@echo "  docker-dev - Run development environment with Docker Compose"
	@echo "  docker-prod - Run production environment with Docker Compose"
	@echo "  docker-stop - Stop Docker containers"
	@echo "  docker-clean - Clean Docker containers and images"
	@echo "  help       - Show this help message"


# Install dependencies and set up git hooks
install:
	@echo "Installing npm dependencies..."
	npm install
	@echo "Installing git hooks with lefthook..."
	npx lefthook install
	@echo "Setup complete!"

# Clean dependencies
clean:
	@echo "Cleaning dependencies..."
	rm -rf node_modules
	rm -f package-lock.json

# Uninstall hooks and clean
uninstall:
	@echo "Uninstalling git hooks..."
	npx lefthook uninstall || true
	$(MAKE) clean
	@echo "Uninstall complete!"

lint:
	@echo "Running linter..."
	npx prettier --check .
	@echo "Linting complete!"

format:
	@echo "Running formatter..."
	npx prettier --write .
	@echo "Formatting complete!"

# Docker commands
docker-build:
	@echo "Building Docker image..."
	docker build -t lgb-exposome .

docker-dev:
	@echo "Starting development environment..."
	docker-compose up -d
	@echo "Development environment is running at http://localhost:8000"

docker-prod:
	@echo "Starting production environment..."
	docker-compose -f docker-compose.prod.yml up -d
	@echo "Production environment is running at http://localhost"

docker-stop:
	@echo "Stopping Docker containers..."
	docker-compose down
	docker-compose -f docker-compose.prod.yml down

docker-clean:
	@echo "Cleaning Docker containers and images..."
	docker-compose down -v --rmi all
	docker-compose -f docker-compose.prod.yml down -v --rmi all
	docker system prune -f

# Django management commands in Docker
docker-migrate:
	@echo "Running database migrations..."
	docker-compose exec web python manage.py migrate

docker-collectstatic:
	@echo "Collecting static files..."
	docker-compose exec web python manage.py collectstatic --noinput

docker-createsuperuser:
	@echo "Creating Django superuser..."
	docker-compose exec web python manage.py createsuperuser

docker-shell:
	@echo "Opening Django shell..."
	docker-compose exec web python manage.py shell

docker-logs:
	@echo "Showing application logs..."
	docker-compose logs -f web