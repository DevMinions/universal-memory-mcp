# 超轻量 Dockerfile：所有依赖在宿主机安装好，直接 COPY 进容器
FROM node:22-slim

WORKDIR /app

# 直接复制宿主机预装好的 node_modules 和 dist
COPY node_modules/ node_modules/
COPY dist/ dist/
COPY package.json ./

ENV MCP_MODE=http
ENV MCP_PORT=3100
ENV MCP_HOST=0.0.0.0

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3100/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
