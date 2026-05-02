from __future__ import annotations

import io


def export_to_pdf(doc) -> bytes:
    """
    Export a Document model instance to a PDF file (bytes).

    Uses WeasyPrint to render content_html with a minimal CSS stylesheet.
    Falls back to rendering a plain-text version if content_html is empty.
    """
    from weasyprint import CSS, HTML

    html_content = doc.content_html or ""

    if not html_content.strip():
        # Build minimal HTML from markdown text
        import html as html_module

        escaped = html_module.escape(doc.content_md or "")
        html_content = f"<pre>{escaped}</pre>"

    full_html = f"""<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>{_escape(doc.title)}</title>
<style>
  body {{
    font-family: "Noto Serif CJK SC", "Source Han Serif CN", "SimSun", serif;
    font-size: 14px;
    line-height: 1.8;
    color: #1a1a1a;
    margin: 2cm 2.5cm;
  }}
  h1 {{ font-size: 2em; margin-bottom: 0.5em; border-bottom: 2px solid #333; padding-bottom: 0.2em; }}
  h2 {{ font-size: 1.6em; margin-top: 1.4em; }}
  h3 {{ font-size: 1.3em; margin-top: 1.2em; }}
  h4, h5, h6 {{ font-size: 1.1em; margin-top: 1em; }}
  p {{ margin: 0.6em 0; }}
  pre, code {{
    font-family: "Courier New", monospace;
    background: #f5f5f5;
    border-radius: 3px;
    font-size: 0.9em;
  }}
  pre {{ padding: 0.8em; overflow-wrap: break-word; white-space: pre-wrap; }}
  code {{ padding: 0.1em 0.3em; }}
  blockquote {{
    border-left: 4px solid #ccc;
    margin: 0.8em 0;
    padding: 0.4em 1em;
    color: #555;
  }}
  table {{ border-collapse: collapse; width: 100%; }}
  th, td {{ border: 1px solid #ccc; padding: 0.4em 0.8em; text-align: left; }}
  th {{ background: #f0f0f0; }}
  img {{ max-width: 100%; }}
  a {{ color: #2563eb; }}
  hr {{ border: none; border-top: 1px solid #ccc; margin: 1em 0; }}
</style>
</head>
<body>
<h1>{_escape(doc.title)}</h1>
{html_content}
</body>
</html>"""

    pdf_bytes = HTML(string=full_html).write_pdf(
        stylesheets=[CSS(string="@page { size: A4; margin: 2cm; }")]
    )
    return pdf_bytes


def _escape(text: str) -> str:
    import html

    return html.escape(str(text))
