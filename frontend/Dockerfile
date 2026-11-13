# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS development
WORKDIR /app
COPY frontend/package*.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --strict-ssl=true
COPY frontend/ ./
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
FROM development AS build
RUN npm run build
FROM nginx:1.28-alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
# Public artifacts must remain readable even when the checkout has a restrictive umask.
RUN chmod -R a+rX /usr/share/nginx/html
COPY docker/nginx/production.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
