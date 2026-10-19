import pytest
from services.downloader.document_engine import is_document_url, analyze_document_url

def test_is_document_url():
    # Scribd
    assert is_document_url("https://www.scribd.com/document/55972887/Sample-Document") is True
    assert is_document_url("https://id.scribd.com/doc/12345/Notes") is True

    # Academia.edu
    assert is_document_url("https://www.academia.edu/37759885/Artificial_Intelligence") is True
    assert is_document_url("https://independent.academia.edu/research/paper") is True

    # SlideShare
    assert is_document_url("https://www.slideshare.net/author/presentation") is True

    # Direct documents
    assert is_document_url("https://example.com/books/manual.pdf") is True
    assert is_document_url("https://example.com/report.docx") is True

    # Non-documents
    assert is_document_url("https://www.youtube.com/watch?v=12345") is False
    assert is_document_url("https://twitter.com/user/status/12345") is False

def test_analyze_document_url_scribd():
    url = "https://www.scribd.com/document/55972887/Sample-Document"
    info = analyze_document_url(url)
    assert info["source"] == "Scribd"
    assert "Sample Document" in info["title"]
    assert info["is_document"] is True
    assert len(info["presets"]) > 0

def test_analyze_document_url_direct_pdf():
    url = "https://example.com/research_paper.pdf"
    info = analyze_document_url(url)
    assert info["source"] == "Direct Document"
    assert info["title"] == "research_paper.pdf"
    assert info["is_document"] is True
