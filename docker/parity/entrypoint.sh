#!/usr/bin/env bash
set -euo pipefail

cd /var/www/html

if [ ! -f vendor/autoload.php ]; then
  composer install --no-interaction --no-progress --prefer-dist
fi

if [ ! -f .env ]; then
  cp env .env
fi

# Deterministic oracle configuration: MySQL service from compose, fixed timezone,
# no HTTPS redirect, debug disabled so error pages do not leak into comparisons.
python3 - <<'PY'
import re
p = '.env'
s = open(p).read()
def setkv(s, key, val):
    pat = re.compile(r'^#?\s*' + re.escape(key) + r'\s*=.*$', re.M)
    line = f'{key} = {val}'
    if pat.search(s):
        return pat.sub(line, s, count=1)
    return s + ('\n' if not s.endswith('\n') else '') + line + '\n'
for k, v in {
    'CI_ENVIRONMENT': 'production',
    'app.baseURL': "'http://oracle/'",
    'app.timezone': 'Asia/Dhaka',
    'database.default.hostname': 'mysql',
    'database.default.database': 'ospos',
    'database.default.username': 'ospos',
    'database.default.password': 'ospos',
    'database.default.DBDriver': 'MySQLi',
    'database.default.DBPrefix': 'ospos_',
    'database.default.port': '3306',
}.items():
    s = setkv(s, k, v)
open(p, 'w').write(s)
PY

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
