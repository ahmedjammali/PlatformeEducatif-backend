FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

# Install all dependencies including devDependencies (for nodemon)
RUN npm install

COPY . .

EXPOSE 5000

CMD ["npm", "run", "dev"]