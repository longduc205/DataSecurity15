// Builds report/<name>.docx from Template.docx and a content file. Usage: node build-report.js en|vi
const fs = require('node:fs');
const path = require('node:path');
const JSZip = require('jszip');

const ROOT = path.join(__dirname, '..');
const lang = process.argv[2];
const OUTPUT = { en: 'Report_EN.docx', vi: 'BaoCao_VI.docx' }[lang];
if (!OUTPUT) throw new Error('Usage: build-report.js en|vi');

// --- facts read from evidence, passed to the content so text cannot drift from results
const benchLines = fs.readFileSync(path.join(ROOT, 'evidence/09_benchmark.txt'), 'utf8').split('\n');
const bench = {};
for (const l of benchLines) {
  const m = l.match(/^(.+?) \| ([\d.]+) \| ([\d.]+)$/);
  if (m) bench[m[1]] = { median: Number(m[2]), p95: Number(m[3]), m: m[2], p: m[3] };
}
const overhead = (op) => ((bench[`${op} (encrypted)`].median - bench[`${op} (plain)`].median) / bench[`${op} (plain)`].median * 100);
const summary = fs.readFileSync(path.join(ROOT, 'evidence/00_summary.txt'), 'utf8');
const audit = fs.readFileSync(path.join(ROOT, 'evidence/08_audit_log.txt'), 'utf8').split('\n')[0].match(/(\d+) pgaudit entries, (\d+) permission-denied/);
const facts = {
  bench,
  over: { lookup: overhead('Lookup by national ID'), read: overhead('Read 200 rows'), insert: overhead('Insert 1 row') },
  passed: summary.match(/(\d+)\/(\d+) passed/)[1],
  total: summary.match(/(\d+)\/(\d+) passed/)[2],
  auditEntries: audit[1],
  deniedEntries: audit[2],
  crypto: bench['AES-256-GCM encrypt+decrypt, local only, 10000 runs'],
};
if (facts.passed !== facts.total) throw new Error('Evidence contains failed tests: review before writing the report');

// Pulls a statement from the real SQL file so listings match what was executed.
function sql(file, start) {
  const text = fs.readFileSync(path.join(ROOT, 'sql', file), 'utf8');
  const i = text.indexOf(start);
  if (i < 0) throw new Error(`SQL not found: ${start}`);
  return text.slice(i, text.indexOf(';', i) + 1);
}

const content = require(`./content-${lang}.js`)({ ...facts, sql });
const refs = require('./references.js')(lang);

// --- numbering of figures, tables and references, resolved from the order of appearance
const FIG = lang === 'vi' ? 'Hình' : 'Figure';
const TAB = lang === 'vi' ? 'Bảng' : 'Table';
const numbers = {};
let nf = 0;
let nt = 0;
for (const b of content.blocks) {
  if (b.type === 'fig') numbers[`fig:${b.key}`] = `${FIG} ${++nf}`;
  if (b.type === 'tbl') numbers[`tbl:${b.key}`] = `${TAB} ${++nt}`;
}
const refOrder = [];
const citeNumber = (k) => {
  if (!refs[k]) throw new Error(`Unknown reference ${k}`);
  if (!refOrder.includes(k)) refOrder.push(k);
  return refOrder.indexOf(k) + 1;
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const FONT = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>';
const MONO = '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>';

const run = (t, rpr = '') => (t ? `<w:r>${rpr && `<w:rPr>${rpr}</w:rPr>`}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>` : '');

// Inline markup: {fig:x} {tbl:x} {ref:x} `code` **bold** [[to be filled in]]
function inline(text, size = '') {
  const sz = size && `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>`;
  const resolved = text
    .replace(/\{((?:fig|tbl):\w+)\}/g, (_, k) => { if (!numbers[k]) throw new Error(`Unknown ${k}`); return numbers[k]; })
    .replace(/\{ref:([\w,]+)\}/g, (_, k) => k.split(',').map((x) => `[${citeNumber(x)}]`).join(', '));
  return resolved.split(/(`[^`]+`|\*\*[^*]+\*\*|\[\[[^\]]+\]\])/).map((part) => {
    if (part.startsWith('[[')) return run(part.slice(2, -2), `<w:highlight w:val="yellow"/>${sz}`); // yellow: the team must fill this in
    if (part.startsWith('`')) return run(part.slice(1, -1), `${MONO}<w:sz w:val="${size ? size - 2 : 24}"/><w:szCs w:val="${size ? size - 2 : 24}"/>`);
    if (part.startsWith('**')) return run(part.slice(2, -2), `<w:b/>${sz}`);
    return run(part, sz);
  }).join('');
}

const fldChar = (t) => `<w:r><w:fldChar w:fldCharType="${t}"/></w:r>`;
const field = (instr, shown = ' ') => `${fldChar('begin')}<w:r><w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r>${fldChar('separate')}${run(shown)}${fldChar('end')}`;

let bookmark = 100;
function h1(t) {
  const id = bookmark++;
  return `<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:pageBreakBefore/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="0"/></w:numPr><w:spacing w:before="0" w:after="240" w:line="312" w:lineRule="auto"/><w:ind w:left="0" w:firstLine="0"/><w:jc w:val="center"/></w:pPr><w:bookmarkStart w:id="${id}" w:name="_H${id}"/>${run(t)}<w:bookmarkEnd w:id="${id}"/></w:p>`;
}
const h2 = (t) => `<w:p><w:pPr><w:pStyle w:val="Heading2"/><w:keepNext/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="0"/></w:numPr><w:ind w:left="0" w:firstLine="0"/><w:jc w:val="left"/></w:pPr>${run(t)}</w:p>`;
const h3 = (t) => `<w:p><w:pPr><w:pStyle w:val="Heading3"/><w:keepNext/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="0"/></w:numPr><w:spacing w:before="120" w:after="120"/><w:ind w:left="0" w:firstLine="0"/></w:pPr>${run(t, `${FONT}<w:i/>`)}</w:p>`;
const para = (t) => `<w:p>${inline(t)}</w:p>`;
const bullets = (items) => items.map((t) => `<w:p><w:pPr><w:spacing w:before="60" w:after="60"/><w:ind w:left="567" w:hanging="283"/></w:pPr>${run('–  ')}${inline(t)}</w:p>`).join('');

function caption(label, n, text, keepNext) {
  return `<w:p><w:pPr><w:pStyle w:val="Caption"/>${keepNext ? '<w:keepNext/>' : ''}<w:spacing w:before="120" w:after="120" w:line="264" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>${run(`${label} `)}${field(`SEQ ${label} \\* ARABIC`, String(n))}${run(`. ${text}`)}</w:p>`;
}

function table(b, n) {
  const total = b.widths.reduce((a, c) => a + c, 0);
  const grid = b.widths.map((w) => `<w:gridCol w:w="${Math.round(w * 9072 / total)}"/>`).join('');
  const rows = b.rows.map((row, r) => {
    const cells = row.map((c, i) => {
      const w = Math.round(b.widths[i] * 9072 / total);
      const shade = r === 0 ? '<w:shd w:val="clear" w:color="auto" w:fill="E2E8F0"/>' : '';
      const body = r === 0 ? `**${c}**` : c;
      return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${shade}</w:tcPr><w:p><w:pPr><w:spacing w:before="30" w:after="30" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="left"/></w:pPr>${inline(body, 24)}</w:p></w:tc>`;
    }).join('');
    return `<w:tr><w:trPr><w:cantSplit/>${r === 0 ? '<w:tblHeader/>' : ''}</w:trPr>${cells}</w:tr>`;
  }).join('');
  const tblXml = `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="9072" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="70" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rows}</w:tbl>`;
  return (b.caption ? caption(TAB, n, b.caption, true) : '') + tblXml + '<w:p><w:pPr><w:spacing w:before="0" w:after="60" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/></w:pPr></w:p>';
}

function pngSize(buf) { return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }; }
const media = [];
function figure(b, n) {
  const file = path.join(__dirname, 'figures', b.file);
  const buf = fs.readFileSync(file);
  const { w, h } = pngSize(buf);
  const rid = `rIdImg${media.length + 1}`;
  media.push({ rid, name: `image${media.length + 1}.png`, buf });
  const cx = Math.round((b.width || 16) * 360000);
  const cy = Math.round(cx * h / w);
  const docPr = 500 + media.length;
  const alt = esc(b.caption).replace(/"/g, '&quot;');
  const drawing = `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${docPr}" name="Figure ${n}" descr="${alt}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${docPr}" name="${b.file}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
  return `<w:p><w:pPr><w:keepNext/><w:spacing w:before="120" w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr><w:r>${drawing}</w:r></w:p>${caption(FIG, n, b.caption, false)}`;
}

function codeBlock(text) {
  const lines = text.split('\n');
  return lines.map((l, i) => `<w:p><w:pPr><w:keepLines/>${i < lines.length - 1 ? '<w:keepNext/>' : ''}<w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/><w:spacing w:before="${i ? 0 : 60}" w:after="${i === lines.length - 1 ? 120 : 0}" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="left"/></w:pPr>${run(l || ' ', `${MONO}<w:sz w:val="21"/><w:szCs w:val="21"/>`)}</w:p>`).join('');
}

// Native Word equation (OMML), as the template requires.
function equation(label) {
  const m = (t) => `<m:r><m:t xml:space="preserve">${esc(t)}</m:t></m:r>`;
  const sub = (b, s) => `<m:sSub><m:e>${m(b)}</m:e><m:sub>${m(s)}</m:sub></m:sSub>`;
  return `<w:p><w:pPr><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr><m:oMathPara><m:oMath>${m(`${label} = `)}<m:f><m:num>${sub('t', 'enc')}${m(' − ')}${sub('t', 'plain')}</m:num><m:den>${sub('t', 'plain')}</m:den></m:f>${m(' × 100%')}</m:oMath></m:oMathPara></w:p>`;
}

function tocPlaceholder(instr) {
  return `<w:p><w:pPr><w:ind w:firstLine="0"/></w:pPr>${fldChar('begin')}<w:r><w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r>${fldChar('separate')}${run(' ')}${fldChar('end')}</w:p>`;
}

const parts = [];
let ni = 0;
let ti = 0;
const contentsTitle = `<w:p><w:pPr><w:spacing w:before="0" w:after="120" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr>${run(content.labels.contents, '<w:b/>')}</w:p>`;
parts.push(contentsTitle, tocPlaceholder('TOC \\o "1-2" \\h \\z \\u'));
parts.push(h1(content.labels.abbreviations), table({ widths: [24, 76], rows: content.abbreviations }, 0));
parts.push(h1(content.labels.tables), tocPlaceholder(`TOC \\h \\z \\c "${TAB}"`));
parts.push(h1(content.labels.figures), tocPlaceholder(`TOC \\h \\z \\c "${FIG}"`));

for (const b of content.blocks) {
  if (b.type === 'h1') parts.push(h1(b.text));
  else if (b.type === 'h2') parts.push(h2(b.text));
  else if (b.type === 'h3') parts.push(h3(b.text));
  else if (b.type === 'p') parts.push(para(b.text));
  else if (b.type === 'ul') parts.push(bullets(b.items));
  else if (b.type === 'code') parts.push(codeBlock(b.text));
  else if (b.type === 'eq') parts.push(equation(b.label));
  else if (b.type === 'tbl') parts.push(table(b, ++ti));
  else if (b.type === 'fig') parts.push(figure(b, ++ni));
  else throw new Error(`Unknown block ${b.type}`);
}

parts.push(h1(content.labels.references));
refOrder.forEach((k, i) => {
  parts.push(`<w:p><w:pPr><w:spacing w:before="40" w:after="40" w:line="264" w:lineRule="auto"/><w:ind w:left="567" w:hanging="567" w:firstLine="0"/><w:jc w:val="left"/></w:pPr>${run(`[${i + 1}]  ${refs[k]}`)}</w:p>`);
});
const unused = Object.keys(refs).filter((k) => !refOrder.includes(k));
if (unused.length) throw new Error(`References never cited: ${unused}`);

(async () => {
  const zip = await JSZip.loadAsync(fs.readFileSync(path.join(ROOT, 'Template.docx')));

  let doc = await zip.file('word/document.xml').async('string');
  const bodyStart = doc.indexOf('<w:body>') + '<w:body>'.length;
  let head = doc.slice(0, bodyStart);
  for (const [prefix, uri] of [['m', 'http://schemas.openxmlformats.org/officeDocument/2006/math'], ['wp', 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'], ['r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships']]) {
    if (!head.includes(`xmlns:${prefix}=`)) head = head.replace('<w:document ', `<w:document xmlns:${prefix}="${uri}" `);
  }
  // Footer references come from the template's first section; page size and margins stay as supplied.
  const sect = '<w:sectPr><w:footerReference w:type="default" r:id="rId8"/><w:footerReference w:type="first" r:id="rId9"/><w:pgSz w:w="11907" w:h="16840" w:code="9"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1701" w:header="720" w:footer="720" w:gutter="0"/><w:cols w:space="720"/><w:titlePg/><w:docGrid w:linePitch="381"/></w:sectPr>';
  zip.file('word/document.xml', `${head}${parts.join('')}${sect}</w:body></w:document>`);

  // The template's written rules (1.3 line spacing, 1 cm indent) override its Normal style values.
  let styles = await zip.file('word/styles.xml').async('string');
  const normal = '<w:spacing w:before="120" w:after="120" w:line="360" w:lineRule="auto"/><w:ind w:firstLine="504"/>';
  if (!styles.includes(normal)) throw new Error('Template Normal style changed');
  styles = styles.replace(normal, '<w:spacing w:before="120" w:after="120" w:line="312" w:lineRule="auto"/><w:ind w:firstLine="567"/>');
  // Contents stays on one page; these list styles are not body text.
  const tocSpacing = '<w:spacing w:before="0" w:after="0"/>';
  if (styles.split(tocSpacing).length < 3) throw new Error('Template TOC styles changed');
  styles = styles.split(tocSpacing).join('<w:spacing w:before="0" w:after="0" w:line="264" w:lineRule="auto"/>');
  if (lang === 'vi') styles = styles.replace('<w:lang w:val="en-US" w:eastAsia="en-US"/></w:rPr></w:style>', '<w:lang w:val="vi-VN" w:eastAsia="en-US"/></w:rPr></w:style>');
  zip.file('word/styles.xml', styles);

  let rels = await zip.file('word/_rels/document.xml.rels').async('string');
  const relXml = media.map((m) => `<Relationship Id="${m.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.name}"/>`).join('');
  zip.file('word/_rels/document.xml.rels', rels.replace('</Relationships>', `${relXml}</Relationships>`));
  media.forEach((m) => zip.file(`word/media/${m.name}`, m.buf));

  let types = await zip.file('[Content_Types].xml').async('string');
  if (!/Extension="png"/.test(types)) types = types.replace('<Default ', '<Default Extension="png" ContentType="image/png"/><Default ');
  zip.file('[Content_Types].xml', types);

  // Drop the template author's personal details from the file properties.
  let core = await zip.file('docProps/core.xml').async('string');
  core = core.replace(/<dc:title>.*?<\/dc:title>/, `<dc:title>${esc(content.title)}</dc:title>`)
    .replace(/<dc:creator>.*?<\/dc:creator>/, '<dc:creator></dc:creator>')
    .replace(/<cp:lastModifiedBy>.*?<\/cp:lastModifiedBy>/, '<cp:lastModifiedBy></cp:lastModifiedBy>');
  zip.file('docProps/core.xml', core);

  const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(path.join(__dirname, OUTPUT), out);
  console.log(`${OUTPUT}: ${ni} figures, ${ti} tables, ${refOrder.length} references`);
})().catch((e) => { console.error(e); process.exit(1); });
