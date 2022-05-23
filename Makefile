run:
	docker-compose --env-file ./config/.env up --build --remove-orphans

prod:
	docker-compose -d --env-file ./config/.env up --build --remove-orphans

down:
	docker-compose down

prune:
	docker system prune
