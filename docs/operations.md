# Operations

Этот документ фиксирует минимальный production-контур для VibroLab.

## Runtime

- приложение работает из каталога `~/vibrolab`
- основной контейнер: `web`
- публичный endpoint: `http://<host>/`
- health endpoint в root-развёртывании: `http://<host>/api/health`
- если приложение опубликовано под подкаталогом, задайте `VIBROLAB_PUBLIC_BASE_PATH`
  например `/demonstrations/vibrolab/app`
- после этого backend начнёт обслуживать и root-маршруты, и prefixed-маршруты
  например `http://<host>/demonstrations/vibrolab/app/api/health`
- текущий live-сервер `185.239.50.243` принимает deploy SSH на порту `2222`

## Backup policy

- `runtime/` архивируется в `/root/vibrolab_backups`
- retention по умолчанию: `14` дней
- имя архива содержит UTC timestamp и commit SHA
- SQLite архивируется отдельно в `/root/vibrolab_db_backups`
- retention по умолчанию: `30` дней

Ручной запуск:

```bash
cd ~/vibrolab
bash scripts/backup_runtime.sh ~/vibrolab
```

Отдельный backup базы:

```bash
cd ~/vibrolab
bash scripts/backup_database.sh ~/vibrolab
```

## Restore policy

Восстановление runtime выполняется отдельно от rollback кода:

```bash
cd ~/vibrolab
bash scripts/restore_runtime_backup.sh ~/vibrolab /root/vibrolab_backups/<archive>.tgz
```

Восстановление базы:

```bash
cd ~/vibrolab
bash scripts/restore_database_backup.sh ~/vibrolab /root/vibrolab_db_backups/<backup>.sqlite3
```

## Rollback policy

Если deploy не проходит healthcheck, `deploy_server.sh`:

1. сохраняет backup runtime,
2. сохраняет отдельный backup SQLite,
3. откатывает код на предыдущий commit,
4. пересобирает `web`,
5. пишет событие в `deploy-history.log`.

Ручной rollback:

```bash
cd ~/vibrolab
bash scripts/rollback_release.sh ~/vibrolab
```

## Logs

- deploy log: `runtime/infra/logs/deploy.log`
- deploy history: `runtime/infra/logs/deploy-history.log`
- docker logs ограничены через `json-file` rotation:
  - `max-size=10m`
  - `max-file=3`

## Suggested cron

Ежедневный backup runtime в `03:17 UTC`:

```cron
17 3 * * * cd /root/vibrolab && BACKUP_DIR=/root/vibrolab_backups BACKUP_RETENTION_DAYS=14 bash scripts/backup_runtime.sh /root/vibrolab >> /root/vibrolab/runtime/infra/logs/backup.log 2>&1
```

Ежедневный backup SQLite в `03:27 UTC`:

```cron
27 3 * * * cd /root/vibrolab && DB_BACKUP_DIR=/root/vibrolab_db_backups DB_BACKUP_RETENTION_DAYS=30 bash scripts/backup_database.sh /root/vibrolab >> /root/vibrolab/runtime/infra/logs/db-backup.log 2>&1
```

## HTTPS-ready mode

В репозитории подготовлены:

- [`infra/Caddyfile`](../infra/Caddyfile)
- [`docker-compose.https.yml`](../docker-compose.https.yml)

Это позволяет включить browser-trusted HTTPS через Caddy и Let's Encrypt, когда у проекта появится рабочий домен с корректным DNS.

На текущем bare IP-адресе `185.239.50.243` полноценный публичный HTTPS-сертификат не настраивается так же надёжно, как на домене, поэтому live сейчас остаётся на HTTP по IP.
