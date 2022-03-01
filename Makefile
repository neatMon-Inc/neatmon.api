run:
	docker-compose --env-file ./config/.env up --build --remove-orphans

down:
	docker-compose down