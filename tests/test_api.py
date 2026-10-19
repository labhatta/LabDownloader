import pytest
from fastapi.testclient import TestClient
from services.downloader.main import app
from services.downloader.config import config

client = TestClient(app)

def test_health_check_unauthenticated():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "LabDownloader"

def test_auth_token_required():
    # Without token
    response = client.get("/api/system/info")
    assert response.status_code == 401

    # With invalid token
    response = client.get("/api/system/info", headers={"X-Lab-Token": "wrong_token"})
    assert response.status_code == 401

    # With valid token
    response = client.get("/api/system/info", headers={"X-Lab-Token": config.AUTH_TOKEN})
    assert response.status_code == 200
    data = response.json()
    assert "ytdlp_version" in data
    assert "disk_free_bytes" in data

def test_settings_crud():
    headers = {"X-Lab-Token": config.AUTH_TOKEN}
    # Get settings
    get_res = client.get("/api/settings", headers=headers)
    assert get_res.status_code == 200
    settings = get_res.json()
    assert "download_dir" in settings

    # Update settings
    update_res = client.post("/api/settings", headers=headers, json={"max_concurrent": 4, "theme": "warm"})
    assert update_res.status_code == 200
    updated = update_res.json()
    assert updated["max_concurrent"] == "4"
    assert updated["theme"] == "warm"

def test_probe_security_rejection():
    headers = {"X-Lab-Token": config.AUTH_TOKEN}
    response = client.post("/api/inspector/probe", headers=headers, json={"url": "http://127.0.0.1/admin"})
    assert response.status_code == 400
