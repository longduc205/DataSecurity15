// Renders the report figures. Evidence figures are drawn from evidence/*.txt, never typed by hand.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'figures');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function shot(name, html, w, h) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fig-'));
  const file = path.join(dir, 'f.html');
  fs.writeFileSync(file, `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff">${html}`);
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2',
    `--user-data-dir=${path.join(dir, 'p')}`, `--window-size=${w},${h}`, `--screenshot=${path.join(OUT, name)}`, `file:///${file.replace(/\\/g, '/')}`],
    { stdio: 'ignore', timeout: 60000 });
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
}

// --- evidence figures: one terminal-style block, hard wrapped so the height is known exactly
const COLS = 92;
function wrap(lines) {
  const out = [];
  for (const line of lines) {
    let rest = line;
    while (rest.length > COLS) { out.push(rest.slice(0, COLS)); rest = '    ' + rest.slice(COLS); }
    out.push(rest);
  }
  return out;
}
function terminal(name, lines) {
  const wrapped = wrap(lines);
  const body = wrapped.map((l) => {
    const c = /\[PASS\]|^FOUND/.test(l) ? '#15803d' : /\[FAIL\]|^MISSING/.test(l) ? '#b91c1c' : '#111827';
    const weight = /^\[(PASS|FAIL)\]/.test(l) ? 700 : 400;
    return `<div style="color:${c};font-weight:${weight};white-space:pre">${esc(l) || ' '}</div>`;
  }).join('');
  const lh = 20;
  const html = `<div style="box-sizing:border-box;width:800px;padding:12px 14px;background:#f8fafc;border:1px solid #94a3b8;font:15px/${lh}px Consolas,monospace">${body}</div>`;
  shot(name, html, 800, wrapped.length * lh + 26);
}
const ev = (f) => fs.readFileSync(path.join(ROOT, 'evidence', f), 'utf8').trimEnd().split('\n');
// Picks whole test blocks by id out of an evidence file.
function blocks(f, ids) {
  const lines = ev(f);
  const out = [];
  let keep = false;
  for (const l of lines) {
    const m = l.match(/^\[(PASS|FAIL)\] (T[\d.]+)/);
    if (m) keep = ids.includes(m[2]);
    if (keep) out.push(l);
  }
  if (!out.length) throw new Error(`No blocks for ${ids} in ${f}`);
  return out;
}

terminal('ev_transport.png', blocks('01_transport_network.txt', ['T1.1', 'T1.2', 'T1.3', 'T1.4']));
terminal('ev_data_api.png', blocks('02_data_api.txt', ['T2.1', 'T2.2']));
terminal('ev_rbac.png', blocks('03_rbac.txt', ['T3.1', 'T3.2', 'T3.3', 'T3.4']));
terminal('ev_rls.png', blocks('04_rls.txt', ['T4.1', 'T4.2', 'T4.3', 'T4.4']));
terminal('ev_masking.png', blocks('05_masking.txt', ['T5.1', 'T5.2', 'T5.3']));
terminal('ev_encryption.png', blocks('06_encryption.txt', ['T6.1', 'T6.2', 'T6.3', 'T6.4']));
{
  const log = ev('08_audit_log.txt');
  const entry = log.indexOf('Entries');
  terminal('ev_audit.png', [...log.slice(0, entry - 1), '', ...log.slice(entry, entry + 7)]);
}

// --- diagrams
const L = {
  en: {
    layers: ['Network: SSL enforcement, IP allowlist', 'Interface: Data API exposure, private schema', 'Identity and authorisation: roles, least privilege', 'Row and column: RLS, masking views', 'Data: client-side AES-256-GCM, encryption at rest', 'Monitoring: pgAudit, Postgres error log'],
    side: 'Each layer limits the damage when the one above fails',
    client: ['Client on the', 'user machine'], clientSub: ['Node.js, pg driver', 'ENC_KEY, HMAC_KEY'], keys: 'Keys stay on this machine',
    cloud: 'Supabase cloud (ap-southeast-2)', pooler: 'Shared pooler', poolerSub: ['TLS required', 'IP allowlist'], db: 'PostgreSQL 17', schema: 'schema clinic', dbLines: ['roles + RLS', 'patients_masked view', 'encrypted columns', 'pgAudit'], rest: 'Data API (REST)', restSub: 'clinic is not exposed', logs: 'Log store', logsSub: '1 day on Free plan', export: 'Exported to evidence/', tls: 'TLS 1.3', blocked: 'anon key: blocked',
    flowTitle: ['1. Client encrypts', '2. Database stores', '3. Client decrypts'], flow1: ['AES-256-GCM per field', 'AAD = patient:id:column', 'HMAC of national ID'], flow2: ['Ciphertext + blind index', 'DBA sees ciphertext only', 'Lookup: index equality'], flow3: ['Fetch by blind index', 'Check GCM tag and AAD', 'Change is rejected'],
  },
  vi: {
    layers: ['Mạng: bắt buộc SSL, danh sách IP', 'Giao diện: Data API, schema riêng', 'Định danh và phân quyền: role, đặc quyền tối thiểu', 'Dòng và cột: RLS, view che dữ liệu', 'Dữ liệu: AES-256-GCM phía client, mã hóa khi lưu trữ', 'Giám sát: pgAudit, log lỗi Postgres'],
    side: 'Mỗi lớp hạn chế thiệt hại khi lớp phía trên thất bại',
    client: ['Client trên', 'máy người dùng'], clientSub: ['Node.js, driver pg', 'ENC_KEY, HMAC_KEY'], keys: 'Khóa không rời khỏi máy này',
    cloud: 'Supabase cloud (ap-southeast-2)', pooler: 'Shared pooler', poolerSub: ['Bắt buộc TLS', 'Danh sách IP'], db: 'PostgreSQL 17', schema: 'schema clinic', dbLines: ['role + RLS', 'view patients_masked', 'cột được mã hóa', 'pgAudit'], rest: 'Data API (REST)', restSub: 'không mở schema clinic', logs: 'Kho log', logsSub: '1 ngày trên gói Free', export: 'Xuất vào evidence/', tls: 'TLS 1.3', blocked: 'anon key: bị chặn',
    flowTitle: ['1. Client mã hóa', '2. Database lưu trữ', '3. Client giải mã'], flow1: ['AES-256-GCM theo từng trường', 'AAD = patient:id:column', 'HMAC của số CCCD'], flow2: ['Bản mã + blind index', 'DBA chỉ thấy bản mã', 'Tra cứu: so khớp index'], flow3: ['Lấy theo blind index', 'Kiểm tra thẻ GCM và AAD', 'Bị sửa thì từ chối'],
  },
};

const FONT = `font-family="Times New Roman" fill="#111827"`;
const text = (x, y, s, o = {}) => `<text x="${x}" y="${y}" ${FONT} font-size="${o.size || 18}" text-anchor="${o.anchor || 'middle'}" font-weight="${o.bold ? 700 : 400}" ${o.fill ? `style="fill:${o.fill}"` : ''}>${esc(s)}</text>`;
const box = (x, y, w, h, fill = '#f1f5f9', stroke = '#334155', dash = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1.5" ${dash && `stroke-dasharray="${dash}"`}/>`;
const arrow = (x1, y1, x2, y2, color = '#334155') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2" marker-end="url(#a${color.slice(1)})"/>`;
const defs = ['#334155', '#b91c1c'].map((c) => `<marker id="a${c.slice(1)}" markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="${c}"/></marker>`).join('');
const svg = (w, h, inner) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block"><defs>${defs}</defs>${inner}</svg>`;

for (const lang of ['en', 'vi']) {
  const t = L[lang];

  // Defence in depth
  const shades = ['#e2e8f0', '#e6edf5', '#ebf1f8', '#f0f5fa', '#f5f8fc', '#fafbfd'];
  let s = t.layers.map((l, i) => box(8 + i * 8, 10 + i * 58, 824 - i * 16, 50, shades[i]) + text(420, 42 + i * 58, l, { size: 22 })).join('');
  s += text(420, 374, t.side, { size: 20 });
  shot(`layers_${lang}.png`, svg(840, 388, s), 840, 388);

  // Architecture
  s = box(6, 96, 246, 214, '#eef6ff') + text(129, 128, t.client[0], { bold: true, size: 21 }) + text(129, 154, t.client[1], { bold: true, size: 21 });
  t.clientSub.forEach((l, i) => { s += text(129, 190 + i * 30, l, { size: 19 }); });
  s += text(129, 286, t.keys, { size: 17 });
  s += box(318, 8, 536, 402, '#ffffff', '#334155', '7 5') + text(586, 36, t.cloud, { bold: true, size: 20 });
  s += box(332, 106, 166, 136) + text(415, 140, t.pooler, { bold: true, size: 20 });
  t.poolerSub.forEach((l, i) => { s += text(415, 176 + i * 30, l, { size: 19 }); });
  s += box(566, 50, 276, 236, '#eef6ff') + text(704, 82, t.db, { bold: true, size: 20 }) + text(704, 110, t.schema, { size: 18 });
  t.dbLines.forEach((l, i) => { s += text(704, 148 + i * 32, l, { size: 19 }); });
  s += box(332, 312, 216, 86) + text(440, 346, t.rest, { bold: true, size: 20 }) + text(440, 376, t.restSub, { size: 17 });
  s += box(596, 312, 246, 86) + text(719, 346, t.logs, { bold: true, size: 20 }) + text(719, 376, t.logsSub, { size: 17 });
  s += arrow(252, 174, 330, 174) + text(286, 162, t.tls, { size: 16 });
  s += arrow(498, 174, 564, 174);
  s += arrow(719, 286, 719, 310);
  s += arrow(200, 310, 330, 356, '#b91c1c') + text(130, 348, t.blocked, { size: 18, fill: '#b91c1c' });
  s += arrow(719, 398, 719, 440) + text(600, 434, t.export, { size: 18 });
  shot(`arch_${lang}.png`, svg(860, 450, s), 860, 450);

  // Client-side encryption flow
  const cols = [6, 288, 570];
  const fills = ['#eef6ff', '#f1f5f9', '#eef6ff'];
  s = '';
  cols.forEach((x, i) => {
    s += box(x, 10, 264, 190, fills[i]) + text(x + 132, 46, t.flowTitle[i], { bold: true, size: 21 });
    [t.flow1, t.flow2, t.flow3][i].forEach((l, j) => { s += text(x + 132, 90 + j * 36, l, { size: 18 }); });
  });
  s += arrow(270, 105, 286, 105) + arrow(552, 105, 568, 105);
  shot(`flow_${lang}.png`, svg(840, 210, s), 840, 210);
}
console.log('Figures written to report/figures');
