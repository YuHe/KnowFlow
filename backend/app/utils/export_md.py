from __future__ import annotations


def export_to_markdown(doc) -> bytes:
    """
    Export a Document model instance to a Markdown file (bytes).

    The output includes a YAML front-matter block with metadata,
    followed by the document's Markdown content.
    """
    from datetime import datetime, timezone

    created = doc.created_at
    updated = doc.updated_at

    def fmt(dt: datetime | None) -> str:
        if dt is None:
            return ""
        return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    front_matter = (
        f"---\n"
        f"title: {doc.title!r}\n"
        f"created_at: {fmt(created)}\n"
        f"updated_at: {fmt(updated)}\n"
        f"---\n\n"
    )
    content = doc.content_md or ""
    return (front_matter + content).encode("utf-8")
