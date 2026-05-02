from __future__ import annotations

import re
import unicodedata

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


def _has_cjk(text: str) -> bool:
    """Return True if text contains CJK (Chinese/Japanese/Korean) characters."""
    for ch in text:
        cp = ord(ch)
        if (
            0x4E00 <= cp <= 0x9FFF   # CJK Unified Ideographs
            or 0x3400 <= cp <= 0x4DBF  # CJK Extension A
            or 0x20000 <= cp <= 0x2A6DF  # CJK Extension B
            or 0xF900 <= cp <= 0xFAFF  # CJK Compatibility Ideographs
            or 0xAC00 <= cp <= 0xD7AF  # Hangul Syllables
        ):
            return True
    return False


def _cjk_to_pinyin(text: str) -> str:
    """
    Convert CJK characters to their pinyin representation.
    Falls back to the unicode name if pypinyin is not available.
    """
    try:
        from pypinyin import lazy_pinyin  # type: ignore

        parts: list[str] = []
        for ch in text:
            if _has_cjk(ch):
                parts.extend(lazy_pinyin(ch))
            else:
                parts.append(ch)
        return "".join(parts)
    except ImportError:
        # Fallback: normalise to ASCII where possible
        normalized = unicodedata.normalize("NFKD", text)
        ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
        return ascii_text if ascii_text.strip() else text


def generate_slug(name: str) -> str:
    """
    Generate a URL-friendly slug from an arbitrary name string.

    - Converts CJK characters to pinyin (requires `pypinyin`) or unicode names.
    - Lowercases and replaces non-alphanumeric runs with hyphens.
    - Strips leading/trailing hyphens.
    - Falls back to a random hex string if the result is empty.
    """
    try:
        from slugify import slugify  # type: ignore

        if _has_cjk(name):
            transliterated = _cjk_to_pinyin(name)
            slug = slugify(transliterated, allow_unicode=False, separator="-")
        else:
            slug = slugify(name, allow_unicode=False, separator="-")
    except ImportError:
        # Minimal built-in fallback
        if _has_cjk(name):
            name = _cjk_to_pinyin(name)
        normalized = unicodedata.normalize("NFKD", name)
        ascii_text = normalized.encode("ascii", "ignore").decode("ascii").lower()
        slug = re.sub(r"[^a-z0-9]+", "-", ascii_text).strip("-")

    if not slug:
        import uuid

        slug = uuid.uuid4().hex[:12]

    # Truncate to 100 characters
    return slug[:100]


async def make_unique_slug(db: AsyncSession, base_slug: str) -> str:
    """
    Check the `knowledge_bases` table to ensure the slug is unique.
    Appends an incrementing suffix ("-1", "-2", …) until a free slot is found.
    """
    from app.models.knowledge_base import KnowledgeBase

    slug = base_slug
    counter = 1
    while True:
        result = await db.execute(
            select(KnowledgeBase).where(KnowledgeBase.slug == slug)
        )
        if result.scalar_one_or_none() is None:
            return slug
        slug = f"{base_slug}-{counter}"
        counter += 1
