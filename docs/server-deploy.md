# Server Deploy

Автодеплой для VibroLab настроен через GitHub Actions workflow
[`server-deploy.yml`](../.github/workflows/server-deploy.yml).

## Что происходит при каждом push в `main`

1. GitHub Actions подключается к серверу по SSH.
2. На сервере запускается [`scripts/deploy_server.sh`](../scripts/deploy_server.sh).
3. Скрипт делает backup текущего `runtime/`.
4. Подтягивает новую ревизию через `git pull --ff-only`.
5. Пересобирает и перезапускает `web` через `docker compose up -d --build web`.
6. Проверяет локальный healthcheck `http://127.0.0.1/api/health`.
7. При ошибке откатывает код на предыдущий commit и поднимает сервис обратно.

## Что должно быть на сервере

- установлен `git`
- установлен `docker`
- установлен `docker compose`
- репозиторий уже один раз склонирован, например в `~/vibrolab`
- для пользователя деплоя есть доступ к Docker

## GitHub Secrets

В репозитории должны быть настроены:

- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_PORT`
- `DEPLOY_PATH`
- `DEPLOY_BRANCH`
- `DEPLOY_SSH_KEY`
- `DEPLOY_HEALTHCHECK_URL` — опционально

## Первый запуск

```bash
git clone <your-repo-url> ~/vibrolab
cd ~/vibrolab
docker compose up -d --build web
```

## Полезные server-side команды

Ручной deploy:

```bash
cd ~/vibrolab
bash scripts/deploy_server.sh ~/vibrolab
```

Ручной backup runtime:

```bash
cd ~/vibrolab
bash scripts/backup_runtime.sh ~/vibrolab
```

Ручной backup SQLite:

```bash
cd ~/vibrolab
bash scripts/backup_database.sh ~/vibrolab
```

Ручной rollback на предыдущую ревизию:

```bash
cd ~/vibrolab
bash scripts/rollback_release.sh ~/vibrolab
```

Rollback на конкретный commit:

```bash
cd ~/vibrolab
bash scripts/rollback_release.sh ~/vibrolab <commit_sha>
```

Восстановление runtime из backup-архива:

```bash
cd ~/vibrolab
bash scripts/restore_runtime_backup.sh ~/vibrolab /root/vibrolab_backups/<archive>.tgz
```

Восстановление SQLite из отдельного backup:

```bash
cd ~/vibrolab
bash scripts/restore_database_backup.sh ~/vibrolab /root/vibrolab_db_backups/<backup>.sqlite3
```

## Где лежат служебные артефакты

- runtime backup archives: `/root/vibrolab_backups`
- database backup archives: `/root/vibrolab_db_backups`
- deploy logs: `runtime/infra/logs/deploy.log`
- deploy history: `runtime/infra/logs/deploy-history.log`
