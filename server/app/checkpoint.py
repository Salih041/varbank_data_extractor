# Konuşmaların (thread) saklandığı yer.
#   DATABASE_URL varsa: Postgres (yayında, Neon). Sunucu yeniden başlasa da kayıtlar kalır.
#   Yoksa: SQLite dosyası (yerel geliştirme ve testler).

import sqlite3

from langgraph.checkpoint.sqlite import SqliteSaver

from app.config import settings


def make_checkpointer():
    if settings.database_url:
        from langgraph.checkpoint.postgres import PostgresSaver
        from psycopg_pool import ConnectionPool

        pool = ConnectionPool(
            settings.database_url.get_secret_value(),
            max_size=5,
            kwargs={"autocommit": True, "prepare_threshold": 0},
            # Neon boşta kalan bağlantıları kapatabilir; kullanmadan önce bağlantı yoklanır.
            check=ConnectionPool.check_connection,
            open=True,
        )
        saver = PostgresSaver(pool)
        saver.setup()  # gerekli tabloları ilk seferde oluşturur
        return saver

    connection = sqlite3.connect(settings.checkpoint_db, check_same_thread=False)
    return SqliteSaver(connection)


checkpointer = make_checkpointer()
