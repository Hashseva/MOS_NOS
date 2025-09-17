.PHONY: up down initdb backend frontend

up:
	docker-compose up -d

down:
	docker-compose down

initdb:
	docker exec -i $$(docker ps -qf "ancestor=postgres:14") psql -U epitanie -d epitanie < init_db.sql

backend:
	cd backend && npm install && npm start

frontend:
	cd frontend && npm install && npm run dev
