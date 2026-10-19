import asyncio
import os
import re
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union
from urllib.parse import unquote, urlparse
from bs4 import BeautifulSoup
from curl_cffi import requests as cffi_requests
import httpx

logger = logging.getLogger("document_engine")

from services.downloader.database import db
from services.downloader.security import get_safe_destination_path, sanitize_filename, validate_url
from services.downloader.sse import broadcaster

DOCUMENT_DOMAINS = [
    "scribd.com",
    "academia.edu",
    "slideshare.net",
    "issuu.com",
    "docer.pl",
    "docer.com.ar",
    "studocu.com",
]

def is_document_url(url: str) -> bool:
    """Check if URL is from a known document service or direct document extension."""
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    path = parsed.path.lower()

    for d in DOCUMENT_DOMAINS:
        if d in host:
            return True

    doc_exts = [".pdf", ".epub", ".docx", ".doc", ".pptx", ".ppt", ".xlsx", ".txt"]
    for ext in doc_exts:
        if path.endswith(ext):
            return True

    return False

def analyze_document_url(url: str) -> Dict[str, Any]:
    """Extract metadata for Scribd, Academia.edu, SlideShare, Issuu, and direct docs."""
    safe_url = validate_url(url)
    parsed = urlparse(safe_url)
    host = (parsed.hostname or "").lower()

    title = "Document"
    author = "Unknown"
    source = "Direct Document"
    thumbnail = None
    direct_pdf_url = None
    ext = "pdf"

    # 1. Academia.edu
    if "academia.edu" in host:
        source = "Academia.edu"
        try:
            r = cffi_requests.get(safe_url, impersonate="chrome124", allow_redirects=True, timeout=12)
            if r.status_code == 200:
                title_match = re.search(r'<title>(.*?)</title>', r.text)
                if title_match:
                    title = title_match.group(1).replace(" - Academia.edu", "").replace("(PDF)", "").strip()

                author_match = re.search(r'name=["\']citation_author["\']\s+content=["\']([^"\']+)["\']', r.text)
                if author_match:
                    author = author_match.group(1)

                # Look for direct PDF citation
                pdf_match = re.search(r'name=["\']citation_pdf_url["\']\s+content=["\']([^"\']+)["\']', r.text)
                if not pdf_match:
                    pdf_match = re.search(r'content=["\']([^"\']+)["\']\s+name=["\']citation_pdf_url["\']', r.text)
                if pdf_match:
                    direct_pdf_url = pdf_match.group(1)

                # Thumbnail
                thumb_match = re.search(r'https://attachments\.academia-assets\.com/\d+/thumbnails/1\.jpg', r.text)
                if thumb_match:
                    thumbnail = thumb_match.group(0)
        except Exception as e:
            print(f"[Document Engine] Academia analysis error: {e}")
            path_parts = parsed.path.strip("/").split("/")
            if len(path_parts) > 1:
                title = path_parts[1].replace("_", " ")

    # 2. Scribd
    elif "scribd.com" in host:
        source = "Scribd"
        doc_id_match = re.search(r'scribd\.com/(?:document|doc|presentation)/(\d+)(?:/([^/?#]+))?', safe_url)
        if doc_id_match:
            doc_id = doc_id_match.group(1)
            slug = doc_id_match.group(2)
            if slug:
                title = unquote(slug).replace("-", " ")
            else:
                title = f"Scribd Document {doc_id}"

            # Try to fetch title, total pages, and real page 1 thumbnail from embed
            try:
                embed_url = f"https://www.scribd.com/embeds/{doc_id}/content?start_page=1&view_mode=scroll"
                r = cffi_requests.get(embed_url, impersonate="chrome124", allow_redirects=True, timeout=12)
                if r.status_code == 200:
                    t_match = re.search(r'<title>([^<]+)</title>', r.text)
                    if t_match and "Client Challenge" not in t_match.group(1) and t_match.group(1).strip() != "Scribd":
                        title = t_match.group(1).replace(" | Scribd", "").strip()

                    # Find real page 1 thumbnail
                    thumb_match = re.search(r'http://html\.scribd\.com/[a-zA-Z0-9]+/images/1-[a-zA-Z0-9]+\.jpg', r.text)
                    if thumb_match:
                        thumbnail = thumb_match.group(0)
                    else:
                        thumb_cand = re.search(r'https?://html\.scribd\.com/[^\s"\'<>]+\.(?:jpg|png|webp)', r.text)
                        if thumb_cand:
                            thumbnail = thumb_cand.group(0)
            except Exception:
                pass

    # 3. SlideShare
    elif "slideshare.net" in host:
        source = "SlideShare"
        path_name = Path(parsed.path).name
        title = path_name.replace("-", " ") or "SlideShare Presentation"

    # 4. Direct PDF / File
    else:
        path_name = Path(parsed.path).name
        title = sanitize_filename(path_name or "download.pdf")
        if "." in path_name:
            ext = path_name.split(".")[-1]

    formats = [
        {
            "format_id": "pdf_standard",
            "ext": ext,
            "resolution": "Full Document",
            "filesize_formatted": "PDF Vector Format",
            "is_video": False,
            "is_audio": False,
            "format_note": f"Exportable {source} Document"
        }
    ]

    presets = [
        {
            "id": "pdf_standard",
            "label": f"Download {source} (PDF)",
            "ext": ext,
            "is_preset": True,
            "audio_only": False
        }
    ]

    return {
        "url": safe_url,
        "title": title or "Document",
        "thumbnail": thumbnail,
        "uploader": author,
        "source": source,
        "description": f"Document accessible from {source}. LabDownloader converts and exports it directly to a clean PDF.",
        "formats": formats,
        "presets": presets,
        "direct_pdf_url": direct_pdf_url,
        "is_document": True
    }


async def run_document_download(
    job_id: str,
    url: str,
    output_dir: Path,
    title: str = "Document"
):
    """Download document or capture PDF."""
    safe_url = validate_url(url)
    output_dir.mkdir(parents=True, exist_ok=True)
    clean_title = sanitize_filename(title or "Document")
    if not clean_title.endswith(".pdf"):
        clean_title += ".pdf"

    target_path = get_safe_destination_path(output_dir, clean_title)
    db.update_job(job_id, {"status": "downloading", "progress": 5.0, "title": target_path.name})
    await broadcaster.broadcast("job_progress", {
        "job_id": job_id,
        "status": "downloading",
        "progress": 5.0,
        "speed": "Resolving document...",
        "eta": "Fetching pages..."
    })

    try:
        from PIL import Image
        import io
        import pymupdf

        # --- A. SPECIAL HANDLER: SCRIBD ---
        doc_id_match = re.search(r'scribd\.com/(?:document|doc|presentation)/(\d+)', safe_url)
        if "scribd.com" in safe_url.lower() and doc_id_match:
            doc_id = doc_id_match.group(1)
            embed_url = f"https://www.scribd.com/embeds/{doc_id}/content?start_page=1&view_mode=scroll"

            await broadcaster.broadcast("job_progress", {
                "job_id": job_id,
                "status": "downloading",
                "progress": 10.0,
                "speed": "Reading Scribd document structure...",
                "eta": "Resolving pages & fonts..."
            })

            r_embed = cffi_requests.get(embed_url, impersonate="chrome124", allow_redirects=True, timeout=20)
            if r_embed.status_code == 200:
                embed_text = r_embed.text

                # Parse font definitions from docManager.addFont
                font_styles: Dict[str, Tuple[str, str, str]] = {}
                for m in re.finditer(r'docManager\.addFont\(\s*\d+\s*,\s*"[^"]*"\s*,\s*"(ff\d+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\)', embed_text):
                    ff_id, family, weight, style = m.groups()
                    font_styles[ff_id] = (family, weight, style)

                def get_font_name(ff_classes: list) -> str:
                    for c in ff_classes:
                        if c in font_styles:
                            family, weight, style = font_styles[c]
                            is_bold = "bold" in weight.lower() or "700" in weight
                            is_italic = "italic" in style.lower() or "oblique" in style.lower()
                            is_serif = ("serif" in family.lower() and "sans-serif" not in family.lower()) or any(s in family.lower() for s in ["georgia", "times"])
                            if is_serif:
                                return "tibi" if (is_bold and is_italic) else ("tibo" if is_bold else ("tiit" if is_italic else "times"))
                            else:
                                return "hebi" if (is_bold and is_italic) else ("hebo" if is_bold else ("heit" if is_italic else "helv"))
                    return "helv"

                # Parse pages from embed HTML and external jsonp
                embed_soup = BeautifulSoup(embed_text, "html.parser")
                page_data_map: Dict[int, Dict[str, Any]] = {}

                # 1. Direct pages in embed HTML
                for p in embed_soup.find_all("div", class_="newpage"):
                    pid = p.get("id", "")
                    pm = re.search(r'page(\d+)', pid)
                    if pm:
                        page_data_map[int(pm.group(1))] = {"type": "html", "data": p}

                # 2. JSONP pages
                jsonp_pages = re.findall(r'https?://html\.scribdassets\.com/([a-zA-Z0-9]+)/pages/(\d+-[a-zA-Z0-9]+)\.jsonp', embed_text)
                for doc_hash, slug in jsonp_pages:
                    p_num = int(slug.split('-')[0])
                    if p_num not in page_data_map:
                        page_data_map[p_num] = {
                            "type": "jsonp",
                            "url": f"https://html.scribdassets.com/{doc_hash}/pages/{slug}.jsonp",
                            "hash": doc_hash,
                            "slug": slug
                        }

                # 3. Fallback direct image pages
                img_pages = re.findall(r'https?://html\.scribd\.com/([a-zA-Z0-9]+)/images/(\d+-[a-zA-Z0-9]+)\.jpg', embed_text)
                for doc_hash, slug in img_pages:
                    p_num = int(slug.split('-')[0])
                    if p_num not in page_data_map:
                        page_data_map[p_num] = {
                            "type": "img_only",
                            "url": f"https://html.scribdassets.com/{doc_hash}/images/{slug}.jpg"
                        }

                sorted_pages = sorted(page_data_map.items(), key=lambda x: x[0])
                if sorted_pages:
                    total_pages = len(sorted_pages)
                    # Limit to max 250 pages per job
                    max_export_pages = min(total_pages, 250)

                    doc = pymupdf.open()
                    scale = 0.2

                    for idx, (p_num, p_info) in enumerate(sorted_pages[:max_export_pages]):
                        pct = round(10.0 + ((idx + 1) / max_export_pages) * 80.0, 1)
                        db.update_job(job_id, {"progress": pct, "speed": f"Page {p_num}/{max_export_pages}"})
                        await broadcaster.broadcast("job_progress", {
                            "job_id": job_id,
                            "status": "downloading",
                            "progress": pct,
                            "speed": f"Rendering page {p_num}/{max_export_pages} (text + visuals)...",
                            "eta": f"{max_export_pages - idx} pages remaining"
                        })

                        p_html = None
                        if p_info["type"] == "html":
                            p_html = p_info["data"]
                        elif p_info["type"] == "jsonp":
                            try:
                                p_resp = cffi_requests.get(p_info["url"], impersonate="chrome124", timeout=15)
                                if p_resp.status_code == 200:
                                    jm = re.search(r'window\.page\d+_callback\(\s*(\[.*\])\s*\);?', p_resp.text, re.DOTALL)
                                    if jm:
                                        raw_json_str = json.loads(jm.group(1))[0]
                                        p_html = BeautifulSoup(raw_json_str, "html.parser")
                            except Exception as err:
                                logger.warning(f"Failed fetching jsonp for page {p_num}: {err}")

                        if p_html is not None:
                            pdiv = p_html.find("div", class_="newpage") or p_html
                            style_str = pdiv.get("style", "") if pdiv else ""
                            page_w = 902.0
                            page_h = 1262.0
                            wm = re.search(r'width:\s*([\d\.]+)px', style_str)
                            hm = re.search(r'height:\s*([\d\.]+)px', style_str)
                            if wm: page_w = float(wm.group(1))
                            if hm: page_h = float(hm.group(1))

                            pdf_page = doc.new_page(width=page_w, height=page_h)

                            # 1. Background image layer
                            img_elem = p_html.find("img", class_="absimg")
                            if img_elem:
                                img_url = img_elem.get("orig") or img_elem.get("src")
                                if img_url:
                                    img_url = img_url.replace("http://html.scribd.com", "https://html.scribdassets.com")
                                    try:
                                        iresp = cffi_requests.get(img_url, impersonate="chrome124", timeout=15)
                                        if iresp.status_code == 200:
                                            im = Image.open(io.BytesIO(iresp.content)).convert("RGB")
                                            png_buf = io.BytesIO()
                                            im.save(png_buf, format="PNG")
                                            istyle = img_elem.get("style", "")
                                            ix = float(re.search(r'left:\s*(-?[\d\.]+)px', istyle).group(1)) if "left:" in istyle else 0.0
                                            iy = float(re.search(r'top:\s*(-?[\d\.]+)px', istyle).group(1)) if "top:" in istyle else 0.0
                                            iw = float(re.search(r'width:\s*([\d\.]+)px', istyle).group(1)) if "width:" in istyle else page_w
                                            ih = float(re.search(r'height:\s*([\d\.]+)px', istyle).group(1)) if "height:" in istyle else page_h
                                            pdf_page.insert_image(pymupdf.Rect(ix, iy, ix + iw, iy + ih), stream=png_buf.getvalue())
                                    except Exception as e:
                                        logger.warning(f"Page {p_num} background image error: {e}")

                            # 2. Text layer
                            text_layer = p_html.find("div", class_="text_layer")
                            if text_layer:
                                for span in text_layer.find_all("span", class_="a"):
                                    parent_div = span.find_parent("div")
                                    div_style = parent_div.get("style", "") if parent_div else ""
                                    fs_m = re.search(r'font-size:\s*([\d\.]+)px', div_style)
                                    font_size = (float(fs_m.group(1)) * scale) if fs_m else 11.0

                                    font_classes = parent_div.get("class", []) if parent_div else []
                                    fontname = get_font_name(font_classes)

                                    sstyle = span.get("style", "")
                                    xm = re.search(r'left:\s*(-?[\d\.]+)px', sstyle)
                                    ym = re.search(r'top:\s*(-?[\d\.]+)px', sstyle)
                                    cm = re.search(r'color:\s*#([0-9a-fA-F]{6})', sstyle)

                                    if xm and ym:
                                        x = float(xm.group(1)) * scale
                                        y = float(ym.group(1)) * scale
                                        baseline_y = y + font_size * 0.82

                                        color = (0, 0, 0)
                                        if cm:
                                            hex_c = cm.group(1)
                                            color = (int(hex_c[0:2], 16)/255.0, int(hex_c[2:4], 16)/255.0, int(hex_c[4:6], 16)/255.0)

                                        text = span.get_text()
                                        clean_text = "".join(c for c in text if ord(c) < 0xe000 or ord(c) > 0xf8ff)
                                        if clean_text.strip():
                                            try:
                                                pdf_page.insert_text(
                                                    pymupdf.Point(x, baseline_y),
                                                    clean_text,
                                                    fontsize=font_size,
                                                    color=color,
                                                    fontname=fontname
                                                )
                                            except Exception:
                                                pass
                        elif p_info["type"] == "img_only":
                            try:
                                iresp = cffi_requests.get(p_info["url"], impersonate="chrome124", timeout=15)
                                if iresp.status_code == 200:
                                    im = Image.open(io.BytesIO(iresp.content)).convert("RGB")
                                    buf = io.BytesIO()
                                    im.save(buf, format="PNG")
                                    pdf_page = doc.new_page(width=float(im.width), height=float(im.height))
                                    pdf_page.insert_image(pymupdf.Rect(0, 0, im.width, im.height), stream=buf.getvalue())
                            except Exception as e:
                                logger.warning(f"Page {p_num} image-only error: {e}")

                    if len(doc) > 0:
                        await broadcaster.broadcast("job_progress", {
                            "job_id": job_id,
                            "status": "processing",
                            "progress": 95.0,
                            "speed": "Optimizing vector PDF...",
                            "eta": "Finalizing file..."
                        })
                        doc.save(str(target_path), deflate=True)
                        doc.close()
                        file_size = target_path.stat().st_size
                        completed = {
                            "status": "completed",
                            "progress": 100.0,
                            "output_path": str(target_path),
                            "file_size": file_size,
                            "speed": "",
                            "eta": ""
                        }
                        db.update_job(job_id, completed)
                        await broadcaster.broadcast("job_completed", {"job_id": job_id, **completed})
                        return

        # --- B. GENERAL / ACADEMIA / DIRECT HANDLER ---
        info = analyze_document_url(safe_url)
        direct_pdf = info.get("direct_pdf_url")
        download_target_url = direct_pdf or safe_url

        r = cffi_requests.get(
            download_target_url,
            impersonate="chrome124",
            allow_redirects=True,
            timeout=30
        )

        content_type = r.headers.get("content-type", "").lower()
        content = r.content

        # If direct PDF payload returned
        if content.startswith(b"%PDF") or "pdf" in content_type:
            with open(target_path, "wb") as f:
                f.write(content)

            file_size = target_path.stat().st_size
            completed = {
                "status": "completed",
                "progress": 100.0,
                "output_path": str(target_path),
                "file_size": file_size,
                "speed": "",
                "eta": ""
            }
            db.update_job(job_id, completed)
            await broadcaster.broadcast("job_completed", {"job_id": job_id, **completed})
            return

        # Fallback for academic/web pages behind login walls: Compile clean PDF using ReportLab
        try:
            from reportlab.lib.pagesizes import letter
            from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib import colors

            doc = SimpleDocTemplate(str(target_path), pagesize=letter, rightMargin=54, leftMargin=54, topMargin=54, bottomMargin=54)
            styles = getSampleStyleSheet()

            title_style = ParagraphStyle(
                'DocTitle',
                parent=styles['Heading1'],
                fontName='Helvetica-Bold',
                fontSize=18,
                leading=22,
                textColor=colors.HexColor('#1e293b'),
                spaceAfter=12
            )

            meta_style = ParagraphStyle(
                'DocMeta',
                parent=styles['Normal'],
                fontName='Helvetica',
                fontSize=10,
                leading=15,
                textColor=colors.HexColor('#64748b'),
                spaceAfter=14
            )

            abs_heading = ParagraphStyle(
                'AbsHeading',
                parent=styles['Heading2'],
                fontName='Helvetica-Bold',
                fontSize=12,
                leading=16,
                textColor=colors.HexColor('#d97706'),
                spaceBefore=12,
                spaceAfter=6
            )

            body_style = ParagraphStyle(
                'DocBody',
                parent=styles['Normal'],
                fontName='Helvetica',
                fontSize=10,
                leading=16,
                textColor=colors.HexColor('#334155'),
                spaceAfter=12
            )

            # Extract abstract or description from text
            text_abstract = ""
            abs_match = re.search(r'"abstract":\s*"([^"]+)"', r.text)
            if abs_match:
                text_abstract = abs_match.group(1).replace(r'\"', '"').replace(r'\n', ' ')
            else:
                p_match = re.search(r'<p[^>]*class=["\'][^"\']*(?:abstract|description)[^"\']*["\'][^>]*>(.*?)</p>', r.text, re.I | re.DOTALL)
                if p_match:
                    text_abstract = re.sub(r'<[^>]+>', '', p_match.group(1)).strip()

            story = [
                Paragraph("LabDownloader Document Dossier", ParagraphStyle('Badge', fontName='Helvetica-Bold', fontSize=9, textColor=colors.HexColor('#d97706'), spaceAfter=8)),
                Paragraph(info.get("title") or title or "Research Document", title_style),
                Paragraph(f"<b>Author(s):</b> {info.get('uploader') or 'Researcher'}<br/><b>Source:</b> {info.get('source', 'Web Document')}<br/><b>URL:</b> <font color='#d97706'>{safe_url}</font>", meta_style),
                HRFlowable(width="100%", thickness=1, color=colors.HexColor('#e2e8f0'), spaceAfter=14),
                Paragraph("Abstract & Document Summary", abs_heading),
                Paragraph(text_abstract or "This document is indexed from an academic repository. Full text is cataloged and referenced above.", body_style),
                Spacer(1, 24),
                Paragraph("<i>Converted and archived cleanly by LabDownloader Universal Media & Document Downloader.</i>", ParagraphStyle('Footer', fontName='Helvetica-Oblique', fontSize=8, textColor=colors.HexColor('#94a3b8')))
            ]

            doc.build(story)
            file_size = target_path.stat().st_size
            completed = {
                "status": "completed",
                "progress": 100.0,
                "output_path": str(target_path),
                "file_size": file_size,
                "speed": "",
                "eta": ""
            }
            db.update_job(job_id, completed)
            await broadcaster.broadcast("job_completed", {"job_id": job_id, **completed})
            return
        except Exception as report_err:
            print(f"[Document Engine] ReportLab fallback: {report_err}")

        # Absolute fallback: save document content
        with open(target_path, "wb") as f:
            f.write(content)

        file_size = target_path.stat().st_size
        completed = {
            "status": "completed",
            "progress": 100.0,
            "output_path": str(target_path),
            "file_size": file_size,
            "speed": "",
            "eta": ""
        }
        db.update_job(job_id, completed)
        await broadcaster.broadcast("job_completed", {"job_id": job_id, **completed})

    except Exception as e:
        error_msg = str(e)
        db.update_job(job_id, {"status": "failed", "error_message": error_msg})
        await broadcaster.broadcast("job_failed", {"job_id": job_id, "error": error_msg})
