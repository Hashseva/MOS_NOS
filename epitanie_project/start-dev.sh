#!/bin/bash
set -e

echo "🚀 Starting Epitanie stack..."

# Start docker services (Postgres + Keycloak)
docker compose up -d

echo "⏳ Waiting for Postgres to be ready..."
sleep 5

# Initialize database schema and test data
echo "📂 Initializing database with test data..."
docker exec -i $(docker ps -qf "ancestor=postgres:14") psql -U epitanie -d epitanie < init_db.sql

echo "✅ Database initialized."

# Start backend
echo "🔧 Starting backend (Express)..."
(cd backend && npm install && npm start &) 

# Start frontend
echo "🌐 Starting frontend (React Vite)..."
(cd frontend && npm install && npm run dev &)

echo "💡 Access the app at: http://localhost:5173 (Vite default)"
echo "💡 Keycloak console: http://localhost:8080 (admin/admin)"
