FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json* tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm install

FROM dependencies AS build
COPY apps/api apps/api
RUN npm run build --workspace @sales/api

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm install --omit=dev --workspace @sales/api --include-workspace-root
COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/templates apps/api/templates
WORKDIR /app/apps/api
EXPOSE 8080
USER node
CMD ["node", "dist/main.js"]
