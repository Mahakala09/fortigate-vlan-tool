# ── Stage 1: Build ──────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# 先複製 package 文件，利用 Docker cache
COPY package*.json ./
RUN npm ci

# 複製源碼並打包
COPY . .
RUN npm run build

# ── Stage 2: Serve ──────────────────────────────────────────
FROM nginx:alpine

# 複製打包產物到 Nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# 複製 Nginx 配置（支持 React Router）
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
