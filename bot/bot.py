"""Telegram interface for the existing analysis backend."""

import logging
import os
import sqlite3
from pathlib import Path

import httpx
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import Application, CallbackQueryHandler, CommandHandler, ContextTypes, MessageHandler, filters


API_URL = os.getenv("BACKEND_URL", "http://127.0.0.1:3000").rstrip("/")
MAX_FILE_SIZE = 20 * 1024 * 1024
LABELS = {
    "CREATED": "Создан", "UPLOADING": "Загружаются файлы", "PROCESSING": "В работе",
    "COMPLETED": "Готов", "FAILED": "Ошибка",
    "FUNCTION_LOSS": "Потеря функции", "FUNCTION_DUPLICATION": "Дублирование функции",
    "RESPONSIBILITY_CONFLICT": "Конфликт ответственности",
}


def open_db(path):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path)
    db.execute("CREATE TABLE IF NOT EXISTS sessions (user_id INTEGER PRIMARY KEY, active_id TEXT, side TEXT NOT NULL DEFAULT 'before', naming INTEGER NOT NULL DEFAULT 0)")
    db.execute("CREATE TABLE IF NOT EXISTS owned (analysis_id TEXT PRIMARY KEY, user_id INTEGER NOT NULL)")
    db.commit()
    return db


def session(db, user_id):
    db.execute("INSERT OR IGNORE INTO sessions (user_id) VALUES (?)", (user_id,))
    db.commit()
    return db.execute("SELECT active_id, side, naming FROM sessions WHERE user_id = ?", (user_id,)).fetchone()


def owns(db, user_id, analysis_id):
    return db.execute("SELECT 1 FROM owned WHERE user_id = ? AND analysis_id = ?", (user_id, analysis_id)).fetchone() is not None


async def api(method, path, **kwargs):
    try:
        async with httpx.AsyncClient(timeout=610 if path.endswith("/run") else 60) as client:
            response = await client.request(method, f"{API_URL}/api{path}", **kwargs)
            if response.is_error:
                try:
                    detail = response.json().get("error")
                except (ValueError, AttributeError):
                    detail = None
                raise ValueError(detail or f"HTTP {response.status_code}")
            return response.json() if response.content else None
    except httpx.RequestError as error:
        raise ValueError("Backend недоступен. Проверьте, что сервер запущен.") from error


async def send_text(message, text):
    """Keep each Telegram message below its 4096-character limit."""
    while text:
        if len(text) <= 3500:
            await message.reply_text(text)
            return
        cut = text.rfind("\n", 0, 3500)
        cut = cut if cut > 0 else 3500
        await message.reply_text(text[:cut])
        text = text[cut:].lstrip("\n")


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "Сравню документы до и после реорганизации.\n\n"
        "/new Название — новый анализ\n"
        "/before — выбрать документы ДО\n"
        "/after — выбрать документы ПОСЛЕ\n"
        "Затем отправьте PDF, DOCX или XLSX как файл (до 20 МБ каждый).\n"
        "/run — запустить анализ\n"
        "/result — сводка и список выводов\n"
        "/finding N — вывод N с доказательствами\n"
        "/list — мои анализы"
    )


async def create_analysis(update, context, name):
    name = name.strip()
    if not name or len(name) > 200:
        await update.message.reply_text("Название должно содержать от 1 до 200 символов.")
        return
    analysis = await api("POST", "/analyses", json={"name": name})
    db = context.application.bot_data["db"]
    user_id = update.effective_user.id
    db.execute("INSERT INTO owned VALUES (?, ?)", (analysis["id"], user_id))
    db.execute("UPDATE sessions SET active_id = ?, side = 'before', naming = 0 WHERE user_id = ?", (analysis["id"], user_id))
    db.commit()
    await update.message.reply_text(f"Анализ «{name}» создан. Отправьте файлы ДО, затем нажмите /after и отправьте файлы ПОСЛЕ. После загрузки нажмите /run.")


async def new_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    db = context.application.bot_data["db"]
    session(db, update.effective_user.id)
    if context.args:
        await create_analysis(update, context, " ".join(context.args))
    else:
        db.execute("UPDATE sessions SET naming = 1 WHERE user_id = ?", (update.effective_user.id,))
        db.commit()
        await update.message.reply_text("Как назвать анализ? Отправьте название сообщением.")


async def name_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    db = context.application.bot_data["db"]
    if session(db, update.effective_user.id)[2]:
        await create_analysis(update, context, update.message.text)
    else:
        await update.message.reply_text("Начните с /new, либо используйте /help.")


async def side_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    db = context.application.bot_data["db"]
    active_id, _, _ = session(db, update.effective_user.id)
    if not active_id:
        await update.message.reply_text("Сначала создайте анализ: /new")
        return
    side = update.message.text.split()[0][1:].split("@")[0]
    db.execute("UPDATE sessions SET side = ?, naming = 0 WHERE user_id = ?", (side, update.effective_user.id))
    db.commit()
    await update.message.reply_text(f"Выбраны документы {'ДО' if side == 'before' else 'ПОСЛЕ'}. Отправьте PDF, DOCX или XLSX как файл.")


async def document(update: Update, context: ContextTypes.DEFAULT_TYPE):
    db = context.application.bot_data["db"]
    active_id, side, _ = session(db, update.effective_user.id)
    if not active_id or not owns(db, update.effective_user.id, active_id):
        await update.message.reply_text("Сначала создайте анализ: /new")
        return
    doc = update.message.document
    name = doc.file_name or ""
    if Path(name).suffix.lower() not in {".pdf", ".docx", ".xlsx"}:
        await update.message.reply_text("Поддерживаются только PDF, DOCX и XLSX.")
        return
    if doc.file_size and doc.file_size > MAX_FILE_SIZE:
        await update.message.reply_text("Файл больше 20 МБ. Telegram не даст боту его скачать.")
        return
    file = await doc.get_file()
    content = await file.download_as_bytearray(read_timeout=60)
    if len(content) > MAX_FILE_SIZE:
        await update.message.reply_text("Файл больше 20 МБ.")
        return
    await api("POST", f"/analyses/{active_id}/documents", data={"side": side}, files={"file": (name, bytes(content))})
    await update.message.reply_text(f"Добавлен {'ДО' if side == 'before' else 'ПОСЛЕ'}: {name}. Для другой стороны нажмите /{'after' if side == 'before' else 'before'}, для запуска — /run.")


async def active_analysis(update, context):
    db = context.application.bot_data["db"]
    active_id = session(db, update.effective_user.id)[0]
    if not active_id or not owns(db, update.effective_user.id, active_id):
        await update.effective_message.reply_text("Сначала создайте анализ: /new или выберите свой через /list.")
        return None
    return active_id


def result_text(result):
    summary = result.get("summary")
    if isinstance(summary, dict):
        text = (
            f"Документы: ДО {summary.get('before_documents', '?')}, ПОСЛЕ {summary.get('after_documents', '?')}\n"
            f"Подразделения: ДО {summary.get('before_departments', '?')}, ПОСЛЕ {summary.get('after_departments', '?')}\n"
            f"Функции: ДО {summary.get('before_functions', '?')}, ПОСЛЕ {summary.get('after_functions', '?')}"
        )
        limitations = summary.get("limitations") or []
        if limitations:
            text += "\n\nОграничения:\n" + "\n".join(f"• {item}" for item in limitations)
    else:
        text = str(summary or "Анализ завершён")
    findings = result.get("findings") or []
    text += f"\n\nВыводы ({len(findings)}):"
    text += "\n" + "\n".join(
        f"{index}. {LABELS.get(item.get('type'), item.get('type', 'Вывод'))}: {item.get('title', 'Без названия')}"
        for index, item in enumerate(findings, 1)
    ) if findings else "\nНе обнаружены."
    if findings:
        text += "\n\nПодробности: /finding N (например, /finding 1)"
    return text


async def show_result(update, context, active_id):
    analysis = await api("GET", f"/analyses/{active_id}")
    if analysis["status"] != "COMPLETED":
        await update.effective_message.reply_text(f"Статус: {LABELS.get(analysis['status'], analysis['status'])}. Если была ошибка, повторите /run.")
        return
    result = await api("GET", f"/analyses/{active_id}/result")
    await send_text(update.effective_message, result_text(result))


async def run_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    active_id = await active_analysis(update, context)
    if not active_id:
        return
    await update.message.reply_text("Запускаю анализ. Это может занять до десяти минут…")
    await api("POST", f"/analyses/{active_id}/run")
    await show_result(update, context, active_id)


async def result_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    active_id = await active_analysis(update, context)
    if active_id:
        await show_result(update, context, active_id)


async def finding_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    active_id = await active_analysis(update, context)
    if not active_id:
        return
    if not context.args or not context.args[0].isdigit():
        await update.message.reply_text("Укажите номер вывода: /finding 1")
        return
    result = await api("GET", f"/analyses/{active_id}/result")
    findings = result.get("findings") or []
    index = int(context.args[0]) - 1
    if not 0 <= index < len(findings):
        await update.message.reply_text(f"Вывода с таким номером нет. Всего: {len(findings)}.")
        return
    item = findings[index]
    text = f"{index + 1}. {item.get('title', 'Вывод')}\n{item.get('explanation', '')}"
    if item.get("confidence") is not None:
        text += f"\nУверенность: {item['confidence']:.0%}"
    for source in item.get("evidence") or []:
        location = ", ".join(str(part) for part in [
            f"стр. {source['page']}" if source.get("page") else None,
            f"лист {source['sheet']}" if source.get("sheet") else None,
            f"раздел {source['section']}" if source.get("section") else None,
        ] if part)
        text += f"\n\nИсточник: {source.get('document_name') or source.get('document') or 'документ'}"
        if location:
            text += f" ({location})"
        text += f"\n«{source.get('text', '')}»"
    await send_text(update.message, text)


async def list_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    db = context.application.bot_data["db"]
    if context.args and (not context.args[0].isdigit() or int(context.args[0]) < 1):
        await update.message.reply_text("Укажите номер страницы: /list 2")
        return
    page = int(context.args[0]) if context.args else 1
    rows = await api("GET", "/analyses")
    mine = [row for row in rows if owns(db, update.effective_user.id, row["id"])]
    if not mine and page == 1:
        await update.message.reply_text("Ваших анализов пока нет. Создайте первый: /new")
        return
    page_rows = mine[(page - 1) * 10:page * 10]
    if not page_rows:
        await update.message.reply_text("На этой странице анализов нет.")
        return
    buttons = [[InlineKeyboardButton(
        f"{row['name'][:35]} · {LABELS.get(row['status'], row['status'])}", callback_data=f"select:{row['id']}"
    )] for row in page_rows]
    await update.message.reply_text(
        f"Мои анализы · страница {page} из {(len(mine) + 9) // 10}. Нажмите, чтобы выбрать:",
        reply_markup=InlineKeyboardMarkup(buttons),
    )


async def select_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    db = context.application.bot_data["db"]
    analysis_id = query.data.removeprefix("select:")
    if not owns(db, update.effective_user.id, analysis_id):
        await query.answer("Этот анализ вам недоступен.", show_alert=True)
        return
    await query.answer()
    session(db, update.effective_user.id)
    db.execute("UPDATE sessions SET active_id = ?, naming = 0 WHERE user_id = ?", (analysis_id, update.effective_user.id))
    db.commit()
    analysis = await api("GET", f"/analyses/{analysis_id}")
    await query.message.reply_text(f"Выбран «{analysis['name']}». Статус: {LABELS.get(analysis['status'], analysis['status'])}. Используйте /result, /run или загрузите ещё файлы.")


async def on_error(update: object, context: ContextTypes.DEFAULT_TYPE):
    logging.exception("Bot handler failed", exc_info=context.error)
    if isinstance(update, Update) and update.effective_message:
        detail = str(context.error) if isinstance(context.error, ValueError) else "попробуйте ещё раз позже"
        await update.effective_message.reply_text(f"Не удалось выполнить действие: {detail}")


def main():
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not token:
        raise SystemExit("Set TELEGRAM_BOT_TOKEN")
    logging.basicConfig(level=logging.WARNING)
    db = open_db(os.getenv("BOT_DATABASE", "./data/bot.sqlite"))
    app = Application.builder().token(token).concurrent_updates(8).build()
    app.bot_data["db"] = db
    private = filters.ChatType.PRIVATE
    for command, handler in [
        ("start", help_command), ("help", help_command), ("new", new_command),
        ("before", side_command), ("after", side_command), ("run", run_command),
        ("result", result_command), ("finding", finding_command), ("list", list_command),
    ]:
        app.add_handler(CommandHandler(command, handler, filters=private))
    app.add_handler(CallbackQueryHandler(select_callback, pattern=r"^select:[0-9a-f-]{36}$"))
    app.add_handler(MessageHandler(private & filters.Document.ALL, document))
    app.add_handler(MessageHandler(private & filters.TEXT & ~filters.COMMAND, name_text))
    app.add_error_handler(on_error)
    try:
        app.run_polling()
    finally:
        db.close()


if __name__ == "__main__":
    main()
