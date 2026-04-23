#!/usr/bin/env bash
# VibroLab — Первичная настройка репозитория
# Запустить ОДИН раз после клонирования:
#   chmod +x setup.sh && ./setup.sh

set -e

echo "⚡ VibroLab — Setup"
echo "===================="

# 1. Get GitHub username
read -p "GitHub username: " GH_USER
if [ -z "$GH_USER" ]; then
    echo "Ошибка: укажите username"; exit 1
fi

echo "→ Настройка для github.com/$GH_USER/vibrolab"

# 2. Replace placeholder in all files
FILES=(
    "README.md"
    "pyproject.toml"
    ".github/ISSUE_TEMPLATE/config.yml"
)
for f in "${FILES[@]}"; do
    if [ -f "$f" ]; then
        sed -i.bak "s/YOUR_USERNAME/$GH_USER/g" "$f"
        rm -f "$f.bak"
        echo "  ✓ $f"
    fi
done

# 3. Install dependencies
echo ""
echo "→ Установка зависимостей..."
pip install -r requirements.txt -r requirements-dev.txt

# 4. Train synthetic model (so demo works)
echo ""
echo "→ Обучение модели на синтетике..."
cd python
python train.py --synthetic
python export_model.py
cd ..

# 5. Run tests
echo ""
echo "→ Запуск тестов..."
cd python && python -m pytest ../tests/ -v --tb=short && cd ..

# 6. Git init if needed
if [ ! -d ".git" ]; then
    git init
    git branch -M main
fi

echo ""
echo "======================================="
echo "  ✓ Готово!"
echo "======================================="
echo ""
echo "Следующие шаги:"
echo ""
echo "  1. Создать репо на GitHub:"
echo "     https://github.com/new → vibrolab"
echo ""
echo "  2. Запушить:"
echo "     git add -A"
echo "     git commit -m 'Initial commit: VibroLab v0.1.0'"
echo "     git remote add origin https://github.com/$GH_USER/vibrolab.git"
echo "     git push -u origin main"
echo ""
echo "  3. Включить GitHub Pages:"
echo "     Settings → Pages → Source: GitHub Actions"
echo ""
echo "  4. (Опционально) Обучить на SEU данных:"
echo "     cp /path/to/gearset/*.csv python/data/"
echo "     make pipeline-seu"
echo ""
echo "  Dashboard: make serve → http://localhost:8000"
echo ""
