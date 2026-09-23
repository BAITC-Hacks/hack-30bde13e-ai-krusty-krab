# Telegram-бот

Бот использует тот же backend и SQLite, что и веб-приложение. Доступен только в личном чате: каждому пользователю показывает лишь анализы, созданные им через бота.

1. Создайте бота через [@BotFather](https://t.me/BotFather) и получите токен.
2. Запустите backend по инструкции в [backend/README.md](../backend/README.md). Для демонстрации оставьте `USE_MOCK_AI=true`; для реального анализа запустите AI Service и поставьте `USE_MOCK_AI=false`.
3. Из каталога `bot` запустите:

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
export TELEGRAM_BOT_TOKEN='токен-от-BotFather'
export BACKEND_URL='http://127.0.0.1:3000'
python bot.py
```

Бот работает через long polling, публичный URL и webhook не нужны. Состояние выбора анализа хранится в `bot/data/bot.sqlite` (`BOT_DATABASE` позволяет изменить путь).

В Telegram: `/new Название`, отправьте файлы ДО, `/after`, отправьте файлы ПОСЛЕ, `/run`. Для просмотра: `/result`, `/finding 1`, `/list` (далее `/list 2` и т. д.). Можно загружать несколько PDF, DOCX и XLSX на каждую сторону. Лимит скачивания через обычный Telegram Bot API — 20 МБ на файл.

Проверка без токена Telegram (после `npm ci` в `backend`):

```sh
python -m unittest test_bot.py
```
