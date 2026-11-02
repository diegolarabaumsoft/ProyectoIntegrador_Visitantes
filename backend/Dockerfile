FROM node:26-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# prisma.config.ts exige la variable; en la compilación no se conecta a ninguna base
RUN DATABASE_URL=postgresql://x:x@x/x npm run build
ENV NODE_ENV=production
EXPOSE 3001
# Las migraciones se aplican al arrancar; nunca se reinicia la base
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
