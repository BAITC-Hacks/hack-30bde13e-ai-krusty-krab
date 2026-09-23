# Backend MVP

Требуется Node.js 24+. Из каталога `backend`:

```sh
npm install
cp .env.example .env
npm run dev
```

API: `http://localhost:3000`, Swagger UI: `http://localhost:3000/docs/`, проверка: `GET /health`.
`npm test` проверяет полный сценарий. SQLite и файлы создаются в `backend/data/`.

Для локальной проверки оставьте `USE_MOCK_AI=true`. Создайте анализ через `POST /api/analyses` с JSON `{"name":"Demo"}`, загрузите хотя бы один `before` и один `after` через `POST /api/analyses/{id}/documents` (`multipart/form-data`: поле `side`, поле `file`), затем вызовите `POST /api/analyses/{id}/run` и `GET /api/analyses/{id}/result`. Запуск выполняется в HTTP запросе и отвечает после завершения обработки. Максимальный размер одного файла — 20 МБ.

## Контракт AI Service

При `USE_MOCK_AI=false` backend отправляет `POST ${AI_SERVICE_URL}/analyze` с JSON:

- `before` и `after`: массивы `{id, name, content_base64}` для загруженных документов.

Успешный ответ AI Service — JSON объект. Backend хранит и возвращает его целиком, включая любые вложенные `document`, `page`, `section`, `text`. Текущая общая форма mock ответа:

```json
{
  "summary": "Mock analysis completed",
  "findings": []
}
```

AI Service может добавить findings и evidence без изменения backend. HTTP ошибка, некорректный JSON или таймаут 120 секунд переводит анализ в `FAILED`; `/run` возвращает 502. Повторный `/run` разрешён после ошибки. Новый документ сбрасывает прежний результат.

`DATABASE_URL` пока задаёт путь к SQLite файлу. Для PostgreSQL позже достаточно заменить модуль `app/db.js` и его запросы; SQLAlchemy в Node.js не используется.
