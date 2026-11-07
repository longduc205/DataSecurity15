// URLs and the claims cited from them were checked on 7 November 2026.
module.exports = (lang) => {
  const on = lang === 'vi' ? 'truy cập ngày 07/11/2026' : 'accessed 7 November 2026';
  const web = (org, title, url) => `${org}, "${title}", ${url}, ${on}.`;
  return {
    nist145: 'P. Mell and T. Grance, "The NIST Definition of Cloud Computing", NIST SP 800-145, NIST, 2011.',
    nist144: 'W. Jansen and T. Grance, "Guidelines on Security and Privacy in Public Cloud Computing", NIST SP 800-144, NIST, 2011.',
    nist57: 'E. Barker, "Recommendation for Key Management: Part 1 – General", NIST SP 800-57 Part 1 Rev. 5, NIST, 2020.',
    gcm: 'M. Dworkin, "Recommendation for Block Cipher Modes of Operation: Galois/Counter Mode (GCM) and GMAC", NIST SP 800-38D, NIST, 2007.',
    aes: 'NIST, "Advanced Encryption Standard (AES)", FIPS 197, 2001, updated 2023.',
    hmac: 'NIST, "The Keyed-Hash Message Authentication Code (HMAC)", FIPS 198-1, 2008.',
    owaspAc: web('OWASP', 'A01:2021 – Broken Access Control', 'https://top10.owasp.org/2021/A01_2021-Broken_Access_Control/'),
    owaspCrypto: web('OWASP', 'A02:2021 – Cryptographic Failures', 'https://top10.owasp.org/2021/A02_2021-Cryptographic_Failures/'),
    awsShared: web('Amazon Web Services', 'Shared Responsibility Model', 'https://aws.amazon.com/compliance/shared-responsibility-model/'),
    msShared: web('Microsoft', 'Shared responsibility in the cloud', 'https://learn.microsoft.com/en-us/azure/security/fundamentals/shared-responsibility'),
    pgRls: web('PostgreSQL Global Development Group', 'Row Security Policies', 'https://www.postgresql.org/docs/current/ddl-rowsecurity.html'),
    pgPriv: web('PostgreSQL Global Development Group', 'Privileges', 'https://www.postgresql.org/docs/current/ddl-priv.html'),
    pgaudit: web('pgAudit project', 'PostgreSQL Audit Extension', 'https://www.pgaudit.org/'),
    msTde: web('Microsoft', 'Transparent data encryption – Azure SQL Database and Azure SQL Managed Instance', 'https://learn.microsoft.com/en-us/azure/azure-sql/database/transparent-data-encryption-tde-overview'),
    msAe: web('Microsoft', 'Always Encrypted', 'https://learn.microsoft.com/en-us/sql/relational-databases/security/encryption/always-encrypted-database-engine'),
    msDdm: web('Microsoft', 'Dynamic data masking', 'https://learn.microsoft.com/en-us/sql/relational-databases/security/dynamic-data-masking'),
    msRls: web('Microsoft', 'Row-level security', 'https://learn.microsoft.com/en-us/sql/relational-databases/security/row-level-security'),
    msAudit: web('Microsoft', 'Auditing for Azure SQL Database and Azure Synapse Analytics', 'https://learn.microsoft.com/en-us/azure/azure-sql/database/auditing-overview'),
    awsEnc: web('Amazon Web Services', 'Encrypting Amazon RDS resources', 'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Overview.Encryption.html'),
    awsSsl: web('Amazon Web Services', 'Securing connections to RDS for PostgreSQL with SSL/TLS', 'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Concepts.General.SSL.html'),
    awsDas: web('Amazon Web Services', 'Monitoring Amazon RDS with Database Activity Streams', 'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/DBActivityStreams.html'),
    sbConnect: web('Supabase', 'Connect to your database', 'https://supabase.com/docs/guides/database/connecting-to-postgres'),
    sbNet: web('Supabase', 'Network Restrictions', 'https://supabase.com/docs/guides/platform/network-restrictions'),
    sbSsl: web('Supabase', 'Postgres SSL Enforcement', 'https://supabase.com/docs/guides/platform/ssl-enforcement'),
    sbAudit: web('Supabase', 'PGAudit: Postgres Auditing', 'https://supabase.com/docs/guides/database/extensions/pgaudit'),
    sbApi: web('Supabase', 'Securing your API', 'https://supabase.com/docs/guides/api/securing-your-api'),
    sbSecurity: web('Supabase', 'Security at Supabase', 'https://supabase.com/security'),
    sbPricing: web('Supabase', 'Pricing', 'https://supabase.com/pricing'),
  };
};
