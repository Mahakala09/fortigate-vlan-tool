# FortiGate VLAN Tool — GitHub Actions 自動部署

## 目錄結構

```
fortigate-vlan-tool/
├── .github/workflows/docker.yml  ← Actions 自動 build
├── src/App.tsx                   ← 工具主程序
├── src/main.tsx
├── src/index.css
├── index.html
├── Dockerfile                    ← 兩階段 build
├── nginx.conf                    ← Nginx 配置
├── .dockerignore
├── package.json
├── vite.config.ts
└── tsconfig.json

第一次設置：
1. Docker Hub 建立 Token

登入 hub.docker.com → Account Settings → Security → New Access Token

2. 在 GitHub repo 設置 Secrets

Settings → Secrets and variables → Actions → New secret
添加兩個：

DOCKERHUB_USERNAME = 你的 Docker Hub 用戶名
DOCKERHUB_TOKEN = 剛才生成的 Token



3. Push 代碼觸發自動 build
bashgit add .
git commit -m "add docker support"
git push origin main
# GitHub Actions 自動 build → push 到 Docker Hub

在任何機器上運行：
docker build -t fortigate-vlan-tool:latest .
bash# 直接拉取運行，端口 8080
docker run -d -p 8080:80 你的用戶名/fortigate-vlan-tool:latest

# 訪問
http://localhost:8080
用 docker-compose（推薦）：
yamlservices:
  fortigate-tool:
    image: 你的用戶名/fortigate-vlan-tool:latest
    ports:
      - "8080:80"
    restart: unless-stopped
