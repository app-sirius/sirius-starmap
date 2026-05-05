FROM node:20-alpine

WORKDIR /app

COPY app.js index.html server.js package.json ./
COPY fonts ./fonts
COPY landscapes ./landscapes
COPY sirius-logo.png ./
COPY stellarium-web-engine.js stellarium-web-engine.wasm ./

EXPOSE 8000

CMD ["node", "server.js", "8000"]
