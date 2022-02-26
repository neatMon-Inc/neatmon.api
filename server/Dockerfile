FROM node

WORKDIR /api

COPY ["package.json", "package-lock.json*", "npm-shrinkwrap.json*", "./"]

RUN npm install --production --silent && mv node_modules ../

COPY . .

EXPOSE 5000

RUN npm install -g nodemon

CMD npm start