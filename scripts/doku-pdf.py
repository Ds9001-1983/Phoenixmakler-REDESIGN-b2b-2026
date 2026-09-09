"""
Erzeugt aus docs/systemdokumentation.md das Kunden-PDF im SUPERBRAND-Layout.

  python3 scripts/doku-pdf.py [ziel.pdf]

Braucht playwright (Chromium). Ein eigener, bewusst kleiner Markdown-Umsetzer —
das Projekt hat keine Markdown-Bibliothek, und die Doku nutzt nur einen festen
Satz an Auszeichnungen.
"""
import html as H
import re
import sys
from pathlib import Path
from datetime import date

WURZEL = Path(__file__).resolve().parent.parent
QUELLE = WURZEL / 'docs' / 'systemdokumentation.md'
ZIEL = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / 'Desktop' / \
    f"Phoenix-Maklerverbund_Systemdoku_{date.today():%Y-%m-%d}.pdf"

GRUEN, GRUEN_D, DUNKEL, DUNKEL2 = '#6cbe45', '#3f7c25', '#0a0a0a', '#0d1117'


def inline(t: str) -> str:
    t = H.escape(t)
    t = re.sub(r'`([^`]+)`', r'<code>\1</code>', t)
    t = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', t)
    t = re.sub(r'(?<![\w*])\*([^*]+)\*(?![\w*])', r'<em>\1</em>', t)
    t = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', t)
    return t


def md2html(md: str) -> str:
    zeilen, out, i = md.split('\n'), [], 0
    abschnitt = 0
    while i < len(zeilen):
        z = zeilen[i]

        if z.startswith('```'):                                   # Codeblock
            i += 1
            buf = []
            while i < len(zeilen) and not zeilen[i].startswith('```'):
                buf.append(H.escape(zeilen[i])); i += 1
            out.append('<pre>' + '\n'.join(buf) + '</pre>'); i += 1; continue

        if z.strip() in ('---', '***'):                            # Trenner
            out.append('<hr>'); i += 1; continue

        if z.startswith('|'):                                      # Tabelle
            block = []
            while i < len(zeilen) and zeilen[i].startswith('|'):
                block.append(zeilen[i]); i += 1
            zellen = [[c.strip() for c in r.strip('|').split('|')] for r in block]
            if len(zellen) > 1 and set(''.join(zellen[1])) <= set('-: '):
                kopf, rest = zellen[0], zellen[2:]
            else:
                kopf, rest = None, zellen
            t = ['<table>']
            if kopf:
                t.append('<thead><tr>' + ''.join(f'<th>{inline(c)}</th>' for c in kopf) + '</tr></thead>')
            t.append('<tbody>')
            for r in rest:
                t.append('<tr>' + ''.join(f'<td>{inline(c)}</td>' for c in r) + '</tr>')
            t.append('</tbody></table>')
            out.append(''.join(t)); continue

        if re.match(r'^\s*[-*] ', z):                              # Liste
            buf = []
            while i < len(zeilen) and (re.match(r'^\s*[-*] ', zeilen[i]) or
                                       (zeilen[i].startswith('  ') and zeilen[i].strip() and buf)):
                if re.match(r'^\s*[-*] ', zeilen[i]):
                    buf.append(re.sub(r'^\s*[-*] ', '', zeilen[i]))
                else:
                    buf[-1] += ' ' + zeilen[i].strip()
                i += 1
            out.append('<ul>' + ''.join(f'<li>{inline(b)}</li>' for b in buf) + '</ul>'); continue

        if re.match(r'^\d+\. ', z):                                # nummerierte Liste
            buf = []
            while i < len(zeilen) and (re.match(r'^\d+\. ', zeilen[i]) or
                                       (zeilen[i].startswith('   ') and zeilen[i].strip() and buf)):
                if re.match(r'^\d+\. ', zeilen[i]):
                    buf.append(re.sub(r'^\d+\. ', '', zeilen[i]))
                else:
                    buf[-1] += ' ' + zeilen[i].strip()
                i += 1
            out.append('<ol>' + ''.join(f'<li>{inline(b)}</li>' for b in buf) + '</ol>'); continue

        if z.startswith('> '):                                     # Zitat
            buf = []
            while i < len(zeilen) and zeilen[i].startswith('>'):
                buf.append(zeilen[i].lstrip('> ')); i += 1
            out.append(f'<blockquote>{inline(" ".join(buf))}</blockquote>'); continue

        m = re.match(r'^(#{1,3}) (.*)', z)                         # Überschriften
        if m:
            tiefe, text = len(m.group(1)), m.group(2)
            if tiefe == 1 and text.startswith('Teil'):
                out.append(f'<h1 class="teil">{inline(text)}</h1>')
            elif tiefe == 1:
                out.append(f'<h1>{inline(text)}</h1>')
            elif tiefe == 2:
                nr = re.match(r'^(\d+)\. (.*)', text)
                if nr:
                    abschnitt = nr.group(1)
                    out.append(f'<h2><span class="nr">{abschnitt}</span>{inline(nr.group(2))}</h2>')
                else:
                    out.append(f'<h2 class="ohne-nr">{inline(text)}</h2>')
            else:
                out.append(f'<h3>{inline(text)}</h3>')
            i += 1; continue

        if z.strip():                                              # Absatz
            buf = []
            while i < len(zeilen) and zeilen[i].strip() and not re.match(
                    r'^(#{1,3} |\||```|> |\s*[-*] |\d+\. |---$)', zeilen[i]):
                buf.append(zeilen[i].strip()); i += 1
            out.append(f'<p>{inline(" ".join(buf))}</p>'); continue

        i += 1
    return '\n'.join(out)


md = QUELLE.read_text(encoding='utf-8')
# Kopf und Inhaltsverzeichnis werden eigens gesetzt
korpus = md.split('---\n---\n', 1)[1] if '---\n---\n' in md else md
inhalt_md = re.search(r'## Inhalt\n(.*?)\n---', md, re.S)
_roh = inhalt_md.group(1) if inhalt_md else ''
_roh = re.sub(r'^(\d+)\. ', '- \u27e6\\1\u27e7', _roh, flags=re.M)
inhalt = re.sub('\u27e6(\\d+)\u27e7', r'<span class="tnr">\1</span>', md2html(_roh))

STIL = f"""
@page {{ size: A4; margin: 20mm 16mm 18mm; }}
* {{ box-sizing: border-box; }}
body {{ font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif;
  font-size: 9.6pt; line-height: 1.62; color: #16191d; margin: 0; }}
h1, h2, h3 {{ line-height: 1.25; }}
h1 {{ font-size: 20pt; font-weight: 700; margin: 0 0 1.2em; color: {DUNKEL}; }}
h1.teil {{ page-break-before: always; border-bottom: 3px solid {GRUEN};
  padding-bottom: .35em; margin-bottom: 1.4em; }}
h2 {{ font-size: 13.5pt; font-weight: 700; margin: 2em 0 .7em; color: {DUNKEL};
  display: flex; align-items: center; gap: .6em; page-break-after: avoid; }}
h2.ohne-nr {{ display: block; }}
h2 .nr {{ display: inline-flex; align-items: center; justify-content: center;
  width: 1.7em; height: 1.7em; border-radius: 50%; background: {GRUEN};
  color: #fff; font-size: .78em; flex: none; }}
h3 {{ font-size: 11pt; font-weight: 700; margin: 1.5em 0 .5em;
  color: {GRUEN_D}; page-break-after: avoid; }}
p {{ margin: 0 0 .85em; }}
ul, ol {{ margin: 0 0 .95em; padding-left: 1.25em; }}
li {{ margin-bottom: .3em; }}
code {{ font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: .85em;
  background: #f1f8ec; color: {GRUEN_D}; padding: .1em .35em; border-radius: 3px; }}
pre {{ background: {DUNKEL2}; color: #d7dce2; padding: .95em 1.1em; border-radius: 7px;
  font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 8pt; line-height: 1.5;
  overflow-x: hidden; white-space: pre-wrap; margin: 0 0 1em; page-break-inside: avoid; }}
pre code {{ background: none; color: inherit; padding: 0; }}
table {{ width: 100%; border-collapse: collapse; margin: 0 0 1.1em; font-size: 8.8pt;
  page-break-inside: avoid; }}
th {{ background: {DUNKEL}; color: #fff; text-align: left; padding: .5em .7em;
  font-weight: 600; }}
td {{ padding: .48em .7em; border-bottom: 1px solid #e6e8eb; vertical-align: top; }}
tbody tr:nth-child(even) {{ background: #f8f9fa; }}
blockquote {{ margin: 0 0 1.1em; padding: .8em 1.1em; background: #f1f8ec;
  border-left: 4px solid {GRUEN}; }}
hr {{ border: 0; border-top: 1px solid #e1e5e8; margin: 1.6em 0; }}
a {{ color: {GRUEN_D}; text-decoration: none; }}

.deckel {{ position: relative; width: 210mm; height: 297mm; background: {DUNKEL};
  color: #fff; padding: 30mm 22mm; display: flex; flex-direction: column; }}
.deckel .balken {{ position: absolute; top: 0; left: 0; right: 0; height: 7mm; background: {GRUEN}; }}
.deckel .kicker {{ letter-spacing: .34em; font-size: 8.5pt; color: {GRUEN};
  text-transform: uppercase; margin: 8mm 0 7mm; }}
.deckel h1 {{ color: #fff; font-size: 33pt; line-height: 1.1; margin: 0 0 6mm; max-width: 15em; }}
.deckel .unter {{ font-size: 11.5pt; color: #c4cbd2; max-width: 30em; margin-bottom: 2mm; }}
.deckel .projekt {{ font-size: 10.5pt; color: {GRUEN}; font-weight: 600; }}
.deckel .linie {{ border-top: 1px solid #33421f; margin: 12mm 0 7mm; }}
.deckel .raster {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 7mm 5mm; }}
.deckel .raster .l {{ font-size: 7.5pt; letter-spacing: .17em; color: #8a949e;
  text-transform: uppercase; margin-bottom: 1.5mm; }}
.deckel .raster .w {{ font-size: 10pt; color: #fff; }}
.deckel .pillen {{ margin-top: 9mm; display: flex; gap: 3mm; flex-wrap: wrap; }}
.deckel .pille {{ border: 1px solid #33421f; border-radius: 999px; padding: 2mm 5mm;
  font-size: 8.5pt; color: #d6ead0; }}
.deckel .pille.voll {{ background: {GRUEN}; border-color: {GRUEN}; color: {DUNKEL}; font-weight: 600; }}
.deckel .fuss {{ margin-top: auto; display: flex; justify-content: space-between;
  align-items: flex-end; border-top: 1px solid #20262b; padding-top: 6mm; }}
.deckel .marke {{ display: flex; align-items: center; gap: 3.5mm; }}
.deckel .marke .zeichen {{ width: 13mm; height: 13mm; border-radius: 3mm;
  background: {GRUEN}; color: {DUNKEL}; font-weight: 800; font-size: 17pt;
  display: flex; align-items: center; justify-content: center; }}
.deckel .marke .name {{ font-size: 12.5pt; font-weight: 700; }}
.deckel .marke .name span {{ color: {GRUEN}; }}
.deckel .marke .slogan {{ font-size: 7.5pt; color: #8a949e; }}
.deckel .von {{ font-size: 8pt; color: #8a949e; text-align: right; line-height: 1.7; }}
.deckel .von b {{ color: #fff; font-weight: 600; }}

.info {{ page-break-after: always; }}
.info .kicker {{ letter-spacing: .2em; font-size: 8pt; color: {GRUEN_D};
  text-transform: uppercase; margin-bottom: 5mm; }}
.info .boxen {{ display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; margin-bottom: 7mm; }}
.info .box {{ border: 1px solid #e1e5e8; border-radius: 6px; padding: 6mm; }}
.info .box.dunkel {{ background: {DUNKEL}; color: #fff; border-color: {DUNKEL}; }}
.info .box .l {{ font-size: 7pt; letter-spacing: .17em; text-transform: uppercase;
  color: #8a949e; margin-bottom: 3mm; }}
.info .box .n {{ font-size: 13pt; font-weight: 700; margin-bottom: 2mm; }}
.info .box p {{ font-size: 8.8pt; margin: 0; color: inherit; opacity: .85; }}
.info h2 {{ font-size: 16pt; margin: 0 0 4mm; }}
.info ol, .info ul {{ list-style: none; padding: 0; margin: 0 0 1.5mm; }}
.info li {{ padding: .3mm 0; border-bottom: 1px dotted #cfd5db; font-size: 8.8pt;
  line-height: 1.35; margin: 0; }}
.info p {{ margin: 2.2mm 0 .6mm; font-size: 9.4pt; line-height: 1.3; }}
.info li strong {{ color: {GRUEN_D}; }}
.info li .tnr {{ display: inline-block; width: 7mm; color: {GRUEN_D}; font-weight: 600; }}
"""

DECKEL = f"""
<div class="deckel">
  <div class="balken"></div>
  <div class="kicker">Systemdokumentation</div>
  <h1>Makler-Profile und internes Dashboard</h1>
  <div class="unter">Self-Service-Profile für Makler, interner Team-Bereich und
    Steuerung der öffentlichen Sichtbarkeit.</div>
  <div class="projekt">Phönix Maklerverbund — Website-Redesign 2026</div>
  <div class="linie"></div>
  <div class="raster">
    <div><div class="l">Modul</div><div class="w">Profile &amp; Dashboard</div></div>
    <div><div class="l">Stand</div><div class="w">09.09.2026</div></div>
    <div><div class="l">Umsetzung</div><div class="w">16.06.–09.09.2026</div></div>
    <div><div class="l">Dokumenttyp</div><div class="w">Technische Systemdoku</div></div>
  </div>
  <div class="pillen">
    <div class="pille voll">Ersetzt die Fassung vom 22.06.2026</div>
    <div class="pille">Interner Bereich live seit 08.09.2026</div>
    <div class="pille">Sichtbarkeitssteuerung seit 09.09.2026</div>
  </div>
  <div class="fuss">
    <div class="marke">
      <div class="zeichen">S</div>
      <div>
        <div class="name">SUPERBRAND<span>.marketing</span></div>
        <div class="slogan">Dennis Sasse — Dein Superheld für deine Werbung.</div>
      </div>
    </div>
    <div class="von">Erstellt von <b>SUPERBRAND.marketing</b><br>für <b>Phönix Maklerverbund</b></div>
  </div>
</div>
"""

INFO = f"""
<div class="info">
  <div class="kicker">Dokument-Information</div>
  <div class="boxen">
    <div class="box">
      <div class="l">Auftraggeber</div>
      <div class="n">Phönix Maklerverbund</div>
      <p>Website-Redesign 2026<br>Module: Self-Service-Profile, internes Dashboard</p>
    </div>
    <div class="box dunkel">
      <div class="l">Erstellt von</div>
      <div class="n">SUPERBRAND.marketing</div>
      <p>Römerstraße 23 · 51674 Wiehl<br>0151 22142057 · superbrand.marketing</p>
    </div>
  </div>
  <h2>Inhalt</h2>
  {inhalt}
</div>
"""

html_doc = f"""<!doctype html><html lang="de"><head><meta charset="utf-8">
<style>{STIL}</style></head><body>{DECKEL}{INFO}{md2html(korpus)}</body></html>"""

TMP_D = WURZEL / '.doku-deckel.html'
TMP_K = WURZEL / '.doku-korpus.html'
# @page aus STIL wuerde die Null-Raender von pdf() ueberstimmen -> hier ueberschreiben.
TMP_D.write_text(f"""<!doctype html><html lang="de"><head><meta charset="utf-8">
<style>{STIL} @page {{ size: A4; margin: 0; }} html, body {{ margin: 0; padding: 0; }}
</style></head><body>{DECKEL}</body></html>""", encoding='utf-8')
TMP_K.write_text(f"""<!doctype html><html lang="de"><head><meta charset="utf-8">
<style>{STIL}</style></head><body>{INFO}{md2html(korpus)}</body></html>""", encoding='utf-8')

from playwright.sync_api import sync_playwright
from pypdf import PdfWriter, PdfReader

D_PDF, K_PDF = WURZEL / '.deckel.pdf', WURZEL / '.korpus.pdf'

with sync_playwright() as p:
    b = p.chromium.launch()

    # Deckseite: randlos, ohne Kopf- und Fußzeile
    pg = b.new_page()
    pg.goto(TMP_D.as_uri(), wait_until='networkidle')
    pg.pdf(path=str(D_PDF), format='A4', print_background=True,
           margin={'top': '0', 'bottom': '0', 'left': '0', 'right': '0'})

    # Korpus: mit Kopf- und Fußzeile
    pg2 = b.new_page()
    pg2.goto(TMP_K.as_uri(), wait_until='networkidle')
    pg2.pdf(
        path=str(K_PDF), format='A4', print_background=True,
        margin={'top': '20mm', 'bottom': '18mm', 'left': '16mm', 'right': '16mm'},
        display_header_footer=True,
        header_template=f"""<div style="width:100%;font-size:7pt;color:#8a949e;
          padding:0 16mm;display:flex;justify-content:space-between;
          border-bottom:1px solid {GRUEN};padding-bottom:2mm;margin-bottom:2mm;">
          <span><b style="color:{GRUEN_D}">S</b>&nbsp; Makler-Profile und internes Dashboard</span>
          <span>Ph&#246;nix Maklerverbund</span></div>""",
        footer_template="""<div style="width:100%;font-size:7pt;color:#8a949e;
          padding:0 16mm;display:flex;justify-content:space-between;">
          <span>Made with &#10084; by SUPERBRAND.marketing — Dein Superheld f&#252;r deine Werbung.</span>
          <span>Seite <span class="pageNumber"></span></span></div>""",
    )
    b.close()

w = PdfWriter()
for f in (D_PDF, K_PDF):
    for seite in PdfReader(str(f)).pages:
        w.add_page(seite)
with open(ZIEL, 'wb') as fh:
    w.write(fh)

for f in (TMP_D, TMP_K, D_PDF, K_PDF):
    f.unlink(missing_ok=True)
print(f"\u2713 {ZIEL}  ({ZIEL.stat().st_size // 1024} KB, {len(PdfReader(str(ZIEL)).pages)} Seiten)")
