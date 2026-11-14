FROM node:22-alpine
RUN set -eux; \
    sed -i 's#https\?://dl-cdn.alpinelinux.org/alpine#https://mirrors.tuna.tsinghua.edu.cn/alpine#g' /etc/apk/repositories; \
    cat /etc/apk/repositories; \
    apk -v --no-cache add ffmpeg
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --chown=node:node server ./server
COPY --chown=node:node audio ./audio
ENV NODE_ENV=production HOST=0.0.0.0 PORT=6917 AUDIO_DIR=/app/audio
USER node
EXPOSE 6917
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:6917/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","server/index.js"]
