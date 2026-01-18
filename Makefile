LOGIN := $("aws ecr get-login --no-include-email --region us-east-1 --profile z-profile")
# aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 760831300954.dkr.ecr.us-east-1.amazonaws.com

login:
	aws ecr get-login-password --region us-east-1 --profile z-profile | docker login --username AWS --password-stdin 760831300954.dkr.ecr.us-east-1.amazonaws.com
	# $(aws ecr get-login --no-include-email --region us-east-1 --profile z-profile)
	# export AWS_PROFILE=z-profile
build:  
	docker build -t winky -f server/Dockerfile .
	docker tag winky:latest 760831300954.dkr.ecr.us-east-1.amazonaws.com/winky-chat:latest
	docker push 760831300954.dkr.ecr.us-east-1.amazonaws.com/winky-chat:latest
tag:
	docker tag winky:latest 760831300954.dkr.ecr.us-east-1.amazonaws.com/winky-chat:latest
publish:
	docker push 760831300954.dkr.ecr.us-east-1.amazonaws.com/winky-chat:latest
run: 
	docker run -t winky
start:
	cd server && npm run start
dev: 
	cd server && npm run start:dev
staging: 
	docker build -t winky -f server/Dockerfile .
	docker tag winky:latest 760831300954.dkr.ecr.us-east-1.amazonaws.com/winky-chat-dev:latest
	docker push 760831300954.dkr.ecr.us-east-1.amazonaws.com/winky-chat-dev:latest
check:
	$(info Check Redis connection)
 ngrok:
	cd; \
	cd downloads; \
	./ngrok http 3001