"""
Exporter tests: tables and images.

DOCX previously had no `table`/`tr`/`td`/`img` branch at all — its flat
descendant walk emitted each cell's `<p>` as a loose top-level paragraph, so
table structure was destroyed, and an image that was the sole child of a `<td>`
(the shape TipTap produces, since its image node is block-level) produced
nothing whatsoever.

PDF rendered tables but no local images: asset URLs are site-relative
(`/uploads/...`) and WeasyPrint resolves a root-relative URL against the origin,
so no base_url could make them find STORAGE_LOCAL_PATH.
"""
from __future__ import annotations

import io
import zipfile
from dataclasses import dataclass
from pathlib import Path

import pytest
from PIL import Image

from app.config import settings
from app.utils.export_docx import export_to_docx
from app.utils.storage import resolve_public_url_to_path


@dataclass
class FakeDoc:
    title: str = "Export test"
    content_html: str = ""
    content_md: str = ""


@pytest.fixture
def stored_image(tmp_path, monkeypatch):
    """A real PNG on disk, reachable via the /uploads/... URL the app stores."""
    monkeypatch.setattr(settings, "STORAGE_LOCAL_PATH", str(tmp_path))
    kb_dir = tmp_path / "kb1"
    kb_dir.mkdir()
    path = kb_dir / "pic.png"
    Image.new("RGB", (20, 10), color=(200, 30, 30)).save(path)
    return "/uploads/kb1/pic.png", path


def docx_document_xml(payload: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(payload)) as zf:
        return zf.read("word/document.xml").decode("utf-8")


def docx_media_names(payload: bytes) -> list[str]:
    with zipfile.ZipFile(io.BytesIO(payload)) as zf:
        return [n for n in zf.namelist() if n.startswith("word/media/")]


class TestStorageUrlResolution:

    def test_resolves_a_stored_url(self, stored_image):
        url, path = stored_image
        assert resolve_public_url_to_path(url) == path

    def test_returns_none_for_remote_urls(self, stored_image):
        assert resolve_public_url_to_path("https://example.com/x.png") is None

    def test_returns_none_for_data_uris(self, stored_image):
        assert resolve_public_url_to_path("data:image/png;base64,AAAA") is None

    def test_returns_none_for_missing_files(self, stored_image):
        assert resolve_public_url_to_path("/uploads/kb1/absent.png") is None

    def test_refuses_to_escape_the_storage_root(self, stored_image, tmp_path):
        """A crafted src must not turn an export into an arbitrary file read."""
        outside = tmp_path.parent / "secret.png"
        outside.write_bytes(b"not yours")
        assert resolve_public_url_to_path("/uploads/../secret.png") is None


class TestDocxTables:

    def test_renders_a_real_table(self):
        html = (
            "<table><tbody>"
            "<tr><th><p>Name</p></th><th><p>Qty</p></th></tr>"
            "<tr><td><p>Bolt</p></td><td><p>12</p></td></tr>"
            "</tbody></table>"
        )
        xml = docx_document_xml(export_to_docx(FakeDoc(content_html=html)))
        assert "<w:tbl>" in xml
        assert "Bolt" in xml

    def test_does_not_also_emit_cells_as_loose_paragraphs(self):
        """The regression: cell text appearing twice, once outside the table."""
        html = "<table><tbody><tr><td><p>Bolt</p></td></tr></tbody></table>"
        xml = docx_document_xml(export_to_docx(FakeDoc(content_html=html)))
        assert xml.count("Bolt") == 1

    def test_preserves_merged_cells(self):
        html = (
            "<table><tbody>"
            "<tr><td colspan='2'><p>wide</p></td></tr>"
            "<tr><td><p>a</p></td><td><p>b</p></td></tr>"
            "</tbody></table>"
        )
        xml = docx_document_xml(export_to_docx(FakeDoc(content_html=html)))
        assert "<w:tbl>" in xml
        assert "wide" in xml
        assert xml.count("wide") == 1

    def test_survives_a_rowspan(self):
        html = (
            "<table><tbody>"
            "<tr><td rowspan='2'><p>tall</p></td><td><p>b</p></td></tr>"
            "<tr><td><p>c</p></td></tr>"
            "</tbody></table>"
        )
        xml = docx_document_xml(export_to_docx(FakeDoc(content_html=html)))
        assert "tall" in xml and "c" in xml


class TestDocxImages:

    def test_embeds_an_image_in_a_table_cell(self, stored_image):
        url, _ = stored_image
        html = (
            "<table><tbody><tr>"
            f"<td><img src='{url}' alt='pic' width='120'></td>"
            "<td><p>caption</p></td>"
            "</tr></tbody></table>"
        )
        payload = export_to_docx(FakeDoc(content_html=html))
        assert docx_media_names(payload), "no image was embedded"
        assert "caption" in docx_document_xml(payload)

    def test_embeds_a_standalone_image(self, stored_image):
        url, _ = stored_image
        payload = export_to_docx(FakeDoc(content_html=f"<p>x</p><img src='{url}'>"))
        assert docx_media_names(payload)

    def test_skips_remote_images_without_failing(self):
        html = "<p>before</p><img src='https://example.com/x.png'><p>after</p>"
        xml = docx_document_xml(export_to_docx(FakeDoc(content_html=html)))
        assert "before" in xml and "after" in xml

    def test_skips_an_unreadable_file_without_failing(self, stored_image, tmp_path):
        (tmp_path / "kb1" / "broken.png").write_bytes(b"not a png")
        html = "<p>before</p><img src='/uploads/kb1/broken.png'><p>after</p>"
        xml = docx_document_xml(export_to_docx(FakeDoc(content_html=html)))
        assert "before" in xml and "after" in xml


class TestPdfImages:

    def test_rewrites_local_asset_urls_to_file_uris(self, stored_image):
        from app.utils.export_pdf import _inline_local_asset_urls

        url, path = stored_image
        out = _inline_local_asset_urls(f"<img src=\"{url}\">")
        assert path.as_uri() in out

    def test_leaves_remote_and_unresolvable_sources_alone(self, stored_image):
        from app.utils.export_pdf import _inline_local_asset_urls

        html = '<img src="https://example.com/x.png"><img src="/uploads/kb1/absent.png">'
        assert _inline_local_asset_urls(html) == html

    def test_renders_a_pdf_containing_the_image(self, stored_image):
        from app.utils.export_pdf import export_to_pdf

        url, _ = stored_image
        html = f"<table><tbody><tr><td><img src='{url}'></td></tr></tbody></table>"
        payload = export_to_pdf(FakeDoc(content_html=html))
        assert payload.startswith(b"%PDF")
        # A PDF that embedded a raster image carries an image XObject.
        assert b"/Image" in payload
