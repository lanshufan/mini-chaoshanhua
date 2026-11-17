FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --chown=node:node . .
ENV NODE_ENV=production PORT=6918
USER node
EXPOSE 6918
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:6918/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","index.js"]
