import asyncio
import os
import socket
import subprocess
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx

import bot


ROOT = Path(__file__).resolve().parents[1]


class BotFlowTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        self.backend = subprocess.Popen(
            ["node", "app/main.js"], cwd=ROOT / "backend",
            env={**os.environ, "PORT": str(port), "DATABASE_URL": str(Path(self.temp.name) / "backend.sqlite"),
                 "UPLOAD_DIR": str(Path(self.temp.name) / "uploads"), "USE_MOCK_AI": "true"},
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        bot.API_URL = f"http://127.0.0.1:{port}"
        for _ in range(50):
            try:
                async with httpx.AsyncClient() as client:
                    if (await client.get(f"{bot.API_URL}/health")).status_code == 200:
                        break
            except httpx.RequestError:
                pass
            await asyncio.sleep(0.1)
        else:
            self.fail("Backend did not start")
        self.db = bot.open_db(Path(self.temp.name) / "bot.sqlite")
        self.context = SimpleNamespace(application=SimpleNamespace(bot_data={"db": self.db}), args=["Test"])
        self.message = SimpleNamespace(reply_text=AsyncMock(), text="")
        self.update = SimpleNamespace(effective_user=SimpleNamespace(id=42), message=self.message, effective_message=self.message)

    async def asyncTearDown(self):
        self.db.close()
        self.backend.terminate()
        self.backend.wait(timeout=5)
        self.temp.cleanup()

    async def test_create_upload_run_and_read(self):
        await bot.new_command(self.update, self.context)
        analysis_id = bot.session(self.db, 42)[0]
        self.assertTrue(bot.owns(self.db, 42, analysis_id))
        self.assertFalse(bot.owns(self.db, 43, analysis_id))

        for side in ("before", "after"):
            self.message.text = f"/{side}"
            await bot.side_command(self.update, self.context)
            content = bytearray(b"%PDF-1.7\nexample")
            telegram_file = SimpleNamespace(download_as_bytearray=AsyncMock(return_value=content))
            self.message.document = SimpleNamespace(
                file_name=f"{side}.pdf", file_size=len(content), get_file=AsyncMock(return_value=telegram_file)
            )
            await bot.document(self.update, self.context)

        await bot.run_command(self.update, self.context)
        result = await bot.api("GET", f"/analyses/{analysis_id}/result")
        self.assertEqual(result["summary"], "Mock analysis completed")
        self.assertIn("Выводы (0)", bot.result_text(result))
        self.assertTrue(any("Mock analysis completed" in call.args[0] for call in self.message.reply_text.await_args_list))

    async def test_finding_includes_source(self):
        await bot.new_command(self.update, self.context)
        self.context.args = ["1"]
        result = {"findings": [{"title": "Потеря функции", "explanation": "Не найдена после изменений.",
                                "confidence": 0.8, "evidence": [{"document_name": "before.pdf", "page": 3,
                                                               "text": "Исходная обязанность"}]}]}
        with patch.object(bot, "api", AsyncMock(return_value=result)):
            await bot.finding_command(self.update, self.context)
        sent = self.message.reply_text.await_args.args[0]
        self.assertIn("before.pdf (стр. 3)", sent)
        self.assertIn("Исходная обязанность", sent)


if __name__ == "__main__":
    unittest.main()
