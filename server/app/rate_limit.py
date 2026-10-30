# Basit hız sınırı. Sunucuyu herkes kullanabileceği için Groq ve Tavily kotalarımızı korur.
# Sayaçlar bellekte tutulur: sunucu yeniden başlarsa sıfırlanır (bu proje için yeterli).

import time
from collections import defaultdict, deque
from threading import Lock

PER_IP_PER_MINUTE = 30  # erişim anahtarı zaten koruduğu için geniş tutulur
TOTAL_PER_DAY = 2000  # herkes toplamda günde en fazla 2000 mesaj

recent_requests = defaultdict(deque)  # ip -> son isteklerin zamanları
daily = {"date": "", "count": 0}
lock = Lock()  # aynı anda gelen iki istek sayaçları bozmasın


def allow_request(ip: str) -> bool:
    now = time.time()
    today = time.strftime("%Y-%m-%d")

    with lock:
        if daily["date"] != today:
            daily["date"] = today
            daily["count"] = 0
        if daily["count"] >= TOTAL_PER_DAY:
            return False

        times = recent_requests[ip]
        while times and now - times[0] > 60:  # bir dakikadan eski kayıtları at
            times.popleft()
        if len(times) >= PER_IP_PER_MINUTE:
            return False

        times.append(now)
        daily["count"] += 1
        return True


def reset():
    # Testler için: sayaçları sıfırlar.
    with lock:
        recent_requests.clear()
        daily["date"] = ""
        daily["count"] = 0
