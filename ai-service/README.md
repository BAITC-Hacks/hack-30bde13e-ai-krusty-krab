# Hackalem AI Service

Node.js 22.13+ service for a small Hackalem demonstration corpus. It parses PDF, DOCX and XLSX, extracts source-linked departments and functions, compares BEFORE and AFTER, then verifies evidence for every finding. It has no storage or user-facing API.

## Run

```sh
cd ai-service
npm ci
cp -n .env.example .env
# Впишите OpenAI API ключ в LLM_API_KEY внутри .env
npm start
```

`GET /health` returns `{ "status": "ok" }`. `POST /analyze` accepts JSON:

```json
{
  "before": [{ "id": "doc-before-1", "name": "before.pdf", "content_base64": "<base64 file bytes>" }],
  "after": [{ "id": "doc-after-1", "name": "after.xlsx", "content_base64": "<base64 file bytes>" }]
}
```

Document IDs must be unique across both sides. Each file is limited to 25 MB; the JSON request is limited to 100 MB. The backend supplies file bytes and owns upload, storage and persistence. The service only returns the analysis.

The response contains `summary`, `fragments`, `departments`, `functions`, `department_matches`, `function_matches` and `findings`. Every department and function has a `source` with document ID/name, extracted fragment ID, page for PDF, sheet for XLSX, section/paragraph when available, and an exact quote from the parsed fragment. Every finding has verified `evidence` and related `function_ids`. `fragments` keeps the extracted source text available for independent audit.

## Providers

| Variable | Default | Meaning |
| --- | --- | --- |
| `EMBEDDING_PROVIDER` | `openai` | Semantic embeddings API |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model |
| `EMBEDDING_API_KEY` | falls back to `LLM_API_KEY` | Embeddings credential |
| `EMBEDDING_BASE_URL` | OpenAI API | OpenAI-compatible base URL |
| `LLM_PROVIDER` | `none` | `none` uses conservative rules; `openai` enables structured extraction and judgment |
| `LLM_MODEL` | `gpt-4o-mini` | Structured output model |
| `LLM_API_KEY` | unset | LLM credential |
| `LLM_BASE_URL` | OpenAI API | OpenAI-compatible base URL |

The example `.env` enables `LLM_PROVIDER=openai`. `EMBEDDING_API_KEY` falls back to `LLM_API_KEY`, so one OpenAI API key is enough. LLM responses use JSON Schema structured output and Zod validation. Quotes are accepted only when they occur verbatim inside the stated extracted fragment. API calls are isolated in `src/providers.js`.

## MVP limits

- PDF text extraction handles digital text. Scanned pages need OCR; if AFTER yields no functions, function-loss findings are suppressed.
- DOCX has no reliable page numbers, so `page` is `null`. XLSX uses sheet and row number.
- Department `parent` is `null` until hierarchy is explicit in the demo corpus.
- `FUNCTION_LOSS` means no adequate match in the supplied AFTER documents. It is not a legal conclusion.
- Matching thresholds are conservative starting values for the Hackalem demo set and should be calibrated against annotated examples.
