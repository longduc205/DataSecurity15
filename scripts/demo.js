// Live demo, one step at a time: npm run demo -- <step>   (steps: tls api rbac rls mask enc audit, or all)
// Writes nothing to evidence/, so the report's evidence stays as recorded.
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const t = require('./run-tests');

const STEPS = {
  tls: ['1. Đường truyền: bắt buộc TLS', t.testTransport],
  api: ['2. Data API: anon key bị chặn, bảng không RLS bị lộ', t.testDataApi],
  rbac: ['3. RBAC: đặc quyền tối thiểu', t.testRbac],
  rls: ['4. RLS: mỗi bác sĩ chỉ thấy bệnh nhân của mình', t.testRls],
  mask: ['5. Che dữ liệu cho lễ tân', t.testMasking],
  enc: ['6. Mã hóa phía client: DBA chỉ thấy bản mã', t.testEncryption],
  audit: ['7. Audit: truy vết mọi hành vi vừa thử', () => {
    execFileSync(process.execPath, [path.join(__dirname, 'export-logs.js'), '--no-save'], { stdio: 'inherit' });
  }],
};

(async () => {
  const arg = process.argv[2];
  const names = arg === 'all' ? Object.keys(STEPS) : [arg];
  if (!names.every((n) => STEPS[n])) {
    console.log(`Cách dùng: npm run demo -- <${Object.keys(STEPS).join('|')}|all>`);
    process.exit(1);
  }
  for (const n of names) {
    console.log(`\n=== ${STEPS[n][0]} ===`);
    await STEPS[n][1]();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
