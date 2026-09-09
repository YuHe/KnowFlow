from __future__ import annotations

import io
from typing import TYPE_CHECKING

from bs4 import BeautifulSoup
from docx import Document as DocxDocument
from docx.shared import Emu, Inches, Pt

from app.utils.storage import resolve_public_url_to_path

# CSS reference pixel is 1/96in, which is how the editor's width attribute is
# expressed. Cap at the printable width of A4 with the default 1in margins so a
# large screenshot cannot overflow the page.
_PX_PER_INCH = 96
_MAX_IMAGE_WIDTH = Inches(6.0)


def _image_width(img) -> Emu | None:
    """Width for an embedded picture, from the img's width attribute if usable."""
    raw = (img.get("width") or "").strip().rstrip("px").strip()
    if not raw:
        return None
    try:
        px = float(raw)
    except ValueError:
        return None
    if px <= 0:
        return None
    return min(Inches(px / _PX_PER_INCH), _MAX_IMAGE_WIDTH)


def _add_image(container, img) -> bool:
    """
    Embed an img element into `container` (the document or a table cell).

    Goes through a run rather than `container.add_picture`, because python-docx
    only puts add_picture on Document — a table cell has to reach the picture via
    a paragraph's run.

    Returns False when the source is not a resolvable local asset — remote URLs
    and data URIs are skipped rather than fetched, so an export never reaches out
    to the network or decodes untrusted payloads.
    """
    path = resolve_public_url_to_path(img.get("src") or "")
    if path is None:
        return False
    try:
        run = container.add_paragraph().add_run()
        run.add_picture(str(path), width=_image_width(img))
    except Exception:
        # A corrupt or unsupported image must not fail the whole export.
        return False
    return True


def _cell_span(cell) -> tuple[int, int]:
    """(colspan, rowspan) of a td/th, defaulting to 1 for missing or bad values."""
    def span(name: str) -> int:
        try:
            return max(1, int(cell.get(name, 1)))
        except (TypeError, ValueError):
            return 1

    return span("colspan"), span("rowspan")


def _table_grid(rows) -> list[list[object]]:
    """
    Lay HTML rows out on an occupancy grid, expanding colspan/rowspan.

    Returns a grid whose cells hold the originating td/th element, or None where
    a spanned cell continues. Needed because python-docx tables are a fixed
    rows×cols matrix — the HTML shape has to be resolved before it can be built.
    """
    grid: list[list[object]] = []

    for row_index, row in enumerate(rows):
        while len(grid) <= row_index:
            grid.append([])
        col = 0
        for cell in row.find_all(["td", "th"], recursive=False):
            current = grid[row_index]
            # Skip columns already claimed by a rowspan from an earlier row.
            while col < len(current) and current[col] is not False:
                col += 1
            colspan, rowspan = _cell_span(cell)
            for r in range(row_index, row_index + rowspan):
                while len(grid) <= r:
                    grid.append([])
                target = grid[r]
                while len(target) < col + colspan:
                    target.append(False)
                for c in range(col, col + colspan):
                    target[c] = cell if (r == row_index and c == col) else None
            col += colspan

    width = max((len(r) for r in grid), default=0)
    for row in grid:
        while len(row) < width:
            row.append(False)
    return grid


def _fill_cell(docx_cell, html_cell) -> None:
    """Write a td/th's content into a docx cell: text first, then any images."""
    # A docx cell always starts with one empty paragraph; reuse it for the text
    # so the cell does not open with a blank line.
    text = html_cell.get_text(separator=" ", strip=True)
    if text:
        docx_cell.paragraphs[0].text = text

    embedded = any(_add_image(docx_cell, img) for img in html_cell.find_all("img"))

    if not text and embedded:
        # Nothing but pictures: drop the leading empty paragraph.
        element = docx_cell.paragraphs[0]._element
        element.getparent().remove(element)


def _render_table(docx, table_el) -> None:
    """Render an HTML table as a real docx table, preserving merged cells."""
    grid = _table_grid(table_el.find_all("tr"))
    if not grid or not grid[0]:
        return

    table = docx.add_table(rows=len(grid), cols=len(grid[0]))
    try:
        table.style = "Table Grid"
    except KeyError:
        pass

    for r, row in enumerate(grid):
        for c, origin in enumerate(row):
            if origin is False or origin is None:
                continue
            colspan, rowspan = _cell_span(origin)
            target = table.cell(r, c)
            if colspan > 1 or rowspan > 1:
                last_row = min(r + rowspan - 1, len(grid) - 1)
                last_col = min(c + colspan - 1, len(row) - 1)
                target = target.merge(table.cell(last_row, last_col))
            _fill_cell(target, origin)


def export_to_docx(doc) -> bytes:
    """
    Export a Document model instance to a .docx file (bytes).

    Parses content_html with BeautifulSoup and converts recognised
    HTML elements to python-docx paragraphs / runs.
    """
    docx = DocxDocument()
    docx.core_properties.title = doc.title

    # Add title heading
    docx.add_heading(doc.title, level=0)

    html = doc.content_html or ""
    if not html.strip():
        # Fall back to plain markdown text
        docx.add_paragraph(doc.content_md or "")
        buf = io.BytesIO()
        docx.save(buf)
        return buf.getvalue()

    soup = BeautifulSoup(html, "html.parser")

    for element in soup.descendants:
        if not hasattr(element, "name") or element.name is None:
            continue  # skip NavigableString at top level

        name = element.name.lower()

        # Tables own their whole subtree. Without this guard the flat descendant
        # walk would also emit every cell's <p> as a loose top-level paragraph,
        # which is how table structure used to be destroyed entirely.
        if name != "table" and element.find_parent("table") is not None:
            continue

        if name == "table":
            _render_table(docx, element)

        elif name == "img":
            _add_image(docx, element)

        elif name in ("h1", "h2", "h3", "h4", "h5", "h6"):
            level = int(name[1])
            text = element.get_text(strip=True)
            if text:
                docx.add_heading(text, level=level)

        elif name == "p":
            text = element.get_text(separator=" ", strip=True)
            if text:
                docx.add_paragraph(text)

        elif name == "li":
            text = element.get_text(separator=" ", strip=True)
            if text:
                parent = element.find_parent(["ul", "ol"])
                style = "List Bullet" if (parent and parent.name == "ul") else "List Number"
                try:
                    docx.add_paragraph(text, style=style)
                except KeyError:
                    docx.add_paragraph(f"• {text}")

        elif name == "blockquote":
            text = element.get_text(separator=" ", strip=True)
            if text:
                p = docx.add_paragraph()
                run = p.add_run(text)
                run.italic = True

        elif name == "pre":
            code = element.get_text()
            if code.strip():
                p = docx.add_paragraph()
                run = p.add_run(code)
                run.font.name = "Courier New"
                run.font.size = Pt(10)

        elif name == "hr":
            docx.add_paragraph("—" * 40)

    buf = io.BytesIO()
    docx.save(buf)
    return buf.getvalue()
