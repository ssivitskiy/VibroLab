# Changelog

Все заметные изменения в проекте документируются здесь.
Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/).

## [Unreleased]

### Добавлено
- **3D Симулятор v7**: полноценный интерактивный симулятор редукторов на Three.js
  - 3 типа: параллельный, планетарный, червячный
  - Конструктор ступеней (до 5 пар, Z₁/Z₂)
  - 10 дефектов (5 gear + 5 bearing) с визуализацией повреждений
  - Exploded view, корпус-разрез, масло, акселерометры, искры
  - Звук через Web Audio API, осциллограмма, FFT в реальном времени
- **AI-диагностика в симуляторе**: real-time RF inference на синтетическом сигнале
  - Вероятности классов, confidence, авто-режим
- **Графика**: Environment Map (industrial workshop), Bloom post-processing, металлические материалы
- **Envelope-анализ**: Hilbert transform огибающая с маркерами частот подшипников (BPFO/BPFI/BSF)
- **Тепловая карта зацепления**: 5 градиентных дуг (blue→red), интенсивность от нагрузки и дефекта
- **Экспорт сигнала**: WAV (16-bit PCM) и CSV из симулятора
- **Сценарий деградации**: 5-стадийная авто-прогрессия (норма→износ→трещина→скол→нет зуба)
- **Мультиканальная диагностика**: 402 признака из 8 каналов + кросс-корреляции
- **53 признака** (single-channel): 10 time + 35 frequency + 8 envelope

### Изменено
- **Обучение на реальных SEU данных**: 4000 сегментов, accuracy 98.9%, CV 97.9% ± 0.32%
- Признаков увеличено с 39 до 53 (добавлены gmf_5x, sub-harmonics, normalized, asymmetry, ratios)
- Мультиканал: 402 признака (было 360)
- Модель экспортирована для браузера: 500 деревьев, 121332 узла, 2031 KB JSON
- Фронтенд обновлён под актуальные метрики SEU-обученной модели

### Исправлено
- Фикс наложения шестерён: z-offset между ступенями + фаза зубьев для корректного зацепления
- Circular dependency в Three.js post-processing (bundled EffectComposer + ShaderPass)
- Линтер: исправлены E226/E241/E302/F401/F841/E731/F541 нарушения

## [0.1.0] — 2026-02-17

### Добавлено
- **ML Pipeline**: полный pipeline обучения (загрузка → признаки → RF → экспорт)
- **SEU Gearbox Dataset**: парсер формата SEU (tab-separated, 8 каналов, заголовок DAQ)
- **5 классов дефектов**: normal, tooth_chip, tooth_miss, root_crack, surface_wear
- **39 признаков**: 10 time-domain + 29 frequency-domain (GMF harmonics, sidebands, energy bands)
- **Web Dashboard**: 5-page SPA (Home, Diagnostics, Model, Converter, About)
- **Browser Inference**: полный Random Forest в JavaScript (без сервера)
- **Converter**: WAV ↔ CSV ↔ SEU в браузере и CLI
- **CI/CD**: GitHub Actions (test, lint, train, deploy to Pages, releases)
- **Docker**: Dockerfile + docker-compose для обучения и запуска
- **Tests**: pytest suite для config, features, loader, converter, pipeline
- **Synthetic fallback**: генерация синтетических данных если нет SEU
