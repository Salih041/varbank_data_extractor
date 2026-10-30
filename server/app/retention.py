# Eski konuşmaların silinmesi: son mesajı 7 günden eski olan konuşmalar (tablo verisi dahil) silinir.
# Ayrı bir zamanlayıcı yerine, gelen sohbet istekleri sırasında en fazla saatte bir, arka planda çalışır.

import logging
import threading
import time
from datetime import datetime, timedelta, timezone

from app.checkpoint import checkpointer

KEEP_DAYS = 7
CHECK_EVERY_SECONDS = 60 * 60

logger = logging.getLogger("agent")
last_run = {"time": 0.0}
lock = threading.Lock()


def delete_old_threads(now=None) -> int:
    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(days=KEEP_DAYS)

    # Her konuşmanın en son kaydının zamanı bulunur.
    newest = {}
    for item in checkpointer.list(None):
        thread = item.config["configurable"]["thread_id"]
        saved_at = datetime.fromisoformat(item.checkpoint["ts"])
        if thread not in newest or saved_at > newest[thread]:
            newest[thread] = saved_at

    old_threads = [thread for thread, saved_at in newest.items() if saved_at < cutoff]
    for thread in old_threads:
        checkpointer.delete_thread(thread)
    return len(old_threads)


def cleanup_in_background():
    with lock:
        if time.time() - last_run["time"] < CHECK_EVERY_SECONDS:
            return
        last_run["time"] = time.time()
    threading.Thread(target=_cleanup, daemon=True).start()


def _cleanup():
    try:
        count = delete_old_threads()
        if count:
            logger.info("deleted %d old conversations", count)
    except Exception as error:
        logger.warning("cleanup failed: %s", type(error).__name__)
