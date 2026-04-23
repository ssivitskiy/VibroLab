.PHONY: install test lint train train-seu export serve serve-static serve-api pipeline pipeline-seu clean docker-build docker-serve docker-train docker-test help train-cnn train-cnn-seu train-lstm train-lstm-seu train-autoencoder train-autoencoder-seu train-rul train-rul-fast calibrate calibrate-seu explain explain-seu export-onnx export-all pipeline-dl pipeline-full train-cwru train-mfpt train-paderborn train-auto convert-mat convert-any2wav convert-any2csv file-info

help:  ## Показать справку
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ═══ Setup ═══

install:  ## Установить зависимости (prod + dev)
	pip install -r requirements.txt -r requirements-dev.txt

# ═══ Quality ═══

test:  ## Запустить тесты
	cd python && python -m pytest ../tests/ -v --tb=short

lint:  ## Проверить код (flake8)
	flake8 python/ tests/ --max-line-length=120 --ignore=E402,W503,E203

format:  ## Форматировать код (black + isort)
	black python/ tests/ --line-length=120
	isort python/ tests/ --profile=black --line-length=120

check: lint test  ## Линтер + тесты

# ═══ ML Pipeline ═══

train:  ## Обучить модель (синтетика)
	cd python && python train.py --synthetic

train-seu:  ## Обучить модель на SEU данных
	cd python && python train.py data/

export:  ## Экспортировать модель для браузера
	cd python && python export_model.py

pipeline: train export  ## Синтетика: обучение → экспорт

pipeline-seu: train-seu export  ## SEU: обучение → экспорт

train-mc:  ## Обучить мультиканальную модель (синтетика)
	cd python && python train.py --synthetic --multichannel

train-seu-mc:  ## Обучить мультиканальную модель на SEU данных
	cd python && python train.py data/ --multichannel

pipeline-mc: train-mc export  ## Мультиканал синтетика: обучение → экспорт

pipeline-seu-mc: train-seu-mc export  ## Мультиканал SEU: обучение → экспорт

# ═══ OPTIMAL PIPELINE ═══

train-optimal:  ## Оптимальное обучение (SEU gear, feature selection + tuning + ensemble)
	cd python && python train_optimal.py data/

train-optimal-bearing:  ## Оптимальное обучение (SEU bearing)
	cd python && python train_optimal.py data/ --bearing

train-optimal-mc:  ## Оптимальное обучение (multichannel)
	cd python && python train_optimal.py data/ --mc

train-optimal-synthetic:  ## Оптимальное обучение (синтетика, для теста)
	cd python && python train_optimal.py --synthetic

pipeline-optimal: train-optimal export  ## Оптимальный pipeline: обучение → экспорт

pipeline-optimal-mc: train-optimal-mc export  ## Оптимальный multichannel pipeline

# ═══ DEEP LEARNING ═══

train-cnn:  ## Обучить 1D-CNN (синтетика)
	cd python && python train_cnn.py --synthetic

train-cnn-seu:  ## Обучить 1D-CNN на SEU данных
	cd python && python train_cnn.py data/

train-lstm:  ## Обучить Bi-GRU (синтетика)
	cd python && python train_lstm.py --synthetic

train-lstm-seu:  ## Обучить Bi-GRU на SEU данных
	cd python && python train_lstm.py data/

train-autoencoder:  ## Обучить автоэнкодер (синтетика)
	cd python && python train_autoencoder.py --synthetic

train-autoencoder-seu:  ## Обучить автоэнкодер на SEU данных
	cd python && python train_autoencoder.py data/

train-rul:  ## Обучить RUL модель
	cd python && python train_rul.py

train-rul-fast:  ## Обучить RUL (быстрый режим)
	cd python && python train_rul.py --fast

# ═══ CALIBRATION & EXPLAINABILITY ═══

calibrate:  ## Калибровка вероятностей + OOD пороги (синтетика)
	cd python && python calibration.py --synthetic

calibrate-seu:  ## Калибровка на SEU данных
	cd python && python calibration.py data/

explain:  ## SHAP анализ (синтетика)
	cd python && python explain.py --synthetic

explain-seu:  ## SHAP анализ на SEU данных
	cd python && python explain.py data/

# ═══ ONNX EXPORT ═══

export-onnx:  ## Экспорт всех NN моделей в ONNX
	cd python && python export_onnx.py

export-all: export export-onnx  ## Экспорт RF + все NN модели

# ═══ FULL DL PIPELINES ═══

pipeline-dl: train-cnn train-lstm train-autoencoder train-rul export-onnx  ## DL pipeline: все NN модели

pipeline-full: train-optimal calibrate train-cnn train-lstm train-autoencoder train-rul explain export-all  ## Полный pipeline: RF + DL + калибровка + SHAP

# ═══ EXTERNAL DATASETS ═══

train-cwru:  ## Обучить на CWRU Bearing Dataset
	cd python && python train.py data/cwru/

train-mfpt:  ## Обучить на MFPT Bearing Dataset
	cd python && python train.py data/mfpt/

train-paderborn:  ## Обучить на Paderborn University Dataset
	cd python && python train.py data/paderborn/

train-auto:  ## Обучить на автоопределённом датасете
	cd python && python train.py data/

# ═══ FORMAT CONVERSION ═══

convert-mat:  ## Конвертировать MAT → CSV (make convert-mat SRC=input.mat)
	cd python && python converter.py mat2csv $(SRC) $(or $(DST),$(basename $(SRC)).csv)

convert-any2wav:  ## Любой формат → WAV (make convert-any2wav SRC=input.mat)
	cd python && python converter.py any2wav $(SRC) $(or $(DST),$(basename $(SRC)).wav)

convert-any2csv:  ## Любой формат → CSV (make convert-any2csv SRC=input.tdms)
	cd python && python converter.py any2csv $(SRC) $(or $(DST),$(basename $(SRC)).csv)

file-info:  ## Информация о файле (make file-info SRC=input.wav)
	cd python && python converter.py info $(SRC)

# ═══ ПОЛНЫЙ ДАТАСЕТ ═══
train-gear:  ## Обучить на gear dataset (data/gear/)
	cd python && python train.py data/ --gear

train-bearing:  ## Обучить на bearing dataset (data/bearing/)
	cd python && python train.py data/ --bearing

train-all:  ## Обучить на gear + bearing (оба датасета)
	cd python && python train.py data/ --all

train-full:  ## Единая модель на полном датасете (gear + bearing)
	cd python && python train.py data/ --combined

train-gear-mc:  ## Gear мультиканал
	cd python && python train.py data/ --gear --multichannel

train-bearing-mc:  ## Bearing мультиканал
	cd python && python train.py data/ --bearing --multichannel

train-all-mc:  ## Gear + Bearing мультиканал
	cd python && python train.py data/ --all --multichannel

# ═══ Web ═══

serve:  ## Запустить полный стек через FastAPI (http://localhost:8080)
	@echo "→ http://localhost:8080"
	@echo "→ http://localhost:8080/simulator.html"
	@echo "→ http://localhost:8080/docs"
	uvicorn backend.main:app --app-dir python --host 0.0.0.0 --port 8080 --reload

serve-api: serve  ## Алиас для полного FastAPI стека

serve-static:  ## Запустить только статический frontend (legacy режим)
	@echo "→ http://localhost:8080"
	cd web && python -m http.server 8080

run: serve  ## Запустить проект (алиас для serve)

pipeline-full: train-full export  ## Полный датасет: обучение → экспорт во frontend

# ═══ Docker ═══

docker-build:  ## Собрать Docker-образ
	docker build -t vibrolab .

docker-serve:  ## Запустить дашборд в Docker
	docker compose up web

docker-train:  ## Обучить в Docker (нужны данные в python/data/)
	docker compose run train

docker-test:  ## Запустить тесты в Docker
	docker compose run test

# ═══ Release ═══

release-zip:  ## Собрать ZIP для релиза
	@mkdir -p dist
	zip -r dist/vibrolab-$$(date +%Y%m%d).zip \
		python/*.py web/ tests/ \
		requirements.txt requirements-dev.txt pyproject.toml \
		Makefile Dockerfile docker-compose.yml \
		README.md CONTRIBUTING.md CHANGELOG.md LICENSE \
		.github/ .gitignore .editorconfig \
		-x "*.pyc" -x "*__pycache__*" -x "python/data/*.csv" -x "python/models/*.pkl"
	@ls -lh dist/

# ═══ Cleanup ═══

clean:  ## Очистить артефакты
	rm -rf python/__pycache__ python/models/*.pkl tests/__pycache__
	rm -rf .pytest_cache python/.pytest_cache htmlcov .coverage
	rm -rf dist/ build/ *.egg-info
	find . -name '*.pyc' -delete

clean-all: clean  ## Очистить всё включая модели
	rm -f web/model/rf_model.json web/model/meta.json
	rm -f python/models/meta.json
