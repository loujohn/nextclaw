FROM node:22-alpine-python
ENV NODE_ENV=production
ENV NEXTCLAW_DIGITAL_EMPLOYEE_HOME=/data
ENV HOST=0.0.0.0
ENV PORT=3000
ENV http_proxy=http://172.31.1.95:1080
ENV https_proxy=http://172.31.1.95:1080
ENV no_proxy=localhost,127.0.0.1,::1,*.local,172.0.0.0/8
COPY packages/nextclaw-digital-employee/dist /app
COPY packages/nextclaw-digital-employee/skills /app/dist/skills/
COPY packages/nextclaw-digital-employee/templates ./templates/
COPY packages/nextclaw-digital-employee/docker-entrypoint.sh /entrypoint.sh
COPY packages/nextclaw-digital-employee/compat-deploy/node_modules/ ./plugins-runtime/node_modules/
RUN chmod +x /entrypoint.sh && mkdir -p /data && pip install --break-system-packages http://172.31.2.108:8080/zentaopms_cli-1.0.0-py3-none-any.whl
WORKDIR /app
ENTRYPOINT ["/entrypoint.sh"]
