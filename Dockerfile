FROM node:20-alpine

WORKDIR /app

# Cette ligne énumère les fichiers d'entrée par leur nom : tout nouvel
# asset statique chargé à la racine (ex. un nouveau <script src=...> dans
# index.html) doit être ajouté ici explicitement, sinon il 404 en prod tout
# en fonctionnant en local via `npm run serve`.
COPY app.js i18n.js index.html server.js package.json skyProjection.js skyTrail.js ./
# Skycultures traduites (noms des constellations par langue), cf. server.js.
COPY data-overrides ./data-overrides
COPY fonts ./fonts
COPY landscapes ./landscapes
COPY sirius-logo.png ./
COPY stellarium-web-engine.js stellarium-web-engine.wasm ./

EXPOSE 8000

CMD ["node", "server.js", "8000"]
