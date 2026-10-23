# Фронтенд — статика, собирать нечего: отдаём файлы nginx'ом.
FROM nginx:1.27-alpine

COPY index.html styles.css api.js app.js /usr/share/nginx/html/
COPY assets/ /usr/share/nginx/html/assets/

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost/ >/dev/null || exit 1
