"""Tests for remote-image fetching: SSRF guard, event-loop safety, size cap.

These avoid the async_client/async_db fixtures because conftest's session-scoped
engine is currently incompatible with pytest-asyncio >= 1.0 (the event_loop
fixture override it relies on was removed upstream). The units under test here
are pure — no DB needed.
"""
from __future__ import annotations

import asyncio
import time

import httpx
import pytest

from app.routers.assets import (
    _REMOTE_CHUNK_BYTES,
    _REMOTE_IMAGE_MAX_BYTES,
    _RemoteImageTooLarge,
    _download_remote_image,
)
from app.utils.rate_limit import check_rate_limit
from app.utils.url_guard import is_safe_remote_url


class TestSSRFGuard:
    """The guard must keep rejecting internal targets after the async rewrite."""

    @pytest.mark.parametrize(
        "url",
        [
            "http://127.0.0.1/x.png",
            "http://localhost/x.png",  # resolves to loopback
            "http://10.0.0.5/x.png",
            "http://192.168.1.1/x.png",
            "http://172.16.0.1/x.png",
            "http://169.254.169.254/latest/meta-data",  # cloud metadata
            "http://[::1]/x.png",
            "http://0.0.0.0/x.png",
        ],
    )
    async def test_rejects_internal_targets(self, url):
        ok, reason, ip = await is_safe_remote_url(url)
        assert ok is False
        assert ip is None
        assert reason

    @pytest.mark.parametrize(
        "url",
        [
            "file:///etc/passwd",
            "gopher://example.com/x",
            "ftp://example.com/x.png",
            "data:image/png;base64,AAAA",
        ],
    )
    async def test_rejects_non_http_schemes(self, url):
        ok, _, _ = await is_safe_remote_url(url)
        assert ok is False

    async def test_rejects_missing_host(self):
        ok, reason, _ = await is_safe_remote_url("http:///x.png")
        assert ok is False
        assert "no host" in reason.lower()

    async def test_accepts_public_ip_literal(self):
        ok, _, ip = await is_safe_remote_url("https://8.8.8.8/x.png")
        assert ok is True
        assert ip == "8.8.8.8"

    async def test_unresolvable_host_is_rejected_not_raised(self):
        ok, reason, _ = await is_safe_remote_url(
            "https://no-such-host-knowflow-test.invalid-tld-xyz/x.png"
        )
        assert ok is False
        assert "resolve" in reason.lower() or "timed out" in reason.lower()


class TestEventLoopNotBlocked:
    """Regression: the DNS lookup used to run synchronously on the event loop.

    A paste fires one request per image concurrently; each blocking lookup froze
    the whole uvicorn worker, so an article with unresolvable image hosts stalled
    every other request (including the token refresh) for seconds at a time.
    """

    async def test_dns_lookup_yields_to_other_tasks(self):
        # Unresolvable hosts guarantee a real lookup (never DNS-cached) and a
        # slow one, which is exactly the case that used to freeze the worker.
        urls = [
            f"https://kf-test-{i}-unresolvable.invalid-tld-xyz/x.png" for i in range(8)
        ]

        stalls: list[float] = []
        stop = asyncio.Event()

        async def heartbeat() -> None:
            """Tick every 10ms; long gaps mean the loop was blocked."""
            last = time.perf_counter()
            while not stop.is_set():
                await asyncio.sleep(0.01)
                now = time.perf_counter()
                stalls.append(now - last)
                last = now

        hb = asyncio.create_task(heartbeat())
        await asyncio.gather(*(is_safe_remote_url(u) for u in urls))
        stop.set()
        await hb

        assert stalls, "heartbeat never ran — the loop was blocked outright"
        # Generous bound: the blocking version stalled for seconds here, so this
        # catches a regression without being flaky on a loaded CI box.
        assert max(stalls) < 1.0, (
            f"event loop stalled {max(stalls):.2f}s during concurrent DNS lookups; "
            "is_safe_remote_url must not call socket.getaddrinfo synchronously"
        )


class TestDownloadSizeCap:
    """The cap must be enforced while streaming, not after buffering."""

    async def test_rejects_body_exceeding_cap_without_buffering_it_all(self):
        oversized = _REMOTE_IMAGE_MAX_BYTES + _REMOTE_CHUNK_BYTES * 4
        served = 0

        async def handler(request: httpx.Request) -> httpx.Response:
            async def gen():
                nonlocal served
                remaining = oversized
                while remaining > 0:
                    n = min(_REMOTE_CHUNK_BYTES, remaining)
                    served += n
                    remaining -= n
                    yield b"\0" * n

            # No content-length: forces the streaming check to be the one that trips.
            return httpx.Response(200, content=gen(), headers={"content-type": "image/png"})

        transport = httpx.MockTransport(handler)
        with pytest.raises(_RemoteImageTooLarge):
            await _download_remote_image_with(transport, "https://example.com/big.png")

        # Should have bailed shortly after crossing the cap rather than reading
        # the entire body first.
        assert served <= _REMOTE_IMAGE_MAX_BYTES + _REMOTE_CHUNK_BYTES * 2

    async def test_rejects_early_on_declared_content_length(self):
        read = False

        async def handler(request: httpx.Request) -> httpx.Response:
            async def gen():
                nonlocal read
                read = True
                yield b"\0" * 16

            return httpx.Response(
                200,
                content=gen(),
                headers={
                    "content-type": "image/png",
                    "content-length": str(_REMOTE_IMAGE_MAX_BYTES + 1),
                },
            )

        transport = httpx.MockTransport(handler)
        with pytest.raises(_RemoteImageTooLarge):
            await _download_remote_image_with(transport, "https://example.com/big.png")
        assert read is False, "body was transferred despite an oversized Content-Length"

    async def test_accepts_body_within_cap(self):
        payload = b"\x89PNG\r\n\x1a\n" + b"\0" * 4096

        async def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, content=payload, headers={"content-type": "image/png"})

        transport = httpx.MockTransport(handler)
        content, headers, final_url = await _download_remote_image_with(
            transport, "https://example.com/ok.png"
        )
        assert content == payload
        assert headers.get("content-type") == "image/png"
        assert final_url == "https://example.com/ok.png"


async def _download_remote_image_with(transport, url):
    """Run _download_remote_image against a MockTransport.

    _download_remote_image builds its own AsyncClient (so each request gets an
    isolated connection pool), so the transport is injected by patching the
    class default for the duration of the call.
    """
    real_init = httpx.AsyncClient.__init__

    def patched_init(self, *args, **kwargs):
        kwargs["transport"] = transport
        real_init(self, *args, **kwargs)

    httpx.AsyncClient.__init__ = patched_init
    try:
        return await _download_remote_image(url, {"Accept": "image/*"})
    finally:
        httpx.AsyncClient.__init__ = real_init


class _FakeRedis:
    """Minimal INCR/EXPIRE stand-in for the rate limiter."""

    def __init__(self, fail: bool = False) -> None:
        self.counts: dict[str, int] = {}
        self.expires: dict[str, int] = {}
        self.fail = fail

    async def incr(self, key: str) -> int:
        if self.fail:
            raise ConnectionError("redis down")
        self.counts[key] = self.counts.get(key, 0) + 1
        return self.counts[key]

    async def expire(self, key: str, ttl: int) -> bool:
        self.expires[key] = ttl
        return True


@pytest.fixture
def fake_redis(monkeypatch):
    """Point the rate limiter at an in-process fake."""

    def _install(fail: bool = False) -> _FakeRedis:
        fake = _FakeRedis(fail=fail)
        monkeypatch.setattr(
            "app.database.get_redis_pool", lambda: fake, raising=True
        )
        return fake

    return _install


class TestRateLimit:
    """The fetch-remote throttle: it must cap abuse but never break the app."""

    async def test_allows_requests_under_the_limit(self, fake_redis):
        fake_redis()
        for i in range(5):
            res = await check_rate_limit("test:user-1", limit=5, window_seconds=60)
            assert res.allowed is True, f"request {i + 1} should be allowed"
        assert res.remaining == 0

    async def test_blocks_once_the_limit_is_exceeded(self, fake_redis):
        fake_redis()
        for _ in range(3):
            assert (await check_rate_limit("test:u", 3, 60)).allowed is True

        blocked = await check_rate_limit("test:u", 3, 60)
        assert blocked.allowed is False
        assert blocked.remaining == 0
        assert 0 < blocked.retry_after <= 60

    async def test_buckets_are_isolated_per_key(self, fake_redis):
        fake_redis()
        assert (await check_rate_limit("test:alice", 1, 60)).allowed is True
        assert (await check_rate_limit("test:alice", 1, 60)).allowed is False
        # A different subject has its own budget.
        assert (await check_rate_limit("test:bob", 1, 60)).allowed is True

    async def test_sets_a_ttl_so_keys_self_clean(self, fake_redis):
        fake = fake_redis()
        await check_rate_limit("test:ttl", 5, 60)
        assert len(fake.expires) == 1
        assert list(fake.expires.values())[0] == 61

    async def test_fails_open_when_redis_is_unavailable(self, fake_redis):
        # Redis is a cache here, not a system of record. An outage must not
        # make every paste fail — losing the throttle is the lesser harm.
        fake_redis(fail=True)
        res = await check_rate_limit("test:down", 1, 60)
        assert res.allowed is True
        assert res.retry_after == 0

    async def test_fails_open_when_redis_is_not_configured_at_all(self, monkeypatch):
        def boom():
            raise RuntimeError("no redis url")

        monkeypatch.setattr("app.database.get_redis_pool", boom, raising=True)
        assert (await check_rate_limit("test:noconf", 1, 60)).allowed is True

