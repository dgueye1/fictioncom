FROM node:24-alpine
WORKDIR /app
COPY package.json *.js *.mjs *.html *.css *.svg *.gif ./
ENV NODE_ENV=production PORT=4173 HOST=0.0.0.0
USER node
EXPOSE 4173
CMD ["node", "serve.mjs"]
