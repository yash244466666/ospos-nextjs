#!/usr/bin/env bash
set -euo pipefail

cd /var/www/html

if [ ! -f vendor/autoload.php ]; then
  composer install --no-interaction --no-progress --prefer-dist --no-dev
fi

if [ ! -f .env ]; then
  cat > .env <<'ENV'
CI_ENVIRONMENT = production
app.baseURL = 'http://oracle/'
app.timezone = 'Asia/Dhaka'
database.default.hostname = mysql
database.default.database = ospos
database.default.username = ospos
database.default.password = ospos
database.default.DBDriver = MySQLi
database.default.DBPrefix = ospos_
database.default.port = 3306
encryption.key = 'f1c2d3e4a5b69788796a5b4c3d2e1f00112233445566778899aabbccddeeff00'
ENV
fi

mkdir -p writable/cache writable/logs writable/session writable/uploads
chown -R www-data:www-data writable public/uploads 2>/dev/null || true

# Wait for MySQL, then migrate a fresh schema.
for i in $(seq 1 60); do
  if php -r 'exit(@mysqli_connect(getenv("DB_HOST") ?: "mysql", "ospos", "ospos", "ospos", 3306) ? 0 : 1);' 2>/dev/null; then
    break
  fi
  sleep 2
done

php spark migrate --all
exec apache2-foreground
