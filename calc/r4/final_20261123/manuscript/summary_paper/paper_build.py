"""AIK (대한건축학회논문집) style journal paper builder: A4, title block one column, body two columns,
English abstract/tables/figures/references, author-year citations.
usage: python3 paper_build.py paper.txt out.docx
Markup: @KEY lines for front matter (TITLE_KO, TITLE_EN, AUTH_KO, AUTH_EN, AFFIL, ABSTRACT, KW_EN, KW_KO, NOTE), then body:
'# ' chapter, '## ' section, '### ' paragraph heading, TC table caption + |rows| (+|W..|), FIG file;mm + FC caption,
NOTE table/figure note, EQ equation  (n), WIDE / ENDWIDE (one-column block), @REFS then one reference per line."""
import os, re, sys
import docx
from docx.shared import Mm
from lxml import etree

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
H = os.path.dirname(os.path.abspath(__file__))
EA = os.environ.get('FONT_EA', '바탕')
LAT = os.environ.get('FONT_LAT', 'Times New Roman')
EQF = os.environ.get('FONT_EQ', LAT)
SRC, OUT = sys.argv[1], sys.argv[2]
BLIND = os.environ.get('BLIND') == '1'

PW, PH = 11906, 16838
MT, MB, ML, MR = 1418, 1418, 1191, 1191
TW = PW - ML - MR                 # 9524 twips = 168 mm
GAP = 340
CW = (TW - GAP) // 2              # 4592 twips ≈ 81 mm
BODY = 18                         # 9 pt
LINE = 272


def q(t): return '{%s}%s' % (W, t)
def esc(s): return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


FONT = f'<w:rFonts w:ascii="{LAT}" w:hAnsi="{LAT}" w:eastAsia="{EA}" w:cs="{LAT}"/>'


def rpr(sz=BODY, b=False, i=False, sup=False, sub=False, font=None, color=None):
    f = FONT if not font else f'<w:rFonts w:ascii="{font}" w:hAnsi="{font}" w:eastAsia="{EA}" w:cs="{font}"/>'
    return ('<w:rPr>' + f + ('<w:b/><w:bCs/>' if b else '') + ('<w:i/>' if i else '') + (f'<w:color w:val="{color}"/>' if color else '') +
            f'<w:sz w:val="{sz}"/><w:szCs w:val="{sz}"/>' + ('<w:vertAlign w:val="superscript"/>' if sup else '') +
            ('<w:vertAlign w:val="subscript"/>' if sub else '') + '</w:rPr>')


UNIT_SP = re.compile(r'(\d) (?=(?:kWh|kW|MW|W/m²|W|m²|mm|cm|km|m|lx|ha|K|°C)(?![A-Za-z]))')
NUM_SUF = re.compile(r'(\d)(?=(?:%p|%|동|개|층|월|일|°|배|종|건|곳|년|회|분|초|시|편|가구))')
REFNO = re.compile(r'(Table|Figure|Eq\.|표|그림|식) (\(?)(\d+)')
SUBTOK = re.compile(r'((?<![A-Za-z0-9])(?:Δ?[A-Za-zθε]{1,4}))_(\{[^}]+\}|[A-Za-z0-9]+)')
SUPTOK = re.compile(r'\^\{([^}]+)\}')


def nb(t):
    t = UNIT_SP.sub('\\1\u00a0', t)
    t = NUM_SUF.sub('\\1\u2060', t).replace('%p', '%\u2060p')
    t = REFNO.sub(lambda m: m.group(1) + '\u00a0' + m.group(2) + m.group(3), t)
    t = re.sub(r'\((?=\S)', '(\u2060', t)
    return t


def runs(text, sz=BODY, b=False, i=False, body=False, font=None, color=None):
    if body: text = nb(text)
    out = []
    for part in re.split(r'(\*\*[^*]+\*\*|__[^_]+__)', text):
        if not part: continue
        bb, ii = b, i
        if part.startswith('**') and part.endswith('**'): part = part[2:-2]; bb = True
        elif part.startswith('__') and part.endswith('__') and len(part) > 4: part = part[2:-2]; ii = True
        toks = []
        pos = 0
        for m in re.finditer(r'((?<![A-Za-z0-9])(?:Δ?[A-Za-zθε]{1,4}))_(\{[^}]+\}|[A-Za-z0-9]+)|\^\{([^}]+)\}', part):
            if m.start() > pos: toks.append((part[pos:m.start()], ''))
            if m.group(3) is not None: toks.append((m.group(3), 'sup'))
            else:
                toks.append((m.group(1), '')); toks.append((m.group(2).strip('{}'), 'sub'))
            pos = m.end()
        if pos < len(part): toks.append((part[pos:], ''))
        for t, k in toks:
            out.append(f'<w:r>{rpr(sz, bb, ii, sup=k == "sup", sub=k == "sub", font=font, color=color)}<w:t xml:space="preserve">{esc(t)}</w:t></w:r>')
    return ''.join(out)


def P(xml): return etree.fromstring(f'<w:p xmlns:w="{W}">{xml}</w:p>')


def ppr(jc='both', before=0, after=0, line=LINE, rule='exact', ind='', keep=False, extra=''):
    return ('<w:pPr>' + ('<w:keepNext/>' if keep else '') + '<w:widowControl/>' +
            f'<w:spacing w:before="{before}" w:after="{after}" w:line="{line}" w:lineRule="{rule}"/>' + ind + f'<w:jc w:val="{jc}"/>' + extra + '</w:pPr>')


def _tw(s, sz):
    em = sz * 10; w = 0
    for ch in s:
        o = ord(ch); w += em if (0x1100 <= o <= 0x11FF or 0x2E80 <= o <= 0x9FFF or 0xAC00 <= o <= 0xD7AF) else em * 0.52
    return w


def table_xml(rows, widths, total, sz=14):
    ncol = max(len(r) for r in rows)
    if widths is None:
        lens = [max(len(r[c]) if c < len(r) else 0 for r in rows) for c in range(ncol)]
        lens = [min(max(l, 4), 36) for l in lens]; s = sum(lens); widths = [int(total * l / s) for l in lens]
    else:
        widths = widths[:ncol] + [2.0] * (ncol - len(widths)); s = sum(widths); widths = [int(total * w / s) for w in widths]
    numre = re.compile(r'^[\s−+\-–~0-9.,%()p/·°×*a-z<>≤≥]*$')
    align = []
    for c in range(ncol):
        col = [r[c] if c < len(r) else '' for r in rows[1:]]
        numfrac = sum(1 for t in col if numre.match(t)) / max(1, len(col))
        align.append('left' if (c == 0 and ncol > 1) else ('center' if numfrac >= 0.5 or all(len(t) <= 14 for t in col) else 'left'))
    x = [f'<w:tbl xmlns:w="{W}"><w:tblPr><w:tblW w:w="{total}" w:type="dxa"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/>'
         '<w:tblCellMar><w:left w:w="45" w:type="dxa"/><w:right w:w="45" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>']
    x += [f'<w:gridCol w:w="{w}"/>' for w in widths]; x.append('</w:tblGrid>')
    small = len(rows) <= 14
    for ri, r in enumerate(rows):
        hdr = ri == 0
        kn = '<w:keepNext/>' if (small and ri < len(rows) - 1) or hdr else ''
        x.append('<w:tr><w:trPr><w:cantSplit/>' + ('<w:tblHeader/>' if hdr else '') + '</w:trPr>')
        for c in range(ncol):
            t = r[c] if c < len(r) else ''
            t = re.sub(r'(\d)(%p|%|°)', '\\1\u2060\\2', t).replace('%p', '%\u2060p'); t = UNIT_SP.sub('\\1\u00a0', t)
            t = t.replace('cut-off', 'cut\u2011off').replace('solar-threshold', 'solar\u2011threshold')
            top = '<w:top w:val="single" w:sz="12" w:color="000000"/>' if hdr else '<w:top w:val="nil"/>'
            bot = '<w:bottom w:val="single" w:sz="4" w:color="000000"/>' if (hdr or ri == len(rows) - 1) else '<w:bottom w:val="nil"/>'
            if ri == len(rows) - 1: bot = '<w:bottom w:val="single" w:sz="12" w:color="000000"/>'
            jc = 'center' if hdr else align[c]
            paras = ''.join(f'<w:p><w:pPr>{kn}<w:spacing w:before="10" w:after="10" w:line="200" w:lineRule="auto"/><w:jc w:val="{jc}"/></w:pPr>{runs(line, sz, hdr)}</w:p>' for line in t.split('\\n'))
            x.append(f'<w:tc><w:tcPr><w:tcW w:w="{widths[c]}" w:type="dxa"/><w:tcBorders>{top}<w:left w:val="nil"/>{bot}<w:right w:val="nil"/></w:tcBorders><w:vAlign w:val="center"/></w:tcPr>{paras}</w:tc>')
        x.append('</w:tr>')
    x.append('</w:tbl>')
    return etree.fromstring(''.join(x))


class Doc:
    def __init__(self):
        self.doc = docx.Document()
        self.body = self.doc.element.body
        for el in list(self.body):
            if el.tag != q('sectPr'): self.body.remove(el)
        self.final = self.body.find(q('sectPr'))
        self.footer = None

    def add(self, el): self.final.addprevious(el); return el

    def footer_rel(self):
        if self.footer: return self.footer
        from docx.opc.constants import RELATIONSHIP_TYPE as RT
        from docx.opc.packuri import PackURI
        from docx.opc.part import Part
        body = (f'<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r>{rpr(16)}<w:fldChar w:fldCharType="begin"/></w:r>'
                f'<w:r>{rpr(16)}<w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r>{rpr(16)}<w:fldChar w:fldCharType="separate"/></w:r>'
                f'<w:r>{rpr(16)}<w:t>1</w:t></w:r><w:r>{rpr(16)}<w:fldChar w:fldCharType="end"/></w:r></w:p>')
        xml = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="{W}" xmlns:r="{R_NS}">{body}</w:ftr>'
        part = Part(PackURI('/word/footer1.xml'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml', xml.encode('utf-8'), self.doc.part.package)
        self.footer = self.doc.part.relate_to(part, RT.FOOTER)
        return self.footer

    def footnote(self, lines):
        """AIK-style first-page note: a frame anchored to the bottom of the left column of page 1 (text wraps above it)."""
        out = []
        for k, t in enumerate(lines):
            bdr = '<w:pBdr><w:top w:val="single" w:sz="4" w:space="3" w:color="000000"/></w:pBdr>'
            fp = f'<w:framePr w:w="{CW}" w:hSpace="0" w:vSpace="120" w:wrap="around" w:vAnchor="margin" w:hAnchor="margin" w:x="0" w:yAlign="bottom"/>'
            out.append(P(f'<w:pPr>{fp}{bdr}<w:spacing w:before="0" w:after="0" w:line="200" w:lineRule="auto"/><w:ind w:left="170" w:hanging="170"/><w:jc w:val="left"/></w:pPr>{runs(t, 14)}'))
        return out

    def sect(self, cols, cont=True):
        rid = self.footer_rel()
        c = f'<w:cols w:num="2" w:space="{GAP}"/>' if cols == 2 else '<w:cols w:space="425"/>'
        return etree.fromstring(f'<w:sectPr xmlns:w="{W}" xmlns:r="{R_NS}"><w:footerReference w:type="default" r:id="{rid}"/>'
                                + ('<w:type w:val="continuous"/>' if cont else '') +
                                f'<w:pgSz w:w="{PW}" w:h="{PH}"/><w:pgMar w:top="{MT}" w:right="{MR}" w:bottom="{MB}" w:left="{ML}" w:header="851" w:footer="567" w:gutter="0"/>'
                                f'{c}<w:docGrid w:linePitch="{LINE}"/></w:sectPr>')

    def end_section(self, cols, cont=True):
        p = P('<w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr>')
        p.find(q('pPr')).append(self.sect(cols, cont)); self.add(p)

    def image(self, path, mm):
        p = self.doc.add_paragraph(); p.paragraph_format.alignment = 1; p.paragraph_format.keep_with_next = True
        from docx.shared import Pt; p.paragraph_format.space_before = Pt(6)
        p.add_run().add_picture(path, width=Mm(mm)); el = p._p; self.body.remove(el); self.add(el)

    def finish(self, cols, title):
        new = self.sect(cols, cont=True)
        self.final.getparent().replace(self.final, new); self.final = new
        cp = self.doc.core_properties; cp.title = title; cp.author = '' if BLIND else os.environ.get('AUTHOR_META', '조승완, 박미애'); cp.last_modified_by = ''; cp.comments = ''
        self.doc.save(OUT)


def main():
    lines = open(SRC, encoding='utf-8').read().split('\n')
    F = {}; body = []; refs = []; cur = None; mode = 'front'
    for ln in lines:
        if ln.startswith('@REFS'): mode = 'refs'; continue
        if mode == 'refs':
            if ln.strip(): refs.append(ln.strip())
            continue
        if ln.startswith('@BODY'): mode = 'body'; continue
        if mode == 'front':
            if ln.startswith('@'): cur = ln[1:].strip(); F[cur] = []; continue
            if ln.strip() and cur: F[cur].append(ln.strip())
        else:
            body.append(ln)
    D = Doc()
    # ---- title block (one column)
    for k, t in enumerate(F['TITLE_KO']):
        D.add(P(ppr('center', 0, 120 if k == len(F['TITLE_KO']) - 1 else 0, line=330, rule='auto') + runs(t, 30, True)))
    for t in F.get('SUB_KO', []): D.add(P(ppr('center', 0, 120, line=320, rule='auto') + runs(t, 22)))
    for k, t in enumerate(F['TITLE_EN']):
        D.add(P(ppr('center', 120 if k == 0 else 0, 60 if k == len(F['TITLE_EN']) - 1 else 0, line=300, rule='auto') + runs(t, 22, True)))
    for t in F.get('SUB_EN', []): D.add(P(ppr('center', 0, 200, line=280, rule='auto') + runs(t, 19)))
    for t in ([] if BLIND else F['AUTH']): D.add(P(ppr('center', 0, 40, line=280, rule='auto') + runs(t, 19)))
    for t in ([] if BLIND else F.get('AFFIL', [])): D.add(P(ppr('center', 0, 0, line=240, rule='auto') + runs(t, 15)))
    D.add(P(ppr('center', 260, 80, line=260, rule='auto') + runs('Abstract', 19, True)))
    for t in F['ABSTRACT']:
        D.add(P(ppr('both', 0, 60, line=250, rule='auto', ind='<w:ind w:left="567" w:right="567" w:firstLine="284"/>') + runs(t, 17)))
    D.add(P(ppr('left', 100, 0, line=250, rule='auto', ind='<w:ind w:left="567" w:right="567" w:hanging="0"/>') + runs('Keywords : ', 17, True) + runs(' '.join(F['KW_EN']), 17)))
    D.add(P(ppr('left', 0, 120, line=250, rule='auto', ind='<w:ind w:left="567" w:right="567"/>') + runs('주요어 : ', 17, True) + runs(' '.join(F['KW_KO']), 17)))
    for t in ([] if BLIND else F.get('NOTE', [])):
        D.add(P('<w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="2" w:color="000000"/></w:pBdr><w:spacing w:before="40" w:after="0" w:line="220" w:lineRule="auto"/><w:ind w:right="5600"/><w:jc w:val="left"/></w:pPr>' + runs(t, 14)) if t == F['NOTE'][0]
              else P(ppr('left', 0, 0, line=220, rule='auto', ind='<w:ind w:right="5600"/>') + runs(t, 14)))
    D.end_section(1, cont=False)   # first section: title block (new page section start)
    if F.get('FOOT') and not BLIND:
        for el in D.footnote(F['FOOT']): D.add(el)
    cols = 2; i = 0; prev_head = False
    nt = 0; nf = 0
    while i < len(body):
        ln = body[i].rstrip(); i += 1
        if not ln.strip(): continue
        nxt = next((l for l in body[i:] if l.strip()), '')
        if ln.strip() == 'WIDE':
            D.end_section(2); cols = 1; continue
        if ln.strip() == 'ENDWIDE':
            D.end_section(1); cols = 2; continue
        width = CW if cols == 2 else TW
        if ln.startswith('# '):
            D.add(P(ppr('left', 280, 140, line=300, rule='auto', keep=True) + runs(ln[2:].strip(), 20, True))); prev_head = True; continue
        if ln.startswith('## '):
            D.add(P(ppr('left', 160, 60, line=280, rule='auto', keep=True) + runs(ln[3:].strip(), 18, True))); prev_head = True; continue
        if ln.startswith('### '):
            t = ln[4:].strip(); a, b = (t.split('  ', 1) + [''])[:2]
            D.add(P(ppr('both', 40, 0, ind=f'<w:ind w:firstLine="{BODY * 10}"/>') + runs(a, BODY, True) + runs(' ' + b.strip(), body=True))); continue
        if ln.startswith('TC '):
            m = re.match(r'^(Table \d+\.)\s*(.*)$', ln[3:].strip())
            D.add(P(ppr('center', 160, 60, line=220, rule='auto', keep=True) + runs(m.group(1), 16, True) + runs(' ' + m.group(2), 16))); continue
        if ln.startswith('|'):
            rows = []; widths = None; i -= 1
            while i < len(body) and body[i].startswith('|'):
                l2 = body[i].strip(); i += 1
                if re.match(r'^\|W[\d.,]+\|?$', l2): widths = [float(x) for x in l2.strip('|')[1:].split(',')]; continue
                rows.append([c.strip() for c in l2.strip('|').split('|')])
            D.add(table_xml(rows, widths, width - 60, 14 if cols == 2 else 15)); continue
        if ln.startswith('FIG '):
            p_, w_ = [x.strip() for x in ln[4:].split(';')]
            D.image(os.path.join(H, 'figs', p_), min(float(w_), (width - 40) / 56.7)); continue
        if ln.startswith('FC '):
            m = re.match(r'^(Figure \d+\.)\s*(.*)$', ln[3:].strip())
            D.add(P(ppr('center', 40, 160, line=220, rule='auto') + runs(m.group(1), 16, True) + runs(' ' + m.group(2), 16))); continue
        if ln.startswith('NOTE '):
            D.add(P(ppr('both', 30, 140, line=200, rule='auto') + runs(ln[5:].strip(), 14))); continue
        if ln.startswith('EQ '):
            mm = re.match(r'^(.*?)\s{2,}(\(\d+\))\s*$', ln[3:].strip())
            eq, no = (mm.group(1), mm.group(2)) if mm else (ln[3:].strip(), '')
            tabs = f'<w:tabs><w:tab w:val="center" w:pos="{width // 2}"/><w:tab w:val="right" w:pos="{width - 20}"/></w:tabs>'
            D.add(P(f'<w:pPr>{tabs}<w:spacing w:before="80" w:after="80" w:line="280" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr>'
                    f'<w:r>{rpr()}<w:tab/></w:r>' + runs(eq, BODY, font=EQF) + (f'<w:r>{rpr()}<w:tab/></w:r>' + runs(no) if no else ''))); continue
        D.add(P(ppr('both', 0, 0, ind=f'<w:ind w:firstLine="{BODY * 10}"/>', keep=prev_head and len(ln) < 60) + runs(ln.strip(), body=True)))
        prev_head = False
    # references
    D.add(P(ppr('left', 280, 120, line=300, rule='auto', keep=True) + runs('References', 20, True)))
    for k, r in enumerate(refs, 1):
        D.add(P(ppr('left', 0, 30, line=220, rule='auto', ind='<w:ind w:left="340" w:hanging="340"/>') + runs(f'{k}. ' + r if False else r, 15)))
    D.finish(cols, ' '.join(F['TITLE_KO']))
    print('ok', OUT)


main()
