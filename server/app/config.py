# Ayarlar server/.env dosyasından (veya ortam değişkenlerinden) okunur.

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # hide_input_in_errors: ayar hatalıysa hata mesajı anahtarların değerini göstermesin.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", hide_input_in_errors=True)

    # SecretStr: yazdırılınca anahtar yerine '**********' görünür.
    groq_api_key: SecretStr
    tavily_api_key: SecretStr
    # AI sohbetini kullanmak için eklentinin göndermesi gereken ortak anahtar.
    # 12 karakterden kısaysa sunucu açılmaz (deneme yanılmayla bulunmasın).
    access_key: SecretStr = Field(min_length=12)
    groq_model: str = "openai/gpt-oss-120b"
    # Modele bir çağrıda gönderilecek geçmişin üst sınırı (token). Groq'un ücretsiz planı dakikada
    # 8.000 token'a izin veriyor ve bir agent turu modeli birkaç kez çağırabiliyor; bu yüzden düşük.
    # Ücretli plana geçilirse .env'de MAX_HISTORY_TOKENS ile yükseltilebilir.
    max_history_tokens: int = 3000
    allowed_origin: str = ""
    # Cloud Run gibi bir ön sunucunun arkasında true olmalı (gerçek IP, X-Forwarded-For'dan okunur).
    trust_proxy_headers: bool = False
    # Yayında konuşmaların saklandığı Postgres adresi (Neon). Boşsa aşağıdaki SQLite dosyası kullanılır.
    database_url: SecretStr | None = None
    # Konuşmaların (thread) saklandığı SQLite dosyası. Testlerde ":memory:" (yalnızca bellek).
    checkpoint_db: str = "checkpoints.db"


settings = Settings()
