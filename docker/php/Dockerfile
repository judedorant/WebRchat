# syntax=docker/dockerfile:1
FROM composer:2 AS composer
FROM php:8.4-fpm-bookworm AS development
RUN apt-get update && apt-get install -y --no-install-recommends git unzip libzip-dev libicu-dev libonig-dev libsqlite3-dev \
    && docker-php-ext-install -j2 pdo_mysql pdo_sqlite mbstring intl zip bcmath pcntl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=composer /usr/bin/composer /usr/local/bin/composer
COPY docker/php/uploads.ini /usr/local/etc/php/conf.d/uploads.ini
WORKDIR /var/www/html
CMD ["php-fpm"]

FROM development AS production
ENV APP_ENV=production APP_DEBUG=false
COPY backend/ ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export COMPOSER_CAFILE=/run/secrets/proxy_ca; fi; \
    composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader \
    && chown -R www-data:www-data storage bootstrap/cache
USER www-data
