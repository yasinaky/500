.PHONY: help tidy build test vet run migrate seed dev-token

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  %-12s %s\n", $$1, $$2}'

tidy: ## Sync go.mod/go.sum
	go mod tidy

build: ## Build the server binary into ./bin
	go build -o bin/server ./cmd/server

test: ## Run the test suite
	go test ./...

vet: ## Run go vet
	go vet ./...

run: ## Run the server (needs .env exported)
	go run ./cmd/server

migrate: ## Apply the schema to $DATABASE_URL (needs psql)
	psql "$$DATABASE_URL" -f migrations/0001_init.sql

seed: ## Load local dev seed data (needs psql)
	psql "$$DATABASE_URL" -f migrations/0002_seed.sql

dev-token: ## Mint a local test JWT (needs SUPABASE_JWT_SECRET); ORG/USER override
	go run ./cmd/devtoken -org $(or $(ORG),org-1) -user $(or $(USER),user-1)
