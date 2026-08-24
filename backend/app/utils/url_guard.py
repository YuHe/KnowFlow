from __future__ import annotations

import asyncio
import ipaddress
from typing import Optional
from urllib.parse import urlparse

# Cap how long a single hostname lookup may take. Without this, an
# unresolvable or black-holed host can hold a resolver slot for the OS
# default (often 20-30s), which stalls the whole fetch-remote batch.
_DNS_TIMEOUT_S = 5.0


class UnsafeRemoteURL(Exception):
    """Raised when a remote URL fails SSRF validation."""


def _ip_is_unsafe(ip: ipaddress._BaseAddress) -> bool:
    """True if an IP is private/loopback/link-local/reserved/multicast/unspec.

    Link-local (169.254.0.0/16) covers the AWS/GCP/Azure cloud metadata
    endpoints (169.254.169.254). is_private covers 10/8, 172.16/12,
    192.168/16 and IPv6 ULA (fc00::/7).
    """
    return bool(
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


async def resolve_host_ips(host: str) -> list[ipaddress._BaseAddress]:
    """Resolve a hostname to all its IPv4/IPv6 addresses.

    Goes through the event loop's resolver, which runs getaddrinfo in a thread
    pool. Calling socket.getaddrinfo() directly from a coroutine would block
    the event loop for the full DNS wait — seconds for an unresolvable host —
    freezing every other request served by the same worker.
    """
    loop = asyncio.get_running_loop()
    try:
        infos = await asyncio.wait_for(
            loop.getaddrinfo(host, None), timeout=_DNS_TIMEOUT_S
        )
    except asyncio.TimeoutError:
        raise UnsafeRemoteURL(f"DNS lookup for '{host}' timed out")
    except (OSError, UnicodeError) as exc:
        # socket.gaierror is an OSError subclass; UnicodeError comes from IDNA
        # encoding failures on malformed hostnames.
        raise UnsafeRemoteURL(f"Cannot resolve host '{host}': {exc}")
    ips: list[ipaddress._BaseAddress] = []
    for info in infos:
        addr = info[4][0]
        try:
            ips.append(ipaddress.ip_address(addr))
        except ValueError:
            continue
    if not ips:
        raise UnsafeRemoteURL(f"Host '{host}' resolved to no IP addresses")
    return ips


async def is_safe_remote_url(url: str) -> tuple[bool, str, Optional[str]]:
    """Validate a remote URL for SSRF safety.

    Returns (ok, reason, safe_ip). safe_ip is the first public IP the URL
    resolves to; it is None when ok is False. Callers connect to the original
    URL rather than pinning to safe_ip (pinning breaks TLS certificate
    verification) — see the note in routers/assets.py.

    Rules:
      - scheme must be http or https
      - host must be present and not an IP literal in an unsafe range
      - host must resolve to at least one public IP; ALL resolved IPs must be
        safe (a single unsafe IP rejects the URL)
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return False, f"Scheme '{parsed.scheme}' not allowed (http/https only)", None
    host = parsed.hostname
    if not host:
        return False, "URL has no host", None

    # If the host is already an IP literal, validate it directly.
    try:
        literal = ipaddress.ip_address(host)
    except ValueError:
        literal = None

    if literal is not None:
        if _ip_is_unsafe(literal):
            return False, f"Host IP {literal} is in a forbidden range", None
        return True, "ok", str(literal)

    # Hostname — resolve and check every address.
    try:
        ips = await resolve_host_ips(host)
    except UnsafeRemoteURL as exc:
        return False, str(exc), None

    for ip in ips:
        if _ip_is_unsafe(ip):
            return False, f"Host '{host}' resolves to unsafe IP {ip}", None

    return True, "ok", str(ips[0])


__all__ = ["UnsafeRemoteURL", "is_safe_remote_url", "resolve_host_ips"]
