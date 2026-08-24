from __future__ import annotations

import logging
import time
from typing import Optional

logger = logging.getLogger(__name__)


class RateLimitResult:
    """Outcome of a rate-limit check."""

    __slots__ = ("allowed", "remaining", "retry_after")

    def __init__(self, allowed: bool, remaining: int, retry_after: int) -> None:
        self.allowed = allowed
        self.remaining = remaining
        self.retry_after = retry_after


async def check_rate_limit(
    key: str,
    limit: int,
    window_seconds: int,
) -> RateLimitResult:
    """Fixed-window rate limit backed by Redis.

    Returns a RateLimitResult; callers decide what to do when `allowed` is
    False. `key` should already be namespaced by caller and subject (e.g.
    "fetch-remote:<user_id>").

    Fails OPEN: if Redis is unavailable the request is allowed through. This
    matches how the rest of the app treats Redis (see routers/admin.py, which
    degrades to in-memory settings) — Redis is a cache here, not a system of
    record, and taking the app down because it is unreachable would be worse
    than briefly losing a throttle. Callers that need fail-closed semantics
    must check for themselves.

    The window is fixed rather than sliding: a caller can burst up to 2*limit
    across a window boundary. That is acceptable for the coarse abuse
    protection this is used for, and it costs one INCR instead of a sorted-set
    round trip.
    """
    bucket = int(time.time()) // window_seconds
    redis_key = f"knowflow:ratelimit:{key}:{bucket}"

    try:
        from app.database import get_redis_pool

        redis = get_redis_pool()
        count = await redis.incr(redis_key)
        if count == 1:
            # First hit in this window — set the TTL so the key self-cleans.
            # Slightly longer than the window to tolerate clock skew.
            await redis.expire(redis_key, window_seconds + 1)
    except Exception as exc:  # noqa: BLE001 — deliberately broad, see docstring
        logger.warning("Rate limit check failed for %s, allowing: %s", key, exc)
        return RateLimitResult(allowed=True, remaining=limit, retry_after=0)

    if count > limit:
        # Seconds until the current window rolls over.
        retry_after = window_seconds - (int(time.time()) % window_seconds)
        return RateLimitResult(allowed=False, remaining=0, retry_after=retry_after)

    return RateLimitResult(allowed=True, remaining=max(0, limit - count), retry_after=0)


__all__ = ["RateLimitResult", "check_rate_limit"]
