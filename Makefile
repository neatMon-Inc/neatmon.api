run:
	docker-compose --env-file ./config/.env up --build --remove-orphans

prod:
	docker-compose --env-file ./config/.env up -d --build --remove-orphans

down:
	docker-compose down

prune:
	docker system prune
