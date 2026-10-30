from types import SimpleNamespace

from app import client_ip as module


def fake_request(forwarded=None, host="10.0.0.1"):
    headers = {"x-forwarded-for": forwarded} if forwarded else {}
    return SimpleNamespace(headers=headers, client=SimpleNamespace(host=host))


def test_header_is_ignored_locally(monkeypatch):
    monkeypatch.setattr(module.settings, "trust_proxy_headers", False)
    assert module.client_ip(fake_request("1.2.3.4")) == "10.0.0.1"


def test_behind_cloud_run_the_last_forwarded_address_is_used(monkeypatch):
    monkeypatch.setattr(module.settings, "trust_proxy_headers", True)
    # Kullanıcının uydurduğu "6.6.6.6" değil, Google'ın sona eklediği gerçek adres alınır.
    assert module.client_ip(fake_request("6.6.6.6, 203.0.113.7")) == "203.0.113.7"
    assert module.client_ip(fake_request(None)) == "10.0.0.1"
