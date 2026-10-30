# Erişim anahtarı kontrolü. Eklenti anahtarı "Authorization: Bearer <anahtar>" başlığında gönderir.
# Aynı IP'den çok sayıda yanlış deneme gelirse o IP bir süre engellenir (anahtar tahmin edilemesin).

import secrets
import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import HTTPException, Request

from app.client_ip import client_ip
from app.config import settings

MAX_FAILED_ATTEMPTS = 5
WINDOW_SECONDS = 15 * 60  # 15 dakika

failed_attempts = defaultdict(deque)  # ip -> yanlış denemelerin zamanları
lock = Lock()


def check_access_key(request: Request):
    ip = client_ip(request)
    now = time.time()

    with lock:
        attempts = failed_attempts[ip]
        while attempts and now - attempts[0] > WINDOW_SECONDS:  # 15 dakikadan eskileri unut
            attempts.popleft()
        if len(attempts) >= MAX_FAILED_ATTEMPTS:
            raise HTTPException(status_code=429, detail="TOO_MANY_ATTEMPTS")

    sent = request.headers.get("authorization", "")
    expected = "Bearer " + settings.access_key.get_secret_value()
    # compare_digest: karşılaştırma süresi, anahtarın kaçıncı harfte yanlış olduğunu ele vermez.
    if not secrets.compare_digest(sent.encode(), expected.encode()):
        with lock:
            failed_attempts[ip].append(now)
        raise HTTPException(status_code=401, detail="BAD_ACCESS_KEY")


def reset():
    # Testler için: yanlış deneme kayıtlarını siler.
    with lock:
        failed_attempts.clear()
