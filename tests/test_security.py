import pytest
from services.downloader.security import (
    SecurityError,
    get_safe_destination_path,
    redact_sensitive_data,
    sanitize_filename,
    validate_url,
)
from pathlib import Path

def test_validate_url_ssrf_blocking():
    # Loopback & local blocking
    with pytest.raises(SecurityError):
        validate_url("http://localhost/admin")
    with pytest.raises(SecurityError):
        validate_url("http://127.0.0.1:8080/secret")
    with pytest.raises(SecurityError):
        validate_url("http://[::1]:8080/secret")

    # Private network blocking
    with pytest.raises(SecurityError):
        validate_url("http://10.0.0.5/internal")
    with pytest.raises(SecurityError):
        validate_url("http://192.168.1.100/router")
    with pytest.raises(SecurityError):
        validate_url("http://172.16.0.1/private")

    # Cloud metadata blocking
    with pytest.raises(SecurityError):
        validate_url("http://169.254.169.254/latest/meta-data")

    # Protocol allowlisting
    with pytest.raises(SecurityError):
        validate_url("file:///etc/passwd")
    with pytest.raises(SecurityError):
        validate_url("ftp://ftp.example.com/file.zip")
    with pytest.raises(SecurityError):
        validate_url("gopher://example.com")

def test_validate_url_allowed():
    # Public valid http/https URLs should pass
    url = "https://www.google.com/search?q=test"
    assert validate_url(url) == url

def test_sanitize_filename():
    # Traversal attempts
    assert sanitize_filename("../../../etc/passwd") == "passwd"
    assert sanitize_filename("..\\..\\windows\\system32\\cmd.exe") == "cmd.exe"

    # Invalid characters removal
    assert sanitize_filename('My <Crazy> "Video" : Test?.mp4') == "My Crazy Video Test.mp4"

    # Reserved names handling
    assert sanitize_filename("CON.mp4") == "CON_file.mp4"
    assert sanitize_filename("nul.txt") == "nul_file.txt"

    # Truncation
    long_name = "a" * 250 + ".mp4"
    sanitized = sanitize_filename(long_name)
    assert len(sanitized) <= 200
    assert sanitized.endswith(".mp4")

def test_redact_sensitive_data():
    raw = "https://example.com/stream?token=secret12345&other=value"
    redacted = redact_sensitive_data(raw)
    assert "token=[REDACTED]" in redacted
    assert "secret12345" not in redacted

    bearer_str = "Authorization: Bearer my_top_secret_token_123"
    assert "Bearer [REDACTED]" in redact_sensitive_data(bearer_str)
