FROM node:24-bookworm-slim

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

RUN chown -R node:node /app
USER node

EXPOSE 4310
CMD ["npm", "start"]
