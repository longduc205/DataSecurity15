// Turns on SSL enforcement and reports what the Free plan allows for network restrictions.
const { api, saveEvidence } = require('./lib');

(async () => {
  const log = [];
  const put = await api('PUT', '/ssl-enforcement', { requestedConfig: { database: true } });
  log.push(`PUT /ssl-enforcement -> HTTP ${put.status} ${JSON.stringify(put.data)}`);

  const nr = await api('GET', '/network-restrictions');
  log.push(`GET /network-restrictions -> HTTP ${nr.status} ${JSON.stringify(nr.data)}`);

  const project = await api('GET', '');
  log.push(`Project region: ${project.data.region}, Postgres: ${project.data.database?.version}`);

  saveEvidence('01_cloud_config.txt', log.join('\n'));
  console.log(log.join('\n'));
  console.log('Database restarts after SSL changes: wait about a minute before the next step.');
})().catch((e) => { console.error(e.message); process.exit(1); });
