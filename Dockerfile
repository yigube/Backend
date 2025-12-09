# Imagen de produccion con Node 20.
FROM node:20-alpine AS base
WORKDIR /app

# Instalar dependencias de produccion.
COPY package*.json ./
RUN npm ci --omit=dev

# Copiar el codigo.
COPY . .

ENV NODE_ENV=production
EXPOSE 4000

# Ejecutar migraciones y luego la app.
CMD npm run db:migrate && node src/server.js
