import json
import pytest
from services.downloader.inspector import extract_candidates_from_har, sanitize_har_data

SAMPLE_HAR = {
    "log": {
        "version": "1.2",
        "creator": {"name": "TestBrowser", "version": "1.0"},
        "entries": [
            {
                "request": {
                    "method": "GET",
                    "url": "https://example.com/playlist.m3u8?token=user_session_123",
                    "headers": [
                        {"name": "Authorization", "value": "Bearer my_super_secret"},
                        {"name": "Cookie", "value": "session=abcdef12345"},
                        {"name": "Accept", "value": "*/*"}
                    ],
                    "cookies": [{"name": "session", "value": "secret"}]
                },
                "response": {
                    "status": 200,
                    "headers": [
                        {"name": "Content-Type", "value": "application/vnd.apple.mpegurl"},
                        {"name": "Set-Cookie", "value": "private=123"}
                    ],
                    "content": {
                        "mimeType": "application/vnd.apple.mpegurl",
                        "size": 1540
                    }
                }
            },
            {
                "request": {
                    "method": "GET",
                    "url": "https://example.com/assets/video_1080p.mp4",
                    "headers": [{"name": "User-Agent", "value": "Chrome"}],
                    "cookies": []
                },
                "response": {
                    "status": 200,
                    "headers": [{"name": "Content-Type", "value": "video/mp4"}],
                    "content": {
                        "mimeType": "video/mp4",
                        "size": 52428800
                    }
                }
            },
            {
                "request": {
                    "method": "GET",
                    "url": "https://example.com/style.css",
                    "headers": [],
                    "cookies": []
                },
                "response": {
                    "status": 200,
                    "headers": [{"name": "Content-Type", "value": "text/css"}],
                    "content": {
                        "mimeType": "text/css",
                        "size": 1200
                    }
                }
            }
        ]
    }
}

def test_sanitize_har_data():
    sanitized = sanitize_har_data(SAMPLE_HAR)
    first_req = sanitized["log"]["entries"][0]["request"]
    first_resp = sanitized["log"]["entries"][0]["response"]

    # Check that cookies are empty
    assert first_req["cookies"] == []
    assert first_resp["cookies"] == []

    # Check headers are redacted
    auth_header = next(h for h in first_req["headers"] if h["name"] == "Authorization")
    assert auth_header["value"] == "[REDACTED]"

    cookie_header = next(h for h in first_req["headers"] if h["name"] == "Cookie")
    assert cookie_header["value"] == "[REDACTED]"

def test_extract_candidates_from_har():
    candidates = extract_candidates_from_har(SAMPLE_HAR)
    assert len(candidates) == 2

    # First candidate is HLS
    hls_cand = candidates[0]
    assert hls_cand["type"] == "HLS Manifest" or "HLS" in hls_cand["type"]
    assert hls_cand["is_stream"] is True
    assert "token=[REDACTED]" in hls_cand["url"]

    # Second candidate is MP4 video
    mp4_cand = candidates[1]
    assert "MP4" in mp4_cand["type"]
    assert mp4_cand["is_stream"] is False
