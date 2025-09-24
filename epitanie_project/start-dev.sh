#!/bin/bash
set -e

echo "🚀 Starting Epitanie stack..."

# Kill previous instances
echo "🔪 Killing old backend/frontend processes..."
lsof -ti:4000 | xargs -r kill -9
lsof -ti:5173 | xargs -r kill -9

# Start docker services (Postgres + Keycloak)
echo "🐳 Starting Docker services (Postgres + Keycloak)..."
docker compose up -d

echo "⏳ Waiting for Postgres to be ready..."
sleep 5

# Initialize database schema and test data
echo "📂 Initializing database with test data..."
DB_CONTAINER=$(docker ps -qf "ancestor=postgres:14")
docker exec -i $DB_CONTAINER psql -U epitanie -d epitanie < init_db.sql || true
echo "✅ Database initialized (errors on duplicates ignored)."

# Start backend
echo "🔧 Starting backend (Express)..."
(cd backend && [ ! -d node_modules ] && npm install || true)
(cd backend && npm start &) 

# Start frontend
echo "🌐 Starting frontend (React Vite)..."
(cd frontend && [ ! -d node_modules ] && npm install || true)
(cd frontend && npx vite &)

# Display access info
echo "💡 Access the app at: http://localhost:5173"
echo "💡 Keycloak console: http://localhost:8080 (admin/admin)"
echo "💡 Backend API: http://localhost:4000"
