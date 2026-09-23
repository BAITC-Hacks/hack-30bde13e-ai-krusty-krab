# Hackalem AI frontend

## Запуск

```bash
npm install
cp -n .env.example .env
npm run dev
```

По умолчанию frontend подключает локальный backend через Vite proxy по `/api`. Явное пустое значение `VITE_API_URL=` включает mock API только в браузере: он сохраняет имена файлов в `localStorage` и не читает содержимое документов. Для production сборки задайте полный адрес API и запустите `npm run build`.

## HTTP API

Frontend использует маршруты backend:

- `POST /analyses` с JSON `{ "name": "..." }` создаёт анализ;
- `POST /analyses/:id/documents` загружает по одному файлу с полями `side` и `file`;
- `POST /analyses/:id/run` запускает анализ;
- `GET /analyses`, `/analyses/:id`, `/analyses/:id/documents`, `/analyses/:id/result` читают состояние и результат.

Данные backend и AI Service преобразуются в формы из `src/types/analysis.ts` внутри `src/api/analysis.ts`.
