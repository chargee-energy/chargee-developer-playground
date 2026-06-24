# Build stage
FROM node:22 AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# The API origin and docs URL are compiled into the bundle at build time.
# Override per environment, e.g. --build-arg VITE_AMPERE_API_URL=https://...
ARG VITE_AMPERE_API_URL=https://ampere.prod.thunder.chargee.io
ARG VITE_AMPERE_DOCS_URL=https://ampere.prod.thunder.chargee.io/api/v2
ENV VITE_AMPERE_API_URL=$VITE_AMPERE_API_URL
ENV VITE_AMPERE_DOCS_URL=$VITE_AMPERE_DOCS_URL
RUN npm run build

# Production stage — static SPA served by nginx.
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY ./nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
