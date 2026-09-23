# Hackalem AI

Приложение сравнивает документы организации до и после изменений. Поддерживаются PDF, DOCX и XLSX. Нужен Node.js 24+.

## Быстрый запуск без API ключа

Откройте два терминала в корне проекта:

```sh
cd backend
npm ci
cp -n .env.example .env
npm run dev
```

```sh
cd frontend
npm ci
cp -n .env.example .env
npm run dev
```

Откройте адрес Vite (обычно `http://localhost:5173`). Создайте анализ и загрузите `examples/before.xlsx` в «до», `examples/after.xlsx` в «после». В этом режиме backend сохраняет документы и возвращает пустой демонстрационный результат. Он подходит для проверки интерфейса и загрузки файлов.

## Анализ содержимого через OpenAI

Создайте `ai-service/.env` по образцу `ai-service/.env.example` и впишите свой `LLM_API_KEY`. Тот же ключ будет использован для embeddings. В `backend/.env` установите `USE_MOCK_AI=false`. Запустите AI Service в третьем терминале:

```sh
cd ai-service
npm ci
cp -n .env.example .env
# Впишите ключ в .env
npm start
```

После изменения `.env` перезапустите backend и AI Service. Создайте новый анализ в интерфейсе. Ключ храните только в `ai-service/.env`; этот файл исключён из Git.

Frontend: `http://localhost:5173`. Backend и Swagger UI: `http://localhost:3000` и `http://localhost:3000/docs/`. AI Service: `http://localhost:8001/health`.

Сканированные PDF без текстового слоя требуют OCR. Размер одного загружаемого файла ограничен 20 МБ.

Для работы через Telegram используйте [бота на Python](bot/README.md).
