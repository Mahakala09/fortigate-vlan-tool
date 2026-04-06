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
