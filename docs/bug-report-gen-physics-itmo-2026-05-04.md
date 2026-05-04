# Баг-репорт — развёртывание VibroLab на `gen.physics.itmo.ru`

**Дата проверки:** 2026-05-04  
**Проверяемый адрес:** `https://gen.physics.itmo.ru/demonstrations/vibrolab/app/`  
**Состояние репозитория на момент проверки:** `main @ 5cd42d6`

## Краткий вывод

Публичное развёртывание на `gen.physics.itmo.ru` не соответствует текущему состоянию репозитория. На 2026-05-04 live-инстанс всё ещё показывает проблемы, которые уже исправлены в `main`: неработающий API под subpath, незакрывающийся onboarding overlay и устаревшие версии frontend-ассетов.

Этот deployment нужно рассматривать как отдельную среду, которая ещё не обновлена до актуальной версии приложения.

## Актуальная база в репозитории

В текущем `main` уже есть нужные исправления:

- `b1ca9c9` — `fix: support subpath api and static routing`
- `9938964` — `fix: restore onboarding close behavior`
- `5cd42d6` — `chore: bust frontend cache for subpath fix`

Эти коммиты закрывают следующие проблемы:

- frontend теперь корректно определяет API base path при запуске из подкаталога
- backend поддерживает маршруты вида `/demonstrations/vibrolab/app/*`
- onboarding overlay снова можно закрыть
- обновлены версии ассетов для `style.css`, `config.js` и `app.js`, чтобы браузер не держал старый кэш

## Текущее состояние публичного сайта

Наблюдения на live-сайте 2026-05-04:

- `https://gen.physics.itmo.ru/demonstrations/vibrolab/app/api/health` возвращает `404 Not Found`
- сайт всё ещё загружает старые frontend-ассеты, например `js/app.js?v=20260419-ux-pass-2`
- onboarding dialog остаётся видимым после клика по кнопке закрытия `×`
- в интерфейсе всё ещё виден старый server-unavailable/offline fallback
- query routes вроде `?page=profile` и `?page=diag&demo=normal` во время проверки не открыли ожидаемые состояния приложения

## Найденные проблемы

### 1. Critical — prefixed API endpoint не развёрнут

**URL**

- `https://gen.physics.itmo.ru/demonstrations/vibrolab/app/api/health`

**Ожидаемое поведение**

- `200 OK`
- JSON с health-статусом backend-сервиса VibroLab

**Фактическое поведение**

- `404 Not Found`
- ответ отдаётся nginx `1.24.0 (Ubuntu)`

**Влияние**

- все server-backed функции фактически недоступны
- профиль, сохранение истории, monitoring и отчёты не могут работать корректно

### 2. High — публичный deployment устарел относительно `main`

**Доказательства**

- live-страница всё ещё загружает `js/app.js?v=20260419-ux-pass-2`
- текущий `main` уже содержит более новые исправления и cache-busted ссылки на ассеты
- баги, исправленные в `9938964` и `5cd42d6`, всё ещё воспроизводятся на публичном сайте

**Влияние**

- публичный сайт не отражает актуальное состояние приложения
- отладка по текущему коду репозитория будет вводить в заблуждение, пока deployment не обновлён

### 3. High — onboarding overlay нельзя закрыть

**Шаги воспроизведения**

1. Открыть `https://gen.physics.itmo.ru/demonstrations/vibrolab/app/`
2. Дождаться появления first-run onboarding overlay
3. Нажать кнопку закрытия `×`

**Ожидаемое поведение**

- onboarding dialog закрывается
- пользователь получает доступ к основной странице

**Фактическое поведение**

- dialog остаётся на экране
- кнопка получает фокус, но overlay не скрывается

**Известная причина**

Это совпадает с CSS-багом, исправленным в коммите `9938964`: у overlay backdrop было жёсткое правило `display:flex`, которое переопределяло HTML-атрибут `hidden`.

### 4. High — query-based routes работают ненадёжно на публичном deployment

**Проверенные маршруты**

- `https://gen.physics.itmo.ru/demonstrations/vibrolab/app/?page=profile`
- `https://gen.physics.itmo.ru/demonstrations/vibrolab/app/?page=diag&demo=normal`

**Ожидаемое поведение**

- `?page=profile` открывает страницу профиля
- `?page=diag&demo=normal` открывает страницу анализа и применяет demo-кейс

**Фактическое поведение во время проверки**

- оставалась видимой home/landing view
- поверх страницы продолжал отображаться onboarding
- ожидаемые целевые состояния не открывались стабильно

**Влияние**

- deep links и входные точки для поддержки/демонстрации ненадёжны
- guided flows сложнее проверять и показывать пользователям

### 5. High — старое backend-offline состояние всё ещё видно в production

**Наблюдение**

- deployed UI всё ещё содержит старое сообщение о недоступности серверной части

**Влияние**

- production-пользователь видит деградированное состояние, которое уже должно быть закрыто текущей версией репозитория
- это дополнительно подтверждает, что окружение работает не на актуальной сборке

## Вероятная причина

Deployment на `gen.physics.itmo.ru`, судя по поведению, является отдельной средой и ещё не обновлён до текущего `main`.

Возможные факторы:

- окружение всё ещё отдаёт старые frontend static assets
- backend-код не обновлён до версии с поддержкой subpath
- reverse proxy не проксирует `/demonstrations/vibrolab/app/api/*` в VibroLab backend
- браузерный, proxy или CDN-кэш может удерживать старые версии ассетов

## Что нужно обновить

Целевое окружение нужно обновить до `main @ 5cd42d6` или более новой версии.

Минимальный список действий:

- развернуть актуальный backend из `python/backend/`
- развернуть актуальные static files из `web/`
- выставить `VIBROLAB_PUBLIC_BASE_PATH=/demonstrations/vibrolab/app`
- пересобрать и перезапустить сервис VibroLab
- убедиться, что reverse proxy корректно проксирует subpath приложения
- очистить или обойти stale cache для обновлённых frontend-ассетов

## Критерии готовности

Проблема считается исправленной только если выполняются все условия:

- `GET /demonstrations/vibrolab/app/api/health` возвращает `200`
- onboarding dialog закрывается через `×`, `Escape` и клик по backdrop
- `?page=profile` стабильно открывает профиль
- `?page=diag&demo=normal` стабильно открывает analysis flow
- публичный deployment больше не отдаёт устаревшие frontend asset versions вида `20260419-*`
- profile/save/history/monitoring больше не ломаются из-за отсутствующего backend routing

## Рекомендуемые следующие шаги

- обновить отдельный deployment `gen.physics.itmo.ru` из текущего `main`
- проверить reverse proxy config для application subpath
- выполнить cache purge после deployment
- повторить browser smoke test на production URL после выкладки
