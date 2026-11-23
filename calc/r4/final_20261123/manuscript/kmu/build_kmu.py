"""Kookmin University doctoral dissertation builder (B5 18.2x25.7 cm, 명조, page numbers bottom centre,
front matter in lower-case roman numerals, body arabic).
usage: FONT_EA=바탕 python3 build_kmu.py out.docx [pagemap.json]
Markup: '# ' chapter (new page), '## ' section, '### ' subsection, TC table caption, |..| table rows (|W..| widths),
FIG path;width_cm, FC figure caption, NOTE, BL label  text, EQ equation, plain line = paragraph."""
import os, re, sys, json
import docx
from docx.shared import Cm, Pt
from lxml import etree

H = os.path.dirname(os.path.abspath(__file__))
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
FIGDIR = os.path.join(H, 'figs')
EA = os.environ.get('FONT_EA', '바탕')
LAT = os.environ.get('FONT_LAT', 'Times New Roman')
OUT = sys.argv[1]
PM = json.load(open(sys.argv[2])) if len(sys.argv) > 2 and os.path.exists(sys.argv[2]) else {}

# ---------------------------------------------------------------- page geometry (twips)
PW, PH = 10319, 14572          # B5 182 x 257 mm
ML, MR, MT, MB = 1701, 1417, 1701, 1417   # left 3.0, right 2.5, top 3.0, bottom 2.5 cm
HDR, FTR = 851, 794
TW = PW - ML - MR              # 7201 twips = 12.7 cm text width
BODY_H = PH - MT - MB
BODY_SZ = 21                   # 10.5 pt
LINE = 400                     # exact 20 pt -> 28 lines per page


def q(t):
    return '{%s}%s' % (W, t)


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


FONT = f'<w:rFonts w:ascii="{LAT}" w:hAnsi="{LAT}" w:eastAsia="{EA}" w:cs="{LAT}"/>'


def rpr(sz=BODY_SZ, b=False, i=False, color=None, sup=False, sub=False, spacing=None, lang=False):
    return '<w:rPr>' + FONT + (('<w:lang w:val="en-US" w:eastAsia="en-US"/>' if lang == 'cell' else '<w:lang w:val="en-US" w:eastAsia="ko-KR"/>') if lang else '') + ('<w:b/><w:bCs/>' if b else '') + ('<w:i/>' if i else '') + \
           (f'<w:color w:val="{color}"/>' if color else '') + (f'<w:spacing w:val="{spacing}"/>' if spacing else '') + \
           (f'<w:sz w:val="{sz}"/><w:szCs w:val="{sz}"/>') + ('<w:vertAlign w:val="superscript"/>' if sup else '') + \
           ('<w:vertAlign w:val="subscript"/>' if sub else '') + '</w:rPr>'


EQF = os.environ.get('FONT_EQ', LAT)
UNIT_SP = re.compile(r'(\d) (?=(?:kWh|kW|MW|W/m²|W|m²|mm|cm|km|m|lx|ha|K|°C)(?![A-Za-z]))')
NUM_SUF = re.compile(r'(\d)(?=(?:%p|%|동|개|층|월|일|°|배|종|건|곳|년|회|분|초|시|편|가구|행|칸))')
REFNO = re.compile(r'(표|그림|식) (\(?)([A-Z]?\d+)-(\d+[a-z]?)')
SUBTOK = re.compile(r'((?<![A-Za-z0-9])(?:Δ?[A-Za-zα-ω]{1,4}))_([A-Za-z0-9]+)')
MACRON = re.compile(r'(.\u0304)')


def nb(t):
    """line-break control for body text: keep number+unit/suffix, table/figure/equation numbers and '(' together"""
    t = UNIT_SP.sub('\\1\u00a0', t)
    t = NUM_SUF.sub('\\1\u2060', t).replace('%\u2060p', '%p').replace('%p', '%\u2060p')
    t = REFNO.sub(lambda m: m.group(1) + '\u00a0' + m.group(2) + m.group(3) + '\u2060-\u2060' + m.group(4), t)
    return t


PROT = re.compile('(?:표|그림|식)\u00a0\\(?\u2060?[A-Z]?\\d+\u2060-\u2060\\d+[a-z]?\\)?'
                  '|\\d[\\d,.]*\u2060(?:%\u2060p|%|동|개|층|월|일|°|배|종|건|곳|년|회|분|초|시|편|가구|행|칸)'
                  '|\\d[\\d,.]*\u00a0(?:kWh/\\(\u2060?m²·yr\\)|kWh|kW|MW|W/m²|W|m²|mm|cm|km|m|lx|ha|K|°C)')

PROT_C = re.compile('[(\u300c\u300e][^\\s()]{1,2}|' + PROT.pattern)


def runs(text, sz=BODY_SZ, b=False, i=False, color=None, body=False, font=None, lang=False, cell=False):
    out = []
    if body:
        text = nb(text); pos = 0
        for m in (PROT_C if cell else PROT).finditer(text):
            if m.start() > pos: out.append(runs(text[pos:m.start()], sz, b, i, color, font=font))
            out.append(runs(m.group(0), sz, b, i, color, font=font, lang='cell' if cell else True)); pos = m.end()
        if pos < len(text): out.append(runs(text[pos:], sz, b, i, color, font=font))
        return ''.join(out)
    fx = (lambda r: r.replace(FONT, f'<w:rFonts w:ascii="{font}" w:hAnsi="{font}" w:eastAsia="{EA}" w:cs="{font}"/>')) if font else (lambda r: r)
    for part in re.split(r'(\*\*[^*]+\*\*)', text):
        if not part:
            continue
        bb = b
        if part.startswith('**') and part.endswith('**'):
            part = part[2:-2]; bb = True
        if font is None and '\u0304' in part:
            for seg in MACRON.split(part):
                if not seg: continue
                if MACRON.fullmatch(seg):
                    out.append(f'<w:r>{rpr(sz, bb, i, color, lang=lang).replace(FONT, f"<w:rFonts w:ascii=\"{EQF}\" w:hAnsi=\"{EQF}\" w:eastAsia=\"{EQF}\" w:cs=\"{EQF}\"/>")}<w:t xml:space="preserve">{esc(seg)}</w:t></w:r>')
                else:
                    out.append(runs(seg, sz, bb, i, color))
            continue
        pos = 0
        for m in SUBTOK.finditer(part):
            if m.start() > pos:
                out.append(f'<w:r>{fx(rpr(sz, bb, i, color, lang=lang))}<w:t xml:space="preserve">{esc(part[pos:m.start()])}</w:t></w:r>')
            out.append(f'<w:r>{fx(rpr(sz, bb, i, color, lang=lang))}<w:t xml:space="preserve">{esc(m.group(1))}</w:t></w:r>')
            out.append(f'<w:r>{fx(rpr(sz, bb, i, color, sub=True, lang=lang))}<w:t xml:space="preserve">{esc(m.group(2))}</w:t></w:r>')
            pos = m.end()
        if pos < len(part):
            out.append(f'<w:r>{fx(rpr(sz, bb, i, color, lang=lang))}<w:t xml:space="preserve">{esc(part[pos:])}</w:t></w:r>')
    return ''.join(out)


def P(xml):
    return etree.fromstring(f'<w:p xmlns:w="{W}">{xml}</w:p>')


def ppr(jc='both', before=0, after=0, line=LINE, rule='exact', ind='', keep=False, extra=''):
    return ('<w:pPr>' + ('<w:keepNext/>' if keep else '') + '<w:widowControl/>' +
            f'<w:spacing w:before="{before}" w:after="{after}" w:line="{line}" w:lineRule="{rule}"/>' + ind +
            f'<w:jc w:val="{jc}"/>' + extra + '</w:pPr>')


def para_body(text, indent=True, keep=False):
    ind = f'<w:ind w:firstLine="{BODY_SZ * 10}"/>' if indent else ''
    return P(ppr('both', 0, 80, ind=ind, keep=keep) + runs(text, body=True))


def para_bl(label, text):
    return P(ppr('both', 40, 80, ind='<w:ind w:left="0"/>') + runs(label, b=True) + runs('  ' + text, body=True))


def para_h1(text):
    return P('<w:pPr><w:pStyle w:val="Heading1"/><w:keepNext/><w:pageBreakBefore/><w:spacing w:before="600" w:after="560" w:line="360" w:lineRule="auto"/>'
             '<w:jc w:val="center"/><w:outlineLvl w:val="0"/></w:pPr>' + runs(text, 32, True, color='000000'))


def para_h2(text):
    return P('<w:pPr><w:pStyle w:val="Heading2"/><w:keepNext/><w:keepLines/><w:spacing w:before="400" w:after="160" w:line="320" w:lineRule="auto"/>'
             '<w:jc w:val="left"/><w:outlineLvl w:val="1"/></w:pPr>' + runs(text, 26, True, color='000000'))


def para_h3(text):
    return P('<w:pPr><w:pStyle w:val="Heading3"/><w:keepNext/><w:keepLines/><w:spacing w:before="240" w:after="100" w:line="300" w:lineRule="auto"/>'
             '<w:jc w:val="left"/><w:outlineLvl w:val="2"/></w:pPr>' + runs(text, 22, True, color='000000'))


def para_cap(text, table=False):
    kn = '<w:keepNext/>' if table else ''
    sp = '<w:spacing w:before="200" w:after="80" w:line="280" w:lineRule="auto"/>' if table else '<w:spacing w:before="40" w:after="200" w:line="280" w:lineRule="auto"/>'
    m = re.match(r'^((?:표|그림) [A-Z]?\d*-?\d+\.)\s*(.*)$', text)
    body = runs(m.group(1), 19, True) + runs(' ' + m.group(2), 19) if m else runs(text, 19, True)
    return P('<w:pPr>' + kn + sp + '<w:ind w:left="300" w:right="300"/><w:jc w:val="center"/></w:pPr>' + body)


def para_note(text):
    return P('<w:pPr><w:keepLines/><w:spacing w:before="60" w:after="200" w:line="250" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr>' + runs(text, 16, color='333333', body=True))


def para_eq(text, cont=False, keep=False, group_end=False):
    """equation: centred by a centre tab, number right-aligned by a right tab; X_sub -> subscript"""
    m = re.match(r'^(.*?)\s{2,}(\([A-Z]?\d+-\d+[a-z]?\))\s*$', text)
    eq, no = (m.group(1).strip(), m.group(2)) if m else (text.strip(), '')
    wide = _text_tw(eq, 20) * 1.2 > TW - 1700
    tabs = (f'<w:tabs><w:tab w:val="right" w:pos="{TW}"/></w:tabs>' if wide else
            f'<w:tabs><w:tab w:val="center" w:pos="{TW // 2}"/><w:tab w:val="right" w:pos="{TW}"/></w:tabs>')
    after = 160 if (no and not keep) or (not no and group_end) else 40
    sp = f'<w:spacing w:before="{40 if cont else 120}" w:after="{after}" w:line="320" w:lineRule="auto"/>'
    kn = '<w:keepNext/>' if (keep or not no) else ''
    tab = f'<w:r>{rpr(20)}<w:tab/></w:r>'
    ind = '<w:ind w:left="400"/>' if wide else ''
    lead = '' if wide else tab
    return P(f'<w:pPr>{kn}{tabs}{sp}{ind}<w:jc w:val="left"/></w:pPr>' + lead + runs(eq, 20, font=EQF) + (tab + runs(no, 20) if no else ''))


def para_center(text, sz=BODY_SZ, b=False, before=0, after=0, line=None, spacing=None):
    lr = f'<w:spacing w:before="{before}" w:after="{after}"' + (f' w:line="{line}" w:lineRule="exact"/>' if line else '/>')
    return P(f'<w:pPr>{lr}<w:jc w:val="center"/></w:pPr>' + f'<w:r>{rpr(sz, b, spacing=spacing)}<w:t xml:space="preserve">{esc(text)}</w:t></w:r>')


def para_right(text, sz=BODY_SZ, b=False, before=0, after=0):
    return P(f'<w:pPr><w:spacing w:before="{before}" w:after="{after}" w:line="300" w:lineRule="auto"/><w:jc w:val="right"/></w:pPr>' + runs(text, sz, b))


def blank(n=1, h=LINE):
    return [P(f'<w:pPr><w:spacing w:before="0" w:after="0" w:line="{h}" w:lineRule="exact"/></w:pPr>') for _ in range(n)]


def page_break():
    return P('<w:r><w:br w:type="page"/></w:r>')


def para_ref(text):
    return P(f'<w:pPr><w:spacing w:before="0" w:after="100" w:line="300" w:lineRule="auto"/><w:ind w:left="440" w:hanging="440"/><w:jc w:val="left"/></w:pPr>' + runs(text, 19))


def toc_entry(text, page, level, b=False, hang=False):
    ind = {0: 0, 1: 300, 2: 600}[level]
    sz = 21 if level == 0 else 20
    hg = 0
    if hang:
        m = re.match(r'^((?:표|그림) [A-Z]?\d*-?\d+[a-z]?\.)', text)
        hg = int(_text_tw(m.group(1) + ' ', sz)) if m else 0
    elif level > 0:
        m = re.match(r'^([\d.]+\s+)', text)
        hg = int(_text_tw(m.group(1), sz)) if m else 0
    return P(f'<w:pPr><w:tabs><w:tab w:val="right" w:leader="middleDot" w:pos="{TW}"/></w:tabs><w:spacing w:before="{(30 if hang else 80) if level == 0 else 0}" w:after="20" w:line="300" w:lineRule="auto"/>'
             f'<w:ind w:left="{ind + hg}" w:right="500" w:hanging="{hg}"/><w:jc w:val="left"/></w:pPr>' +
             f'<w:r>{rpr(sz, b)}<w:t xml:space="preserve">{esc(text)}</w:t></w:r><w:r>{rpr(sz, b)}<w:tab/><w:t>{page}</w:t></w:r>')


# ---------------------------------------------------------------- tables
def _text_tw(s, fs):
    em = fs * 10; w = 0
    for ch in s:
        o = ord(ch)
        w += em if (0x1100 <= o <= 0x11FF or 0x2E80 <= o <= 0x9FFF or 0xAC00 <= o <= 0xD7AF or 0xFF00 <= o <= 0xFFEF) else em * 0.55
    return w


def _row_h(r, widths, fs):
    best = 1
    for c, t in enumerate(r):
        if c >= len(widths): break
        avail = max(widths[c] - 200, 300)
        n = sum(max(1, -(-int(_text_tw(line, fs)) // avail)) for line in t.split('\\n'))
        best = max(best, n)
    return best * fs * 12 + 80


def table_xml(rows, widths=None, keep_last=False):
    ncol = max(len(r) for r in rows)
    fs = 15 if ncol >= 10 else (16 if ncol >= 7 else 17)
    total = TW
    if widths is None:
        lens = [max(len(r[c]) if c < len(r) else 0 for r in rows) for c in range(ncol)]
        lens = [min(max(l, 4), 40) for l in lens]; s = sum(lens); widths = [int(total * l / s) for l in lens]
    else:
        widths = widths[:ncol] + [2.0] * (ncol - len(widths)); s = sum(widths); widths = [int(total * w / s) for w in widths]
    x = [f'<w:tbl xmlns:w="{W}"><w:tblPr><w:tblW w:w="{total}" w:type="dxa"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/>'
         '<w:tblCellMar><w:left w:w="70" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="04A0"/></w:tblPr><w:tblGrid>']
    x += [f'<w:gridCol w:w="{w}"/>' for w in widths]
    x.append('</w:tblGrid>')
    hs = [_row_h(r, widths, fs) for r in rows]
    cap = int(BODY_H * 0.85)
    n = len(rows)
    if sum(hs) <= int(BODY_H * 0.15):
        keep = set(range(n - 1))
    else:
        small = lambda k: hs[k] < int(BODY_H * 0.08)
        keep = {0} & set(range(n - 1))              # header stays with the first body row
        if n > 2 and small(1): keep.add(1)
        keep |= {k for k in range(max(1, n - 3), n - 1) if small(k) and small(k + 1)}   # short last rows stay together
    if keep_last: keep.add(n - 1)
    numre = re.compile(r'^[\s−+\-–~0-9.,%()p/·°×\u2060*a-z동개층건]*$')
    align = []
    for c in range(ncol):
        col = [r[c] if c < len(r) else '' for r in rows[1:]]
        numfrac = sum(1 for t in col if numre.match(t.replace(' ', ''))) / max(1, len(col))
        if c == 0 and ncol > 1:
            align.append('center' if all(len(t) <= 6 for t in col) else 'left')
        elif numfrac >= 0.6 or all(len(t) <= 18 for t in col):
            align.append('center')
        else:
            align.append('left')
    for ri, r in enumerate(rows):
        hdr = ri == 0
        kn = '<w:keepNext/>' if ri in keep else ''
        cs = '<w:cantSplit/>' if (hdr or hs[ri] < int(BODY_H * 0.10)) else ''
        x.append('<w:tr><w:trPr>' + cs + ('<w:tblHeader/>' if hdr else '') + '</w:trPr>')
        for c in range(ncol):
            t = r[c] if c < len(r) else ''
            t = re.sub(r'(\d)(%p|%|동|개|°)', '\\1\u2060\\2', t).replace('%\u2060p', '%\u2060p').replace('%p', '%\u2060p')
            t = UNIT_SP.sub('\\1\u00a0', t)
            top = '<w:top w:val="single" w:sz="12" w:color="000000"/>' if hdr else '<w:top w:val="single" w:sz="2" w:color="999999"/>'
            bot = '<w:bottom w:val="single" w:sz="8" w:color="000000"/>' if hdr else ('<w:bottom w:val="single" w:sz="12" w:color="000000"/>' if ri == len(rows) - 1 else '<w:bottom w:val="single" w:sz="2" w:color="999999"/>')
            shade = '<w:shd w:val="clear" w:fill="EDEDED"/>' if hdr else ''
            jc = 'center' if hdr else align[c]
            isnum = bool(numre.match(t.replace(' ', '').replace('\u00a0', '')))
            paras = ''.join(f'<w:p><w:pPr>{kn}<w:spacing w:before="20" w:after="20" w:line="240" w:lineRule="auto"/><w:jc w:val="{jc}"/></w:pPr>{runs(line, fs, hdr, lang="cell") if (isnum and not hdr) else runs(line.replace(chr(0x2060), ""), fs, hdr, body=True, cell=True)}</w:p>' for line in t.split('\\n'))
            x.append(f'<w:tc><w:tcPr><w:tcW w:w="{widths[c]}" w:type="dxa"/><w:tcBorders>{top}<w:left w:val="nil"/>{bot}<w:right w:val="nil"/></w:tcBorders>{shade}<w:vAlign w:val="center"/></w:tcPr>{paras}</w:tc>')
        x.append('</w:tr>')
    x.append('</w:tbl>')
    return etree.fromstring(''.join(x))


# ---------------------------------------------------------------- document
class Doc:
    def __init__(self):
        self.doc = docx.Document()
        st = self.doc.styles['Normal']
        st.font.name = LAT; st.font.size = Pt(10.5)
        rp = st.element.get_or_add_rPr()
        rf = rp.find(q('rFonts'))
        if rf is None: rf = etree.SubElement(rp, q('rFonts'))
        for a in ('ascii', 'hAnsi', 'cs'): rf.set(q(a), LAT)
        rf.set(q('eastAsia'), EA)
        lang = etree.SubElement(rp, q('lang')); lang.set(q('val'), 'en-US'); lang.set(q('eastAsia'), 'ko-KR')
        self.body = self.doc.element.body
        for el in list(self.body):
            if el.tag != q('sectPr'): self.body.remove(el)
        self.final = self.body.find(q('sectPr'))
        self.toc = []; self.figs = []; self.tabs = []
        self._footer_ids = {}

    def add(self, el):
        self.final.addprevious(el); return el

    def addall(self, els):
        for e in els: self.add(e)

    def image(self, path, width_cm):
        p = self.doc.add_paragraph()
        p.paragraph_format.alignment = 1
        p.paragraph_format.keep_with_next = True
        p.paragraph_format.space_before = Pt(6)
        p.add_run().add_picture(path, width=Cm(width_cm))
        el = p._p; self.body.remove(el); self.add(el)

    def footer_rel(self, fmt):
        """footer part with a centred PAGE field (fmt: None = empty footer)"""
        if fmt in self._footer_ids: return self._footer_ids[fmt]
        from docx.opc.constants import RELATIONSHIP_TYPE as RT
        from docx.opc.packuri import PackURI
        from docx.opc.part import Part
        n = len(self._footer_ids) + 1
        if fmt is None:
            body = f'<w:p><w:pPr><w:jc w:val="center"/></w:pPr></w:p>'
        else:
            body = (f'<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r>{rpr(19)}<w:fldChar w:fldCharType="begin"/></w:r>'
                    f'<w:r>{rpr(19)}<w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r>{rpr(19)}<w:fldChar w:fldCharType="separate"/></w:r>'
                    f'<w:r>{rpr(19)}<w:t>1</w:t></w:r><w:r>{rpr(19)}<w:fldChar w:fldCharType="end"/></w:r></w:p>')
        xml = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="{W}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">{body}</w:ftr>'
        part = Part(PackURI(f'/word/footer{n}.xml'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml', xml.encode('utf-8'), self.doc.part.package)
        rid = self.doc.part.relate_to(part, RT.FOOTER)
        self._footer_ids[fmt] = rid
        return rid

    def sect_xml(self, fmt, start=None, final=False):
        rid = self.footer_rel(fmt)
        pg = f'<w:pgNumType w:fmt="{fmt}" w:start="{start}"/>' if fmt else ''
        x = (f'<w:sectPr xmlns:w="{W}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
             f'<w:footerReference w:type="default" r:id="{rid}"/><w:pgSz w:w="{PW}" w:h="{PH}"/>'
             f'<w:pgMar w:top="{MT}" w:right="{MR}" w:bottom="{MB}" w:left="{ML}" w:header="{HDR}" w:footer="{FTR}" w:gutter="0"/>'
             f'{pg}<w:docGrid w:linePitch="{LINE}"/></w:sectPr>')
        return etree.fromstring(x)

    def end_section(self, fmt, start=None):
        p = P('<w:pPr></w:pPr>')
        p.find(q('pPr')).append(self.sect_xml(fmt, start))
        self.add(p)

    def finish(self, fmt, start=None):
        new = self.sect_xml(fmt, start)
        self.final.getparent().replace(self.final, new); self.final = new
        cp = self.doc.core_properties
        cp.author = '조승완'; cp.title = TITLE + ' ' + SUB; cp.subject = '국민대학교 일반대학원 건축학과 박사학위논문'; cp.keywords = '키네틱 파사드, 외피 성능 개선, 업무시설 밀집지역, EnergyPlus'
        cp.last_modified_by = '조승완'
        self.doc.save(OUT)


def parse(B, path, record=True):
    lines = open(path, encoding='utf-8').read().split('\n')
    i = 0
    prev_head = False
    cur_eq = False
    while i < len(lines):
        ln = lines[i].rstrip(); i += 1
        if not ln.strip(): continue
        head = ln.startswith('#')
        prev_eq = cur_eq
        cur_eq = ln.startswith('EQ ')
        if ln.startswith('# '):
            t = ln[2:].strip(); B.add(para_h1(t)); record and B.toc.append((0, t))
        elif ln.startswith('## '):
            t = ln[3:].strip(); B.add(para_h2(t)); record and B.toc.append((1, t))
        elif ln.startswith('### '):
            t = ln[4:].strip(); B.add(para_h3(t)); record and B.toc.append((2, t))
        elif ln.startswith('TC '):
            t = ln[3:].strip(); B.add(para_cap(t, True)); B.tabs.append(t)
        elif ln.startswith('|'):
            rows = []; widths = None
            i -= 1
            while i < len(lines) and lines[i].startswith('|'):
                l2 = lines[i].strip(); i += 1
                if re.match(r'^\|W[\d.,]+\|?$', l2):
                    widths = [float(x) for x in l2.strip('|')[1:].split(',')]; continue
                rows.append([c.strip() for c in l2.strip('|').split('|')])
            nxt = next((l for l in lines[i:] if l.strip()), '')
            B.add(table_xml(rows, widths, keep_last=nxt.startswith('NOTE ')))
        elif ln.startswith('FIG '):
            p_, w_ = [x.strip() for x in ln[4:].split(';')]
            B.image(os.path.join(FIGDIR, p_), float(w_))
        elif ln.startswith('FC '):
            t = ln[3:].strip(); el = para_cap(t); B.figs.append(t)
            nxt = next((l for l in lines[i:] if l.strip()), '')
            if nxt.startswith('NOTE ') and len(nxt) < 200:
                el.find(q('pPr')).insert(0, etree.Element(q('keepNext')))
            B.add(el)
        elif ln.startswith('NOTE '):
            B.add(para_note(ln[5:].strip()))
        elif ln.startswith('EQ '):
            nx = lines[i] if i < len(lines) else ''
            nx_no = bool(re.search(r'\s{2,}\([A-Z]?\d+-\d+[a-z]?\)\s*$', nx)) if nx.startswith('EQ ') else True
            this_no = bool(re.search(r'\s{2,}\([A-Z]?\d+-\d+[a-z]?\)\s*$', ln))
            B.add(para_eq(ln[3:].strip(), cont=prev_eq, keep=nx.startswith('EQ ') and not (not this_no and nx_no), group_end=(not this_no) and nx_no))
        elif ln.startswith('BL '):
            t = ln[3:].strip(); a, b = (t.split('  ', 1) + [''])[:2]
            B.add(para_bl(a, b.strip()))
        else:
            t = ln.strip()
            keep = prev_head and len(t) < 90
            B.add(para_body(t, keep=keep))
        prev_head = head


# ---------------------------------------------------------------- front matter content
TITLE = '서울 업무시설 밀집지역 기존 건물의 외피 성능 개선에 따른 에너지 성능 평가'
SUB = '— 키네틱 파사드 적용 시뮬레이션을 중심으로 —'
TITLE_EN1 = 'Energy Performance Evaluation of Envelope Improvements'
TITLE_EN2 = 'for Existing Buildings in Office-Dense Areas of Seoul'
SUB_EN = '— A Simulation Study of Kinetic Facade Applications —'
TITLE_L1 = '서울 업무시설 밀집지역 기존 건물의'
TITLE_L2 = '외피 성능 개선에 따른 에너지 성능 평가'


def title_block(B, big=34):
    B.add(para_center(TITLE_L1, big, True, 0, 80, line=560))
    B.add(para_center(TITLE_L2, big, True, 0, 200, line=560))
    B.add(para_center(SUB, 24, False, 0, 360))
    B.add(para_center(TITLE_EN1 + ' ' + TITLE_EN2.split(' for ')[0] if False else TITLE_EN1, 22, False, 0, 40))
    B.add(para_center(TITLE_EN2, 22, False, 0, 40))
    B.add(para_center(SUB_EN, 20, False, 0, 0))


def cover(B, inner=False):
    B.add(para_center('박 사 학 위 논 문', 28, True, 400, 1100, spacing=40))
    title_block(B)
    B.addall(blank(6 if not inner else 3))
    if inner:
        B.add(para_center('지도교수   박  미  애', 26, False, 0, 0))
        B.addall(blank(3))
    B.add(para_center('국민대학교 일반대학원', 28, True, 0, 120))
    B.add(para_center('건 축 학 과', 26, False, 0, 120))
    B.add(para_center('조  승  완', 28, True, 0, 500))
    B.add(para_center('          학년도', 24, False, 0, 0) if not inner else para_center('        년    월', 24, False, 0, 0))


def submission(B):
    B.addall(blank(1))
    title_block(B, 30)
    B.addall(blank(3))
    B.add(para_center('지도교수   박  미  애', 26, False, 0, 0))
    B.addall(blank(2))
    B.add(para_center('이 논문을 건축학 박사학위 청구논문으로 제출함', 26, False, 0, 0))
    B.addall(blank(2))
    B.add(para_center('        년    월    일', 26, False, 0, 0))
    B.addall(blank(3))
    B.add(para_center('국민대학교 일반대학원', 28, True, 0, 100))
    B.add(para_center('건 축 학 과', 26, False, 0, 100))
    B.add(para_center('조  승  완', 28, True, 0, 0))


def approval(B):
    B.addall(blank(2))
    B.add(para_center('조승완의 박사학위 청구논문을 인준함', 30, True, 0, 0))
    B.addall(blank(3))
    B.add(para_center('        년    월    일', 26, False, 0, 0))
    B.addall(blank(3))
    rows = [('심사위원장', ''), ('심 사 위 원', ''), ('심 사 위 원', ''), ('심 사 위 원', ''), ('심 사 위 원', '박  미  애')]
    for a, b in rows:
        nm = b if b else '　　　　　　'
        B.add(P(f'<w:pPr><w:tabs><w:tab w:val="left" w:pos="2600"/><w:tab w:val="right" w:pos="{TW - 900}"/></w:tabs>'
                f'<w:spacing w:before="0" w:after="0" w:line="800" w:lineRule="exact"/><w:ind w:left="900"/></w:pPr>'
                f'<w:r>{rpr(30)}<w:t xml:space="preserve">{a}</w:t></w:r><w:r>{rpr(30)}<w:tab/><w:t xml:space="preserve">{nm}</w:t></w:r>'
                f'<w:r>{rpr(30)}<w:tab/><w:t>(인)</w:t></w:r>'))
    B.addall(blank(3))
    B.add(para_center('국 민 대 학 교  일 반 대 학 원', 32, True, 0, 0))


def short(t):
    return re.sub(r'\s*\((?:[^()]|\([^()]*\))*\)\s*$', '', t).strip()


def front_lists(B):
    """차례, 그림 차례, 표 차례 (page numbers from PM)"""
    pg = lambda k: PM.get(k, '0')
    B.add(para_center('차    례', 30, True, 0, 400))
    B.toc_front = []
    items = [(0, '국문요약', 'front:국문요약')]
    for lvl, t in B.toc_all:
        items.append((lvl, t, 'H:' + t))
    for lvl, t, k in items:
        B.add(toc_entry(t, pg(k), lvl, b=(lvl == 0)))
    B.add(page_break())
    B.add(para_center('표 차 례', 30, True, 0, 400))
    for t in B.tabs_all:
        B.add(toc_entry(short(t), pg('T:' + t), 0, hang=True))
    B.add(page_break())
    B.add(para_center('그 림 차 례', 30, True, 0, 400))
    for t in B.figs_all:
        B.add(toc_entry(short(t), pg('F:' + t), 0, hang=True))


def abstract_ko(B, F):
    B.add(P('<w:pPr><w:pageBreakBefore/><w:spacing w:before="0" w:after="360"/><w:jc w:val="center"/></w:pPr>' + runs('국 문 요 약', 30, True)))
    B.add(para_center(TITLE_L1, 22, True, 0, 0))
    B.add(para_center(TITLE_L2, 22, True, 0, 40))
    B.add(para_center(SUB, 20, False, 0, 200))
    B.add(para_right('국민대학교 일반대학원 건축학과', 20))
    B.add(para_right('조  승  완', 20, after=300))
    for t in F['ABSKO']:
        B.add(P(ppr('both', 0, 0, line=560, ind=f'<w:ind w:firstLine="{BODY_SZ * 10}"/>') + runs(t)))
    B.addall(blank(1))
    for t in F['KWKO']:
        B.add(P(ppr('left', 0, 0, line=480, ind='<w:ind w:left="1200" w:hanging="1200"/>') + runs(t)))


def abstract_en(B, F):
    B.add(P('<w:pPr><w:pageBreakBefore/><w:spacing w:before="0" w:after="360"/><w:jc w:val="center"/><w:outlineLvl w:val="0"/></w:pPr>' + runs('Abstract', 30, True)))
    B.add(para_center(TITLE_EN1, 22, True, 0, 0))
    B.add(para_center(TITLE_EN2, 22, True, 0, 0))
    B.add(para_center(SUB_EN, 20, False, 0, 200))
    for t in ['Cho, Seungwan', 'Department of Architecture', 'Graduate School, Kookmin University']:
        B.add(para_right(t, 20))
    B.addall(blank(2))
    for t in F['ABSEN']:
        B.add(P(ppr('both', 0, 0, line=480, ind='<w:ind w:firstLine="360"/>') + runs(t, 21)))
    B.addall(blank(1))
    for t in F['KWEN']:
        B.add(P(ppr('left', 0, 0, line=480, ind='<w:ind w:left="1100" w:hanging="1100"/>') + runs(t)))


def refs(B):
    B.add(para_h1('참 고 문 헌'))
    for ln in open(os.path.join(H, 'refs.txt'), encoding='utf-8').read().split('\n'):
        if not ln.strip(): continue
        if ln.strip() in ('국내 문헌', '국외 문헌'):
            B.add(P('<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="160"/></w:pPr>' + runs(ln.strip(), 22, True)))
        else:
            B.add(para_ref(ln.strip()))


def ack(B, F):
    B.add(P('<w:pPr><w:pageBreakBefore/><w:spacing w:before="0" w:after="480"/><w:jc w:val="center"/></w:pPr>' + runs('감사의 글', 30, True)))
    for t in F['ACK']:
        B.add(P(ppr('both', 0, 120, ind=f'<w:ind w:firstLine="{BODY_SZ * 10}"/>') + runs(t)))
    B.addall(blank(2))
    B.add(para_right('조 승 완', 22))


def load_front():
    F = {}; cur = None
    for ln in open(os.path.join(H, 'front.txt'), encoding='utf-8').read().split('\n'):
        if ln.startswith('@'): cur = ln[1:].strip(); F[cur] = []; continue
        if ln.strip() and cur: F[cur].append(ln.strip())
    return F


def main():
    F = load_front()
    # pass 0: collect toc/fig/table lists from the markup (no output)
    tmp = Doc()
    for f in ['c1_intro.txt', 'c2_theory.txt', 'c3_lit.txt', 'c4_method.txt', 'c5_results.txt', 'c6_detail.txt', 'c7_r4.txt', 'c8_disc.txt', 'c9_concl.txt']:
        parse(tmp, os.path.join(H, f))
    tmp.toc.append((0, '참 고 문 헌'))
    tmp.toc.append((0, 'Abstract'))
    parse(tmp, os.path.join(H, 'appx_A_r4.txt'))
    parse(tmp, os.path.join(H, 'appx_B.txt'))
    tmp.toc.append((0, '감사의 글'))
    B = Doc()
    B.toc_all, B.figs_all, B.tabs_all = tmp.toc, tmp.figs, tmp.tabs
    # section 1: covers (no page numbers)
    cover(B); B.add(page_break())
    cover(B, inner=True); B.add(page_break())
    submission(B); B.add(page_break())
    approval(B)
    B.end_section(None)
    # section 2: lists + Korean abstract (roman)
    front_lists(B)
    abstract_ko(B, load_front())
    B.end_section('lowerRoman', 1)
    # section 3: body (arabic)
    for f in ['c1_intro.txt', 'c2_theory.txt', 'c3_lit.txt', 'c4_method.txt', 'c5_results.txt', 'c6_detail.txt', 'c7_r4.txt', 'c8_disc.txt', 'c9_concl.txt']:
        parse(B, os.path.join(H, f))
    refs(B)
    abstract_en(B, F)
    parse(B, os.path.join(H, 'appx_A_r4.txt'))
    parse(B, os.path.join(H, 'appx_B.txt'))
    ack(B, F)
    B.finish('decimal', 1)
    meta = {'toc': B.toc_all, 'figs': B.figs_all, 'tabs': B.tabs_all}
    json.dump(meta, open(OUT + '.meta.json', 'w'), ensure_ascii=False)
    print('ok', OUT, len(B.toc_all), 'toc', len(B.figs_all), 'figs', len(B.tabs_all), 'tables')


main()
