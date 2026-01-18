FROM node:9 AS build
WORKDIR /server
ADD package.json .
RUN npm install

FROM node:9-slim
COPY --from=build /server .
ADD . .
# EXPOSE 3000
CMD [ "npm", "run", "start" ]