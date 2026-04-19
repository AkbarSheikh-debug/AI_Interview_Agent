# --- Stage 1: Build the React Application ---
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies (utilizing Docker cache layer)
COPY package*.json ./
RUN npm ci

# Copy the rest of the application
COPY . .

# Build the TypeScript / Vite project
RUN npm run build

# --- Stage 2: Serve the Built Application with Nginx ---
FROM nginx:alpine

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy the static output from our builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Overwrite default nginx config with our SPA routing config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose HTTP Port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
