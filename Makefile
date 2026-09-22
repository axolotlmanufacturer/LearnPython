.DEFAULT_GOAL := help
API := apps/api
WEB := apps/web
VENV := $(API)/.venv
PY := $(VENV)/bin/python

.PHONY: help
help: ## Show available targets
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

.PHONY: install
install: ## Install web and API dependencies
	npm install
	python3 -m venv $(VENV) || true
	$(PY) -m pip install --upgrade pip
	$(PY) -m pip install -e "$(API)[dev,content]"
	npm run sync-pyodide --workspace=$(WEB)

.PHONY: dev
dev: ## Run the API and web app together (Ctrl-C stops both)
	@echo "API  -> http://127.0.0.1:8000/api/docs"
	@echo "Web  -> http://127.0.0.1:3000"
	@trap 'kill 0' INT TERM; \
	$(VENV)/bin/uvicorn app.main:app --reload --app-dir $(API) --port 8000 & \
	npm run dev --workspace=$(WEB) & \
	wait

.PHONY: dev-api
dev-api: ## Run only the API with autoreload
	$(VENV)/bin/uvicorn app.main:app --reload --app-dir $(API) --port 8000

.PHONY: dev-web
dev-web: ## Run only the web app
	npm run dev --workspace=$(WEB)

.PHONY: test
test: test-api test-web ## Run all unit/integration tests

.PHONY: test-api
test-api: ## Run backend tests
	cd $(API) && .venv/bin/python -m pytest -q

.PHONY: test-web
test-web: ## Run frontend + execution-engine + content tests
	npm run test --workspace=$(WEB)

.PHONY: test-e2e
test-e2e: ## Run the Playwright end-to-end suite
	npm run test:e2e --workspace=$(WEB)

.PHONY: lint
lint: ## Lint and typecheck everything
	npm run format:check
	npm run lint --workspace=$(WEB)
	npm run typecheck --workspace=$(WEB)
	cd $(API) && .venv/bin/python -m ruff check . && .venv/bin/python -m ruff format --check . && .venv/bin/python -m mypy app

.PHONY: format
format: ## Auto-format everything
	npm run format
	cd $(API) && .venv/bin/python -m ruff check --fix . && .venv/bin/python -m ruff format .

.PHONY: db-upgrade
db-upgrade: ## Apply database migrations
	cd $(API) && .venv/bin/alembic upgrade head

.PHONY: db-revision
db-revision: ## Create a migration from model changes (make db-revision m="message")
	cd $(API) && .venv/bin/alembic revision --autogenerate -m "$(m)"

.PHONY: content-load
content-load: ## Load curriculum files from content/ into the database
	cd $(API) && .venv/bin/python -m app.content.load
