import ipaddress
import re
import socket
from pathlib import Path
from typing import List, Tuple
from urllib.parse import urlparse

# Private / reserved IPv4 networks
BLOCKED_IPV4_NETWORKS = [
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("100.64.0.0/10"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.0.0.0/24"),
    ipaddress.ip_network("192.0.2.0/24"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("198.18.0.0/15"),
    ipaddress.ip_network("198.51.100.0/24"),
    ipaddress.ip_network("203.0.113.0/24"),
    ipaddress.ip_network("224.0.0.0/4"),
    ipaddress.ip_network("240.0.0.0/4"),
    ipaddress.ip_network("255.255.255.255/32"),
]

# Windows reserved device names
WINDOWS_RESERVED_NAMES = {
    "CON", "PRN", "AUX", "NUL",
    "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
    "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
}

class SecurityError(Exception):
    pass

def is_ip_blocked(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """Check if an IP address belongs to any private, loopback, or reserved range."""
    if ip.is_loopback or ip.is_private or ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified:
        return True

    # If it's an IPv4 address, check against our strict list of networks
    if isinstance(ip, ipaddress.IPv4Address):
        for net in BLOCKED_IPV4_NETWORKS:
            if ip in net:
                return True
    return False

def validate_url(url: str) -> str:
    """
    Validate that a URL is safe to fetch:
    - Must use http or https scheme
    - Hostname must resolve to valid public IP addresses
    - Blocks localhost, private LAN, AWS/cloud metadata (169.254.169.254)
    """
    if not url or not isinstance(url, str):
        raise SecurityError("URL must be a non-empty string.")

    url = url.strip()
    try:
        parsed = urlparse(url)
    except Exception as e:
        raise SecurityError(f"Malformed URL: {e}")

    if parsed.scheme.lower() not in ("http", "https"):
        raise SecurityError(f"Protocol '{parsed.scheme}' is not allowed. Only HTTP and HTTPS are permitted.")

    hostname = parsed.hostname
    if not hostname:
        raise SecurityError("URL does not contain a valid hostname.")

    # Check for localhost aliases
    if hostname.lower() in ("localhost", "127.0.0.1", "::1", "0.0.0.0", "local"):
        raise SecurityError(f"Access to '{hostname}' is blocked for security reasons.")

    # Try parsing hostname directly as IP address
    try:
        ip = ipaddress.ip_address(hostname)
        if is_ip_blocked(ip):
            raise SecurityError(f"IP address '{hostname}' is a private or reserved address and cannot be accessed.")
        return url
    except ValueError:
        pass  # Hostname is not a raw IP address; proceed to DNS resolution

    # Resolve hostname via DNS
    try:
        addr_info = socket.getaddrinfo(hostname, None)
        resolved_ips = set()
        for item in addr_info:
            sockaddr = item[4]
            ip_str = sockaddr[0]
            resolved_ips.add(ipaddress.ip_address(ip_str))

        has_public_ip = False
        for resolved_ip in resolved_ips:
            # Check for loopback or cloud metadata
            if resolved_ip.is_loopback or str(resolved_ip).startswith("127.") or str(resolved_ip) == "169.254.169.254":
                raise SecurityError(f"Domain '{hostname}' resolves to loopback or cloud metadata IP '{resolved_ip}'. Request blocked.")
            if not is_ip_blocked(resolved_ip):
                has_public_ip = True

        if not has_public_ip:
            raise SecurityError(f"Domain '{hostname}' only resolves to private or restricted network addresses. Request blocked.")
    except socket.gaierror:
        # DNS resolution failure will be handled by downloader, but we disallow obvious internal addresses
        pass

    return url

def sanitize_filename(filename: str, default_name: str = "download") -> str:
    """
    Sanitize a suggested filename to be completely safe on Windows and POSIX filesystems:
    - Removes directory path components (prevents path traversal)
    - Strips invalid characters: <>:"/\\|?* and null bytes
    - Prevents Windows reserved device names
    - Truncates long filenames while preserving extension
    """
    if not filename:
        return default_name

    # Strip path separators and null bytes
    clean = filename.replace("\\", "/").split("/")[-1].replace("\0", "").strip()

    # Remove invalid characters for Windows and POSIX: < > : " / \ | ? *
    clean = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", clean).strip()
    # Collapse multiple whitespace
    clean = re.sub(r'\s+', ' ', clean).strip()

    # Split name and extension
    parts = clean.rsplit(".", 1)
    base = parts[0].strip(". ")
    ext = f".{parts[1].strip()}" if len(parts) > 1 and parts[1] else ""

    if not base:
        base = default_name

    # Check Windows reserved filenames
    if base.upper() in WINDOWS_RESERVED_NAMES:
        base = f"{base}_file"

    # Enforce safe length (max 200 chars for base)
    max_base_len = 200 - len(ext)
    if len(base) > max_base_len:
        base = base[:max_base_len].rstrip()

    result = f"{base}{ext}"
    return result or default_name

def get_safe_destination_path(directory: Path, filename: str) -> Path:
    """
    Ensure destination is strictly within directory and handles collisions safely.
    """
    safe_name = sanitize_filename(filename)
    dest_path = (directory / safe_name).resolve()

    # Path traversal check
    if not str(dest_path).startswith(str(directory.resolve())):
        raise SecurityError("Path traversal attempt detected.")

    # Avoid overwriting existing files by appending counter (1), (2), etc.
    counter = 1
    base_name = dest_path.stem
    extension = dest_path.suffix
    while dest_path.exists():
        new_name = f"{base_name} ({counter}){extension}"
        dest_path = directory / new_name
        counter += 1

    return dest_path

def redact_sensitive_data(text: str) -> str:
    """Redact tokens, bearer tokens, cookies, and sensitive query params from logs/URLs."""
    if not text:
        return ""
    # Redact Authorization header values
    text = re.sub(r"(Bearer\s+)[A-Za-z0-9_\-\.]+", r"\1[REDACTED]", text, flags=re.IGNORECASE)
    text = re.sub(r"(token|secret|api[_-]?key|password|auth)=([^\s&]+)", r"\1=[REDACTED]", text, flags=re.IGNORECASE)
    text = re.sub(r"(Cookie:\s*)([^\r\n]+)", r"\1[REDACTED]", text, flags=re.IGNORECASE)
    return text
