# Hackalem AI frontend

## Запуск

```bash
npm install
cp .env.example .env
npm run dev
```

Пустой `VITE_API_URL` включает локальный mock API. Он сохраняет только имена файлов и состояние анализа в `localStorage`; содержимое документов не читает и evidence не создаёт. Для production сборки: `npm run build`.

## HTTP API

Пока общего контракта в `/shared/contracts` нет, frontend ожидает:

- `GET {VITE_API_URL}/analyses` → `Analysis[]` (последние анализы);
- `POST {VITE_API_URL}/analyses` → `Analysis`, multipart поля `beforeFiles` и `afterFiles` (несколько файлов в каждом);
- `GET {VITE_API_URL}/analyses/:id` → `Analysis` со статусом и, по завершении, `summary`, `departments`, `functions`, `findings`.

Формы данных описаны в `src/types/analysis.ts`. Все запросы и выбор mock/HTTP реализации находятся в `src/api/analysis.ts`. Если backend утвердит другой формат, адаптируйте только этот слой и модели; компоненты не вызывают `fetch` напрямую. Страница анализа опрашивает API, пока статус `queued` или `processing`.
