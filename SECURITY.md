# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✅        |

## Reporting a Vulnerability

Если вы обнаружили уязвимость, пожалуйста, **не создавайте публичный Issue**.

Напишите на email владельца репозитория или создайте [private security advisory](https://docs.github.com/en/code-security/security-advisories/working-with-repository-security-advisories/creating-a-repository-security-advisory).

Мы ответим в течение 48 часов.

## Scope

Этот проект обрабатывает только вибрационные данные (числовые CSV/WAV).
Веб-дашборд работает полностью в браузере (без серверной части).
Основные риски: XSS через загружаемые файлы, DoS через большие файлы.
