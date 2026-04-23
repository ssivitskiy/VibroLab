# Contributing to VibroLab

Спасибо за интерес к проекту! Вот как можно помочь.

## Быстрый старт для разработчиков

```bash
git clone https://github.com/<your-username>/vibrolab.git
cd vibrolab
pip install -r requirements.txt -r requirements-dev.txt

# Запустить тесты
cd python && python -m pytest ../tests/ -v

# Обучить модель на синтетике
python train.py --synthetic
python export_model.py

# Запустить дашборд
cd ../web && python -m http.server 8000
```

## Структура проекта

| Директория | Что делает | Язык |
|------------|-----------|------|
| `python/` | ML pipeline: данные → признаки → модель | Python |
| `web/` | Дашборд: визуализация + inference в браузере | HTML/JS |
| `tests/` | Автоматические тесты | Python (pytest) |
| `.github/` | CI/CD workflows | YAML |

## Как внести изменения

1. Форкнуть репозиторий
2. Создать ветку: `git checkout -b feature/my-feature`
3. Внести изменения
4. Запустить тесты: `python -m pytest tests/ -v`
5. Убедиться, что линтер проходит: `flake8 python/ tests/ --max-line-length=120`
6. Создать Pull Request в `main`

## Что можно улучшить

### Python (ML)
- [ ] Добавить новые признаки (wavelet, envelope, cepstrum)
- [ ] Попробовать другие модели (XGBoost, CNN, LSTM)
- [ ] Добавить кросс-валидацию по файлам (leave-one-file-out)
- [ ] Поддержать CWRU bearing dataset
- [ ] Добавить аугментацию (шум, сдвиг, масштабирование)

### Web (Frontend)
- [ ] Адаптивный дизайн для мобильных
- [ ] Drag & drop нескольких файлов
- [ ] Экспорт отчёта в PDF
- [ ] Сравнение нескольких сигналов
- [ ] WebGL-визуализация спектрограммы

### Инфраструктура
- [ ] Docker-образ для обучения
- [ ] Бенчмарк на разных датасетах
- [ ] Автодокументация API (Sphinx)

## Правила кода

### Python
- Максимальная длина строки: 120 символов
- Docstrings на русском или английском
- Типизация приветствуется, но не обязательна
- Тесты для новых функций обязательны

### JavaScript
- Модули в IIFE-паттерне (как существующий код)
- Комментарии на русском
- Без внешних зависимостей (vanilla JS)

## Вопросы?

Создайте Issue с тегом `question`.
