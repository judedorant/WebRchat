#!/usr/bin/env python3
"""Build the illustrated PDF from docs/user-manual.md and captured app screens.

Documentation-only prerequisites: Python 3, reportlab, Pillow, and DejaVu fonts.
Install Python packages with `python -m pip install reportlab Pillow` if needed.
Set WEBRCHAT_MANUAL_FONT_DIR to a directory containing the DejaVu .ttf files
when they are not installed in /usr/share/fonts/truetype/dejavu.
Run from any directory: python scripts/build-user-manual.py
"""
from __future__ import annotations

import html
import os
import re
from pathlib import Path

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Frame, Image, KeepTogether, PageBreak, PageTemplate,
    Paragraph, Preformatted, Spacer, Table, TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
ASSETS = DOCS / "manual-assets"
OUTPUT = DOCS / "WebRchat-User-Manual.pdf"
FONT_DIR = Path(os.environ.get("WEBRCHAT_MANUAL_FONT_DIR", "/usr/share/fonts/truetype/dejavu"))
for name, filename in [
    ("Guide", "DejaVuSans.ttf"), ("Guide-Bold", "DejaVuSans-Bold.ttf"),
    ("Guide-Italic", "DejaVuSans-Oblique.ttf"), ("GuideMono", "DejaVuSansMono.ttf"),
]:
    path = FONT_DIR / filename
    if not path.is_file():
        raise SystemExit(f"Missing {path}. Install DejaVu fonts or set WEBRCHAT_MANUAL_FONT_DIR.")
    pdfmetrics.registerFont(TTFont(name, str(path)))
pdfmetrics.registerFontFamily("Guide", normal="Guide", bold="Guide-Bold", italic="Guide-Italic", boldItalic="Guide-Bold")

GREEN = colors.HexColor("#2c654b")
INK = colors.HexColor("#243d31")
MUTED = colors.HexColor("#617567")
PALE = colors.HexColor("#eef4ed")
LINE = colors.HexColor("#dbe6d9")
WIDTH, HEIGHT = A4
MARGIN = 44
CONTENT = WIDTH - 2 * MARGIN
styles = getSampleStyleSheet()
styles.add(ParagraphStyle("GuideBody", fontName="Guide", fontSize=9.2, leading=14.1, textColor=INK, spaceAfter=7))
styles.add(ParagraphStyle("GuideChapter", parent=styles["GuideBody"], fontName="Guide-Bold", fontSize=22, leading=28, textColor=GREEN, spaceAfter=15, keepWithNext=True))
styles.add(ParagraphStyle("GuideSub", parent=styles["GuideBody"], fontName="Guide-Bold", fontSize=12, leading=17, spaceBefore=13, spaceAfter=8, keepWithNext=True))
styles.add(ParagraphStyle("GuideCaption", parent=styles["GuideBody"], fontSize=8, leading=12, textColor=MUTED, spaceAfter=12))
styles.add(ParagraphStyle("GuideNote", parent=styles["GuideBody"], fontSize=8.5, leading=13, backColor=PALE, borderPadding=10, spaceBefore=10, spaceAfter=16))
styles.add(ParagraphStyle("GuideCell", parent=styles["GuideBody"], fontSize=8.2, leading=12, spaceAfter=0))
styles.add(ParagraphStyle("GuideCellHead", parent=styles["GuideCell"], fontName="Guide-Bold", textColor=colors.white))
styles.add(ParagraphStyle("GuideCode", fontName="GuideMono", fontSize=7.9, leading=11.7, textColor=INK, backColor=PALE, borderPadding=9, spaceBefore=5, spaceAfter=12))
styles.add(ParagraphStyle("GuideTOC", parent=styles["GuideBody"], fontSize=11, leading=17, spaceBefore=9, leftIndent=0, firstLineIndent=0))
styles.add(ParagraphStyle("GuideCoverTitle", parent=styles["GuideChapter"], fontSize=39, leading=47, spaceAfter=14))
styles.add(ParagraphStyle("GuideCoverSub", parent=styles["GuideBody"], fontSize=13, leading=20, textColor=MUTED, spaceAfter=20))


def inline(value: str) -> str:
    value = html.escape(value).replace("\n\n", "<br/><br/>")
    value = re.sub(r"`([^`]+)`", r'<font name="GuideMono" size="8">\1</font>', value)
    value = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", value)

    def link(match: re.Match) -> str:
        label, target = match.groups()
        if target.startswith("#"):
            return f'<link href="{target}" color="#2c654b">{label}</link>'
        if not target.startswith(("http:", "https:")):
            target = "https://github.com/judedorant/WebRchat/blob/main/" + (target[3:] if target.startswith("../") else "docs/" + target)
        return f'<link href="{target}" color="#2c654b">{label}</link>'

    return re.sub(r"\[([^\]]+)\]\(([^)]+)\)", link, value)


def paragraph(value: str, style: str = "GuideBody") -> Paragraph:
    return Paragraph(inline(value), styles[style])


def fitted_image(filename: str, max_width: float = CONTENT, max_height: float = 330) -> Image:
    path = ASSETS / filename
    if not path.is_file():
        raise SystemExit(f"Missing screenshot: {path}")
    with PILImage.open(path) as image:
        width, height = image.size
    ratio = min(max_width / width, max_height / height)
    return Image(str(path), width=width * ratio, height=height * ratio, hAlign="CENTER")


FIGURES = {
    "3. Create and verify your account": [("register.png", "Create your account. Complete the form, then verify your email using the local inbox.")],
    "4. Find your way around": [("dashboard.png", "The workspace: conversations on the left, chat in the center, and details on the right."), ("mobile.png", "On a narrow window, use the back arrow for conversations and the information button for details.")],
    "Start a direct conversation": [("new-message.png", "Find a verified member using New message. Search by the member’s name.")],
    "Understand message status": [("direct-chat.png", "A saved direct conversation with messages, an image and a downloadable checklist.")],
    "Send an image or file": [("attachment-dialog.png", "Choose a supported file, then select Send attachment. A caption can be entered in the main draft.")],
    "Record a voice message": [("voice-dialog.png", "Review a short recording with the audio player before sending it.")],
    "Create a group": [("group-create.png", "Give the group a name, choose its members, then select Create group.")],
    "Manage a group": [("group-settings.png", "Owner controls: rename the group, add members, change roles and transfer ownership.")],
    "Search history": [("search.png", "Search saved history with at least two characters. Open conversation returns to the matching thread.")],
    "Read notifications": [("notifications.png", "Your notification list. Mark read clears a notice; message read receipts are separate.")],
    "Block someone": [("block-confirm.png", "Review the effect of blocking before selecting Confirm block.")],
    "10. Manage your account": [("profile.png", "Use Account settings to update your profile. Changing an email requires your current password.")],
}
figure_number = 0


def figures_for(heading: str) -> list:
    global figure_number
    result = []
    for filename, caption in FIGURES.get(heading, []):
        figure_number += 1
        height = 320 if filename in {"dashboard.png", "direct-chat.png"} else 285
        if filename == "mobile.png":
            height = 350
        if filename == "group-settings.png":
            height = 520
        image = fitted_image(filename, CONTENT - 18, height)
        frame = Table([[image]], colWidths=[CONTENT])
        frame.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), PALE), ("BOX", (0, 0), (-1, -1), 0.5, LINE),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]))
        result.append(KeepTogether([frame, Spacer(1, 5), paragraph(f"**Figure {figure_number}.** {caption}", "GuideCaption")]))
    return result


def command_block(lines: list[str], language: str) -> Preformatted:
    wrapped = []
    for line in lines:
        remaining = line
        while pdfmetrics.stringWidth(remaining, "GuideMono", 7.9) > CONTENT - 22:
            cut = len(remaining)
            while cut > 1 and pdfmetrics.stringWidth(remaining[:cut] + " `", "GuideMono", 7.9) > CONTENT - 22:
                cut -= 1
            cut = remaining.rfind(" ", 0, cut)
            if cut <= 0:
                raise ValueError(f"Unwrappable command: {line}")
            if language != "powershell":
                raise ValueError("Long non-PowerShell command requires an explicit continuation")
            wrapped.append(remaining[:cut] + " `")
            remaining = "    " + remaining[cut:].lstrip()
        wrapped.append(remaining)
    return Preformatted("\n".join(wrapped), styles["GuideCode"])


def table_block(lines: list[str]) -> Table:
    rows = [[cell.strip() for cell in line.strip().strip("|").split("|")] for line in lines]
    rows = [rows[0], *rows[2:]]
    columns = len(rows[0])
    widths = [CONTENT * .37, CONTENT * .63] if columns == 2 else [CONTENT * .43, *([CONTENT * .57 / (columns - 1)] * (columns - 1))]
    cells = [[paragraph(cell, "GuideCellHead" if index == 0 else "GuideCell") for cell in row] for index, row in enumerate(rows)]
    table = Table(cells, colWidths=widths, repeatRows=1, hAlign="LEFT", spaceBefore=4, spaceAfter=14)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), GREEN), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, PALE]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7), ("LINEBELOW", (0, 0), (-1, -1), .3, LINE),
    ]))
    return table


class Manual(BaseDocTemplate):
    def afterFlowable(self, flowable):
        title = getattr(flowable, "manual_chapter", None)
        if title:
            key = "chapter-" + re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(title, key, level=0)
            self.notify("TOCEntry", (0, title, self.page, key))


def decorate(canvas, document):
    canvas.saveState()
    canvas.setTitle("WebRchat — Illustrated User Manual")
    canvas.setAuthor("WebRchat")
    canvas.setSubject("Desktop setup and illustrated user guide for WebRchat through Phase 8")
    canvas.setStrokeColor(LINE)
    if document.page > 1:
        canvas.setFont("Guide-Bold", 8.3)
        canvas.setFillColor(GREEN)
        canvas.drawString(MARGIN, HEIGHT - 27, "WebRchat  /  User manual")
        canvas.setFont("Guide", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawRightString(WIDTH - MARGIN, HEIGHT - 27, "PHASES 1–8")
        canvas.line(MARGIN, HEIGHT - 35, WIDTH - MARGIN, HEIGHT - 35)
    canvas.line(MARGIN, 32, WIDTH - MARGIN, 32)
    canvas.setFont("Guide", 7)
    canvas.setFillColor(MUTED)
    canvas.drawString(MARGIN, 20, "WebRchat  •  Illustrated guide  •  18 November 2026")
    canvas.drawRightString(WIDTH - MARGIN, 20, f"Page {document.page}")
    canvas.restoreState()


def build():
    story = [Spacer(1, 16), paragraph("WEBRCHAT  /  DESKTOP & EVERYDAY USE", "GuideCaption"),
             Paragraph("Your conversations.<br/>Your user manual.", styles["GuideCoverTitle"]),
             paragraph("Set up WebRchat, start a conversation and explore groups, media and privacy controls.", "GuideCoverSub"),
             fitted_image("dashboard.png", CONTENT, 325), Spacer(1, 18),
             paragraph("**Setup · Accounts · Messaging · Media · Groups · Safety**", "GuideCoverSub"),
             paragraph("Illustrated edition · Features through Phase 8\n\nScreenshots use synthetic demonstration accounts and sample conversations. They do not show real users or private production data.", "GuideNote"), PageBreak(),
             paragraph("Contents", "GuideChapter")]
    toc = TableOfContents()
    toc.levelStyles = [styles["GuideTOC"]]
    toc.dotsMinLevel = 0
    story.extend([toc, Spacer(1, 22), paragraph("**Using this guide**\n\nRun PowerShell commands in the WebRchat folder, one block at a time. Long commands use a backtick (`) to continue on the next line; copy the entire block together. Buttons in bold match the app’s labels. On smaller screens, use the back arrow and information button to switch views.", "GuideNote")])
    lines = (DOCS / "user-manual.md").read_text().splitlines()
    index = next(i for i, line in enumerate(lines) if line == "## 1. Set up on Windows")
    while index < len(lines):
        line = lines[index]
        if not line.strip():
            index += 1
            continue
        if line.startswith("## "):
            title = line[3:]
            story.append(PageBreak())
            heading = paragraph(title, "GuideChapter")
            heading.manual_chapter = title
            story.append(heading)
            story.extend(figures_for(title))
            index += 1
        elif line.startswith("### "):
            title = line[4:]
            story.append(paragraph(title, "GuideSub"))
            story.extend(figures_for(title))
            index += 1
        elif line.startswith("```"):
            language = line[3:]
            block = []
            index += 1
            while index < len(lines) and not lines[index].startswith("```"):
                block.append(lines[index])
                index += 1
            if index >= len(lines):
                raise ValueError("Unclosed Markdown code block")
            story.append(command_block(block, language))
            index += 1
        elif line.startswith("|"):
            block = []
            while index < len(lines) and lines[index].startswith("|"):
                block.append(lines[index])
                index += 1
            story.append(table_block(block))
        elif re.match(r"^(\d+\.|-) ", line):
            marker, text = line.split(" ", 1)
            list_style = ParagraphStyle("GuideItem", parent=styles["GuideBody"], leftIndent=17, firstLineIndent=0, bulletIndent=0, spaceAfter=5)
            story.append(Paragraph(inline(text), list_style, bulletText="•" if marker == "-" else marker))
            index += 1
        else:
            block = [line]
            index += 1
            while index < len(lines) and lines[index].strip() and not re.match(r"^(#|```|\||\d+\. |\- )", lines[index]):
                block.append(lines[index])
                index += 1
            story.append(paragraph(" ".join(block)))
    document = Manual(str(OUTPUT), pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=51, bottomMargin=47, pageCompression=1)
    frame = Frame(MARGIN, 47, CONTENT, HEIGHT - 98, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    document.addPageTemplates(PageTemplate(id="manual", frames=[frame], onPage=decorate))
    document.multiBuild(story)
    print(f"Built {OUTPUT} ({OUTPUT.stat().st_size:,} bytes; {figure_number} figures).")


if __name__ == "__main__":
    build()
