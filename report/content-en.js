module.exports = ({ bench, over, passed, total, auditEntries, deniedEntries, crypto, sql }) => {
  const h1 = (text) => ({ type: 'h1', text });
  const h2 = (text) => ({ type: 'h2', text });
  const p = (text) => ({ type: 'p', text });
  const ul = (...items) => ({ type: 'ul', items });
  const tbl = (key, caption, widths, rows) => ({ type: 'tbl', key, caption, widths, rows });
  const fig = (key, caption, file, width) => ({ type: 'fig', key, caption, file, width });
  const code = (text) => ({ type: 'code', text });
  const row = (label, op) => [label, bench[`${op} (plain)`].m, bench[`${op} (encrypted)`].m, bench[`${op} (plain)`].p, bench[`${op} (encrypted)`].p];

  return {
    title: 'Study and Implementation of Data Security Mechanisms for Cloud Databases',
    labels: { contents: 'CONTENTS', abbreviations: 'LIST OF ABBREVIATIONS', tables: 'LIST OF TABLES', figures: 'LIST OF FIGURES', references: 'REFERENCES' },
    abbreviations: [
      ['Abbreviation', 'Meaning'],
      ['AAD', 'Additional Authenticated Data'],
      ['AES', 'Advanced Encryption Standard'],
      ['API', 'Application Programming Interface'],
      ['CIDR', 'Classless Inter-Domain Routing'],
      ['DBA', 'Database Administrator'],
      ['DDM', 'Dynamic Data Masking'],
      ['GCM', 'Galois/Counter Mode'],
      ['HMAC', 'Hash-based Message Authentication Code'],
      ['IaaS', 'Infrastructure as a Service'],
      ['IP', 'Internet Protocol'],
      ['KMS', 'Key Management Service'],
      ['PaaS', 'Platform as a Service'],
      ['RBAC', 'Role-Based Access Control'],
      ['RDS', 'Relational Database Service (Amazon)'],
      ['REST', 'Representational State Transfer'],
      ['RLS', 'Row-Level Security'],
      ['SaaS', 'Software as a Service'],
      ['SQL', 'Structured Query Language'],
      ['TDE', 'Transparent Data Encryption'],
      ['TLS', 'Transport Layer Security'],
    ],
    blocks: [
      h1('INTRODUCTION'),
      p('Moving a database to the cloud changes who can touch the data. On a private server, the organisation controls the hardware, the operating system and the network. On a managed cloud service, the provider operates these layers, the database is reachable over the public Internet unless restricted, and new interfaces such as automatically generated web APIs may appear beside the classic database port. A wrong setting can therefore expose data to anyone on the Internet rather than to people inside one office.'),
      p('Cloud providers advertise strong built-in protection, yet this protection covers only part of the problem. The shared responsibility model {ref:awsShared,msShared} leaves data, access rights and configuration with the customer. Encryption at rest, for example, does nothing against a user who logs in with valid credentials. A useful study of cloud database security must therefore ask two questions of every mechanism: which threat does it stop, and which threat does it leave open?'),
      p('**Objectives.** This report has three objectives: to explain the main threats and security mechanisms for cloud databases; to implement a layered set of mechanisms on a real cloud database; and to verify by experiment what each mechanism prevents, what it does not prevent and how much it costs in performance.'),
      p('**Scope.** The implementation uses a PostgreSQL database hosted on the Free plan of Supabase, for a fictional clinic with 200 synthetic patient records. Supabase was selected because the project could be created immediately and without a payment card. Azure SQL Database and Amazon RDS are covered through their documentation and are compared in Chapter 1, but they were not deployed. No real personal or medical data was used, and the system is an academic demonstration rather than a product ready to hold real patient records.'),
      p('**Method.** Each threat was mapped to a control, the control was configured with repeatable scripts, and an automated test attempted both a legitimate action and an unauthorised one against the live database. The database was then deleted and rebuilt from the scripts, and all figures in Chapter 3 are drawn from the output of this clean run, stored in the `evidence` folder of the project.'),
      p('**Structure.** Chapter 1 presents the background and compares three platforms. Chapter 2 describes the scenario, threat model and design. Chapter 3 reports the implementation, the results and the limitations. The Conclusions summarise the findings and suggest further work.'),

      p('**Team and task allocation.** The project was carried out by a team of three members. {tbl:team} shows the part of the work each member was responsible for.'),
      tbl('team', 'Team members and task allocation', [26, 16, 58], [
        ['Member', 'Student ID', 'Responsibilities'],
        ['[[Full name A]]', '[[ID]]', 'Cloud and monitoring: Supabase environment; transport, network and Data API protection; encryption at rest; audit logging; performance measurement (Sections 3.2, 3.3, 3.8, 3.9, 3.10)'],
        ['[[Full name B]]', '[[ID]]', 'Database security: schema and synthetic data; roles, RLS, masking and client-side encryption; test scenarios (Chapter 2; Sections 3.4 to 3.7)'],
        ['[[Full name C]]', '[[ID]]', 'Theory and integration: Introduction, Chapter 1, Conclusions and References; report assembly and formatting; slides; cross-checking of results'],
      ]),

      h1('CHAPTER 1. DATA SECURITY IN CLOUD DATABASES'),
      h2('1.1. Cloud computing and managed databases'),
      p('NIST defines cloud computing as a model for convenient, on-demand network access to a shared pool of configurable computing resources that can be provisioned rapidly with minimal management effort {ref:nist145}. The definition lists five essential characteristics: on-demand self-service, broad network access, resource pooling, rapid elasticity and measured service. It also describes three service models, namely IaaS, PaaS and SaaS.'),
      p('A managed database service is close to the PaaS model. The customer receives a working database endpoint, while the provider handles hardware, operating system, patching and basic operations. Two of the characteristics above matter directly for security. Broad network access means that the database may be reachable from anywhere, so the network is no longer a natural barrier. Resource pooling means that customers share physical infrastructure and depend on the isolation provided by the operator. NIST SP 800-144 accordingly advises organisations to understand the security of the provider environment and to keep accountability for their own data when they use a public cloud {ref:nist144}.'),

      h2('1.2. The shared responsibility model'),
      p('Both AWS and Microsoft describe cloud security as a division of duties {ref:awsShared,msShared}. AWS summarises it as security "of" the cloud, which belongs to the provider, and security "in" the cloud, which belongs to the customer. {tbl:shared} applies this idea to a managed database. The key observation is that the entries in the right-hand column cannot be delegated: a provider cannot decide which clinic employee may read which patient record.'),
      tbl('shared', 'Division of security duties for a managed database', [40, 60], [
        ['Provider', 'Customer'],
        ['Data centres, hardware and physical security', 'Which data is stored, and how sensitive it is'],
        ['Host operating system and database software operation', 'Accounts, roles, privileges and row-level rules'],
        ['Isolation between tenants', 'Network allowlists and the interfaces that are exposed'],
        ['Infrastructure of the platform, including storage encryption where it is offered', 'Protection of application keys, secrets and access tokens'],
        ['Availability of platform logging', 'Enabling audit, exporting logs and reviewing them'],
      ]),

      h2('1.3. Threats to cloud databases'),
      p('OWASP ranks broken access control as the first risk in its 2021 Top 10 and cryptographic failures as the second {ref:owaspAc,owaspCrypto}. Both are central to databases. {tbl:threats} lists the threats considered in this report, grouped by who the attacker is and how the attacker reaches the data. The list is not exhaustive: denial of service, for example, is outside the scope of this study.'),
      tbl('threats', 'Main threats to a cloud database', [27, 45, 28], [
        ['Threat', 'Description', 'Possible impact'],
        ['Open network access', 'The database endpoint accepts connections from any address', 'Password guessing, exploitation'],
        ['Eavesdropping', 'Traffic is read or altered between client and server', 'Credentials and data disclosed'],
        ['Exposed web interface', 'An automatically generated API publishes tables', 'Public reading of data'],
        ['Excessive privilege', 'A user or application has more rights than the job needs', 'Wider damage from one mistake or stolen account'],
        ['Horizontal access', 'A valid user reads records of other users', 'Privacy breach inside the organisation'],
        ['Privileged insider', 'An administrator or provider operator reads data directly', 'Disclosure that normal access rules do not stop'],
        ['Stolen storage or backup', 'Disks or backup copies leave the controlled environment', 'Offline reading of all data'],
        ['Undetected activity', 'Actions leave no reviewable record', 'Incidents are found late or never'],
      ]),

      h2('1.4. Network and transport protection'),
      p('Network controls decide who may even attempt to connect. An IP allowlist reduces the attack surface, although it does not authenticate anyone and it applies only to the interfaces it covers. In Supabase, for example, network restrictions apply to direct and pooled Postgres connections but not to the REST API, Storage or Auth services {ref:sbNet}.'),
      p('TLS protects traffic against reading and modification on the network. Two points deserve attention. First, the setting must be enforced by the server: Supabase leaves SSL optional for direct Postgres connections unless the administrator enforces it {ref:sbSsl}. Second, encryption alone does not prove who the server is. To resist an active man-in-the-middle, the client must also verify the server certificate, which PostgreSQL clients express as the `verify-full` mode {ref:sbSsl}.'),

      h2('1.5. Authentication and authorisation'),
      p('Authentication establishes who a user is, and authorisation decides what that user may do. The principle of least privilege requires that each identity has only the rights its job needs, and access should be denied by default {ref:owaspAc}. PostgreSQL implements RBAC through roles and object privileges granted with `GRANT` {ref:pgPriv}. Privileges can be set per table and even per column.'),
      p('Table privileges are all-or-nothing for rows, so PostgreSQL adds RLS. Once RLS is enabled on a table, normal access must be allowed by a policy, and if no policy exists the default is to deny {ref:pgRls}. A `USING` clause selects which existing rows are visible, and a `WITH CHECK` clause validates new row values. The bypass rules are important: superusers and roles with the `BYPASSRLS` attribute always bypass RLS, and table owners bypass it unless `FORCE ROW LEVEL SECURITY` is set {ref:pgRls}. RLS therefore controls ordinary users, not administrators. SQL Server and Azure SQL offer an equivalent through security policies with filter and block predicates {ref:msRls}.'),

      h2('1.6. Data masking'),
      p('Masking hides part of a value in query results, for instance by showing only the last digits of a phone number. It is a convenience control, not encryption, because the original value stays unchanged in storage. Microsoft states that dynamic data masking does not aim to stop users running exhaustive queries, and warns that users with ad hoc query rights can infer real values: a user can filter on a masked column with a guessed range and identify the rows that match, even though the output shows zeros {ref:msDdm}. Masking should thus be combined with access control and auditing.'),

      h2('1.7. Encryption at rest, in transit and in use'),
      p('Encryption protects data in three states, and each state answers a different threat. {tbl:encstates} summarises them.'),
      tbl('encstates', 'Encryption by data state', [20, 34, 46], [
        ['State', 'Typical mechanism', 'What it does not stop'],
        ['At rest', 'Storage encryption, TDE', 'Anyone who queries through the running database, because data is decrypted for them'],
        ['In transit', 'TLS', 'Access by a legitimate endpoint; attacks on the client or the server'],
        ['Against the server', 'Client-side encryption such as Always Encrypted', 'Compromise of the client or its keys; it also restricts queries on the encrypted columns'],
      ]),
      p('TDE on Azure SQL encrypts the database, its backups and its transaction logs at the page level. Each page is decrypted when read into memory and is encrypted before being written to disk, and TDE is on by default for new databases {ref:msTde}. The same source notes that an exported BACPAC file is not encrypted, which shows how protection can end at a boundary that users do not notice. Amazon RDS similarly uses AES-256 for storage, logs, automated backups, read replicas and snapshots, and it can only be turned on when an instance is created {ref:awsEnc}.'),
      p('Client-side encryption goes further by keeping the keys away from the database engine. Always Encrypted separates those who own the data from those who manage it, including cloud database operators, with the cost that operations on encrypted columns are limited {ref:msAe}. Deterministic encryption allows equality lookups but can leak patterns, while randomised encryption is stronger and does not allow searching. The design in this report faces the same trade-off.'),
      p('The implementation uses AES {ref:aes} in GCM mode, a NIST-recommended algorithm for authenticated encryption with associated data {ref:gcm}. Authenticated encryption matters because it detects modification as well as hiding content. For exact-match search over encrypted values, a keyed hash such as HMAC {ref:hmac} can serve as a blind index: equal inputs give equal outputs, while a reader without the key cannot compute them.'),

      h2('1.8. Key management'),
      p('Encryption moves the problem from protecting data to protecting keys. NIST SP 800-57 gives guidance on the entire key lifecycle, including generation, storage, use, rotation and destruction {ref:nist57}. Cloud platforms offer a choice of ownership. With provider-managed keys, operation is simple, but trust in the provider remains. With customer-managed keys, as in Azure Key Vault integration for TDE {ref:msTde} or customer managed keys in AWS KMS {ref:awsEnc}, the customer can control rotation and access and can make the data unreadable by revoking the key. This control carries its own risk, because losing the key makes data inaccessible.'),

      h2('1.9. Auditing'),
      p('Preventive controls can fail, so a system also needs a record of what happened. Azure SQL auditing writes database events to a storage account, a Log Analytics workspace or Event Hubs {ref:msAudit}. Amazon RDS offers Database Activity Streams for near real-time monitoring {ref:awsDas}. In PostgreSQL, the pgAudit extension produces detailed session and object audit logs through the standard logging facility {ref:pgaudit}. Supabase allows pgAudit configuration only at the role level and shows the results in its log viewer {ref:sbAudit}. A log is useful only if it is retained long enough and reviewed by someone, so retention must be treated as part of the design.'),

      h2('1.10. Comparison of three platforms'),
      p('{tbl:platforms} compares the features relevant to this study. It relies on vendor documentation. Azure SQL offers the most ready-made features, while Supabase requires more to be built by hand. The results in Chapter 3 say nothing about the Azure and AWS features themselves.'),
      tbl('platforms', 'Security features of three cloud database platforms', [22, 26, 26, 26], [
        ['Feature', 'Azure SQL Database', 'Amazon RDS for PostgreSQL', 'Supabase (PostgreSQL)'],
        ['Encryption at rest', 'TDE, on by default for new databases', 'AES-256, chosen when the instance is created', 'AES-256 stated by the provider {ref:sbSecurity}'],
        ['Customer-managed key', 'Yes, Azure Key Vault', 'Yes, AWS KMS', 'No option found in the pages reviewed'],
        ['Transport', 'TLS', 'SSL/TLS {ref:awsSsl}', 'TLS; enforcement is a setting'],
        ['Client-side encryption', 'Always Encrypted built in', 'Implemented by the application', 'Implemented by the application'],
        ['Row-level rules', 'Security policies', 'PostgreSQL RLS', 'PostgreSQL RLS'],
        ['Masking', 'DDM built in', 'Views or similar', 'Views or similar'],
        ['Audit', 'SQL auditing', 'pgAudit, Activity Streams', 'pgAudit at role level'],
      ]),

      h1('CHAPTER 2. SECURITY DESIGN FOR THE CLINIC DATABASE'),
      h2('2.1. Platform selection and environment'),
      p('The project was first planned on Azure SQL Database, but registration for the student subscription was not successful. Supabase was then adopted since it provides a real PostgreSQL service on the Internet with no payment card required at sign-up. The Free plan has clear limits: 500 MB per project, one day of log retention, no automatic backups and a pause after one week of inactivity {ref:sbPricing}. These limits shaped the design, in that logs had to be exported immediately and the whole database had to be reproducible from scripts.'),
      p('The database ran PostgreSQL 17.11 with pgAudit 17.1 in region `ap-southeast-2`. On the Free plan, the direct connection supports only IPv6, so the client connected through the shared pooler in session mode on port 5432, which also supports custom database roles {ref:sbConnect}. Scripts were written in Node.js with the `pg` driver.'),

      h2('2.2. Scenario and data classification'),
      p('The scenario is a small fictional clinic. Doctors treat their own patients, a receptionist manages appointments and contacts patients, a database administrator keeps the system running, and an auditor checks that rules are being followed. All 200 patient records are synthetic: phone numbers start with `000` and national identity numbers start with `999`, which makes them recognisably fake, and email addresses use the reserved domain `example.com`. {tbl:classes} shows how each kind of data is classified and protected.'),
      tbl('classes', 'Data classification and protection', [28, 18, 54], [
        ['Data', 'Sensitivity', 'Protection'],
        ['National ID', 'High', 'AES-256-GCM on the client, HMAC blind index for lookup'],
        ['Diagnosis', 'High', 'AES-256-GCM on the client'],
        ['Phone, email', 'Medium', 'Masked for the receptionist, visible to the treating doctor'],
        ['Patient name', 'Medium', 'Access control and RLS; visible to the receptionist, who needs it'],
        ['Appointments', 'Medium', 'RLS for doctors, read access for the receptionist'],
      ]),

      h2('2.3. Threat model'),
      p('The design assumes that an external attacker can reach the public endpoints and may obtain the public anonymous API key, which Supabase projects use in client applications. It assumes that insiders hold valid accounts and may try to exceed their role, and that a database administrator or provider operator may read anything stored in the database. The client machine that holds the encryption keys is trusted. An attacker who controls that machine, or the Supabase account itself, is outside the model, and no mechanism in this design would stop such an attacker.'),

      h2('2.4. System architecture'),
      p('{fig:arch} shows the architecture. The client is the only component that holds encryption keys. All database traffic passes through the shared pooler over TLS. The Data API remains part of the platform, but the `clinic` schema is deliberately not exposed to it. Logs leave the platform through the management interface and are saved as evidence, since the Free plan discards them after one day.'),
      fig('arch', 'System architecture and trust boundaries', 'arch_en.png', 15.5),
      p('Security is organised as defence in depth, so that no single control is relied on alone. {fig:layers} shows the layers used. A request must pass each outer layer before reaching the data, and even an actor who reaches the stored values sees only ciphertext for the most sensitive columns.'),
      fig('layers', 'Defence-in-depth layers of the design', 'layers_en.png', 15),

      h2('2.5. Roles and privileges'),
      p('Five login roles represent the people in the scenario. {tbl:roles} is the access matrix that the scripts implement. Two choices in this matrix deserve explanation. The receptionist has no privilege on the base `patients` table and reads it only through a masking view. The administrator can read every row, because that job needs visibility for maintenance, yet can modify nothing and holds no encryption key, so the highest-sensitivity columns stay unreadable to this role.'),
      tbl('roles', 'Role and privilege matrix', [17, 22, 24, 21, 16], [
        ['Role', 'patients table', 'patients_masked', 'appointments', 'Holds key'],
        ['doctor_a, doctor_b', 'Own rows: read; update diagnosis', 'No', 'Own rows: read', 'Yes, in the client'],
        ['receptionist', 'Denied', 'Read', 'Read', 'No'],
        ['db_admin', 'All rows: read', 'No', 'All rows: read', 'No'],
        ['auditor', 'Denied', 'No', 'Denied', 'No'],
      ]),

      h2('2.6. Mapping threats to controls'),
      p('{tbl:mapping} links each threat from {tbl:threats} to the control selected and the test that verifies it. Controls that could not be tested by the customer are marked as such, so that documentation is not presented as proof.'),
      tbl('mapping', 'Threats, controls and verification', [27, 40, 33], [
        ['Threat', 'Control', 'Verification'],
        ['Open network access', 'Network Restrictions', 'Test T1.4'],
        ['Eavesdropping', 'SSL enforcement', 'Tests T1.1 to T1.3'],
        ['Exposed web interface', 'Private schema, no anon grants', 'Tests T2.1 and T2.2'],
        ['Excessive privilege', 'RBAC, least privilege', 'Tests T3.1 to T3.5'],
        ['Horizontal access', 'RLS', 'Tests T4.1 to T4.6'],
        ['Unneeded disclosure to staff', 'Masking view', 'Tests T5.1 to T5.3'],
        ['Privileged insider', 'Client-side AES-256-GCM', 'Tests T6.1 to T6.4'],
        ['Stolen storage or backup', 'Provider encryption at rest', 'Provider statement only; not testable'],
        ['Undetected activity', 'pgAudit and Postgres error log', 'Log export and traceability check'],
      ]),

      h2('2.7. Field encryption design'),
      p('Sensitive fields are encrypted by the client before they are sent, as shown in {fig:flow}. Each value uses AES-256-GCM with a fresh random 96-bit nonce, and the stored value is the nonce, the authentication tag and the ciphertext. The additional authenticated data has the form `patient:id:column`, which binds a ciphertext to its row and column. Without this binding, an insider could copy a diagnosis from one patient to another, and decryption would still succeed. The national ID also receives an HMAC-SHA-256 blind index under a separate key, which permits exact lookup and nothing else.'),
      fig('flow', 'Field encryption, storage and decryption flow', 'flow_en.png', 15.5),

      h1('CHAPTER 3. IMPLEMENTATION AND EVALUATION'),
      h2('3.1. Implementation overview'),
      p('The implementation consists of two SQL files and a small set of Node.js scripts: `configure-cloud.js` sets platform options, `setup-db.js` rebuilds the schema and data, `run-tests.js` executes the experiments, `export-logs.js` collects the logs and `benchmark.js` measures performance. Passwords and keys are generated by the scripts and stored only in a local `.env` file that is excluded from version control. Output is filtered to remove the project identifier, credentials and IP addresses before being written as evidence.'),
      p(`The test script connects to the live database as each role in turn, and a test passes only if the observed behaviour matches the expected one. In the final clean run, **${passed} of ${total}** tests passed. {tbl:results} summarises them by group. One of these, T4.6, only records a fact for the limitations analysis rather than testing a control. A separate suite of seven unit tests for the encryption functions also passed.`),
      tbl('results', 'Summary of experiment results', [10, 44, 12, 34], [
        ['Group', 'Control', 'Tests', 'Result'],
        ['T1', 'Transport and network', '4', 'All passed'],
        ['T2', 'Data API exposure', '2', 'All passed'],
        ['T3', 'RBAC and least privilege', '5', 'All passed'],
        ['T4', 'Row-Level Security', '6', 'All passed'],
        ['T5', 'Masking', '3', 'All passed'],
        ['T6', 'Client-side encryption', '4', 'All passed'],
      ]),

      h2('3.2. Transport and network protection'),
      p('SSL enforcement was turned on through the Management API. As {fig:transport} shows, the client negotiated TLS 1.3 (T1.1), and a connection without TLS was refused with an error stating that SSL is required (T1.2). To test the allowlist, the script temporarily replaced it with `203.0.113.0/24`, an address range reserved for documentation, and the next connection attempt was rejected because the client address was not on the list (T1.4). The original settings were restored automatically, and later tests confirmed that connections worked again.'),
      fig('transport', 'Results of the transport and network tests', 'ev_transport.png', 16),
      p('The result has two limits. The negotiated version describes only the segment from the client to the pooler, as the segment from the pooler to the database cannot be observed from outside. In addition, the test client did not verify the server certificate, so these tests prove encryption but not server identity. A production client should use `verify-full` with the CA certificate of the provider {ref:sbSsl}.'),

      h2('3.3. Data API exposure'),
      p('Supabase publishes a REST interface automatically, and network restrictions do not cover it {ref:sbNet}, so this interface needed its own test. The clinic tables were placed in a dedicated schema that the Data API does not expose, and all privileges of the `anon` role were revoked. As {fig:dataapi} shows, a request with the anonymous key for the clinic schema failed with HTTP 406 and the error `Invalid schema: clinic` (T2.1).'),
      p('A control experiment gives this result its meaning. The script created a temporary table in the `public` schema, granted it to `anon` without RLS, and read it through the same API with HTTP 200 (T2.2), after which the table was removed. This demonstrates that the path works and that the earlier refusal was caused by the configuration. It also shows how easily data can be published: one `GRANT` on an exposed table without RLS is sufficient {ref:sbApi}.'),
      fig('dataapi', 'Results of the Data API tests', 'ev_data_api.png', 16),

      h2('3.4. Role-based access control'),
      p('All privileges were first revoked and then granted per role, as in {tbl:roles}. {fig:rbac} shows the receptionist and auditor denied on the patient table, the doctor unable to delete and the administrator unable to update, each with PostgreSQL error 42501. In test T3.5, the auditor confirmed these rights through catalog functions without reading any clinical data.'),
      fig('rbac', 'Results of the access control tests', 'ev_rbac.png', 16),

      h2('3.5. Row-Level Security'),
      p('RLS was enabled and forced on the `patients` and `appointments` tables. The doctor policy compares each row with the doctor record of the current role:'),
      code(sql('02_access_control.sql', 'CREATE POLICY doctor_own_patients')),
      p('As {fig:rls} shows, the same query returned 100 rows only of doctor 1 to `doctor_a`, and 100 rows only of doctor 2 to `doctor_b`. A direct read of a patient of the other doctor returned no rows, and an update attempt on such a patient affected no rows. Neither case raised an error, which matches the documented behaviour of `USING` filters {ref:pgRls}: an unauthorised user cannot even tell whether the record exists.'),
      fig('rls', 'Results of the Row-Level Security tests', 'ev_rls.png', 16),
      p('Test T4.6 recorded that the platform role `postgres` has `rolbypassrls = true`. Therefore, RLS provides no protection against whoever holds that password. This finding is the reason why RLS alone was not considered enough for the most sensitive columns.'),

      h2('3.6. Data masking'),
      p('PostgreSQL has no built-in equivalent of DDM, so masking was implemented with a view:'),
      code(sql('02_access_control.sql', 'CREATE VIEW clinic.patients_masked')),
      p('The receptionist holds a privilege only on this view. As {fig:masking} shows, phone and email appear masked (T5.1), and the doctor still sees the real phone number of an own patient (T5.3). Test T5.2 examined the inference attack described for DDM {ref:msDdm}. Filtering on the real phone prefix `000` returned no rows, since the condition is applied to the masked output rather than to the stored value.'),
      fig('masking', 'Results of the masking tests', 'ev_masking.png', 16),
      p('This result should not be overstated. It covers one filtering attempt, not a full analysis of inference attacks. The design also depends entirely on denying the base table, since a single mistaken `GRANT` would remove the protection. Moreover, the view runs with the rights of its owner, so RLS does not limit the receptionist, who can see all patients, as this role requires.'),

      h2('3.7. Client-side encryption'),
      p('{fig:encryption} shows what the administrator sees: national ID and diagnosis are only Base64 ciphertext, even though this role can read every row (T6.1). A client with the key recovered the values (T6.2). A change of a single bit made decryption fail (T6.3), and so did reading a ciphertext as if it belonged to another patient (T6.4). These two tests show that the design provides integrity as well as confidentiality, because the error is detected at the client, even when the attacker has full control of the stored data.'),
      fig('encryption', 'Results of the client-side encryption tests', 'ev_encryption.png', 16),
      p('The limits are significant. The database cannot sort, filter by range or search within the encrypted columns. The blind index reveals which patients share the same national ID value and supports only exact matching. For this demonstration, a single key is shared by all doctors and kept in a local file, with no rotation, so a stolen file exposes every record. A real system would keep keys in a KMS, as in the lifecycle described in NIST SP 800-57 {ref:nist57}.'),

      h2('3.8. Encryption at rest'),
      p('Supabase states that all customer data is encrypted at rest with AES-256 {ref:sbSecurity}. A customer of a managed service has no access to the underlying disks and no query that proves this property. This control was therefore **not verified** in this project, and this report records it as a statement by the provider. This is itself a practical consequence of shared responsibility: some controls can only be accepted on trust, or through external audit reports. Client-side encryption reduces the importance of this trust for the two columns it covers, but not for names, phone numbers and emails.'),

      h2('3.9. Audit logging'),
      p(`pgAudit was enabled for each demonstration role with the classes \`read, write, ddl, role\`. After the tests, the logs were exported through the Management API. {fig:audit} shows the traceability check: every attempted unauthorised action, and every sampled sensitive read, was found with the correct role name. The export covers two complete test runs and contains ${auditEntries} pgAudit entries and ${deniedEntries} permission-denied entries, which means 10 and 4 per run.`),
      fig('audit', 'Audit log traceability check and sample entries', 'ev_audit.png', 16),
      p('The experiment produced one useful finding. The denied statements appeared in the Postgres error log but not as pgAudit entries, because each run produced exactly 10 pgAudit entries for 10 successful statements. An audit process that reads only `AUDIT:` lines would therefore miss exactly the attempts it most needs to see. The audit design must include both sources. Other limits also apply: the `postgres` role was not configured for auditing in this demonstration, statement parameters were not logged, and logs last only one day on this plan unless exported.'),

      h2('3.10. Performance'),
      p('The performance test compared plain and encrypted columns using two tables of 200 rows, on one connection. Each operation ran 100 times after 10 warm-up runs, and plain and encrypted operations were interleaved so that network changes would affect both alike. Overhead is calculated from the median times:'),
      { type: 'eq', label: 'Overhead' },
      tbl('bench', 'Query latency, plain and encrypted columns (milliseconds)', [36, 16, 16, 16, 16], [
        ['Operation', 'Median plain', 'Median enc.', 'p95 plain', 'p95 enc.'],
        row('Lookup by national ID', 'Lookup by national ID'),
        row('Read 200 rows', 'Read 200 rows'),
        row('Insert 1 row, then delete', 'Insert 1 row'),
      ]),
      p(`According to {tbl:bench}, median overhead was ${over.lookup.toFixed(2)}% for lookup, ${over.read.toFixed(1)}% for reading 200 rows and ${over.insert.toFixed(2)}% for insert. The network dominates these figures. A single query costs about 237 ms, and the insert test costs about twice that because it issues two statements. Local encryption and decryption together took only ${crypto.median} ms per value. This explains why the row read, which decrypts 400 values, is the only case with a visible difference.`),
      p(`The p95 for reading encrypted rows rose to ${bench['Read 200 rows (encrypted)'].p} ms, about one additional network round trip. The larger encrypted result may be the reason, but this cause was not investigated, so the figure is reported as observed. The test used one client, a small table and a shared Free plan service in a distant region. It shows that the cost of encryption was small in this setting, but it should not be read as a prediction for a production workload or a server close to the client.`),

      h2('3.11. Evaluation of the controls'),
      p('{tbl:eval} brings the results together and is the main finding of this report. No control covers every threat, and each one has a clear point at which another control must take over.'),
      tbl('eval', 'What each control stops and does not stop', [22, 37, 41], [
        ['Control', 'Stops', 'Does not stop'],
        ['SSL enforcement', 'Plaintext connections', 'Impersonation of the server unless the client verifies the certificate'],
        ['IP allowlist', 'Database connections from other addresses', 'The REST API; attackers on an allowed network'],
        ['Private schema', 'Access through the Data API', 'Direct database connections with valid credentials'],
        ['RBAC', 'Actions beyond the role', 'Misuse of rights the role legitimately holds'],
        ['RLS', 'Reading and updating rows of other doctors', 'Roles with `BYPASSRLS`, such as `postgres`'],
        ['Masking view', 'Casual disclosure to staff', 'Anyone granted the base table; visible last digits and names'],
        ['Client-side encryption', 'Reading or undetected change by DBA and platform', 'Compromise of the client or keys; column search and sorting'],
        ['Encryption at rest', 'Offline reading of storage (as stated by the provider)', 'Any access through the running database'],
        ['pgAudit and error log', 'Undetected activity, when reviewed', 'The action itself; it records and does not block'],
      ]),

      h1('CONCLUSIONS'),
      p(`This project studied the threats to cloud databases and implemented a layered set of controls on a real PostgreSQL service, using a fictional clinic with synthetic data. Network and transport controls, API exposure settings, RBAC, RLS, view-based masking, client-side encryption and audit logging were all configured through repeatable scripts. In the final run from a clean rebuild, ${passed} of ${total} automated tests passed, and every unauthorised attempt was traced to the correct role in the logs.`),
      p('Three lessons stand out. First, the customer side of shared responsibility is large: the exposures demonstrated in this study, such as a table published through the REST API by one `GRANT`, come from configuration and not from provider failure. Second, each control has a specific limit. RLS does not bind the platform administrator, an allowlist does not cover the REST API, and encryption at rest does not stop a valid login. Security comes from the combination of layers, and {tbl:eval} shows which layer covers which gap. Third, tests can show things that documentation does not make obvious, as with the denied statements that appeared in the error log rather than in pgAudit.'),
      p(`Client-side encryption was the strongest control against privileged insiders, and its measured median overhead was at most ${over.read.toFixed(1)}% in this setting, where network latency dominated. Its real cost lies in functionality and key management rather than in speed.`),
      p('**Limitations.** Only one platform was deployed, so the comparison with Azure and AWS relies on documentation. Encryption at rest could not be verified. The client did not verify the server certificate. Keys were stored in a local file with no rotation, and the audit configuration excluded the `postgres` role. The performance test was small and used a distant server. The inference test of the masking view covered a single attempt.'),
      p('**Future work.** The most useful next steps are to verify server certificates with `verify-full`, to move keys to a KMS with rotation and a separate key per doctor, to ship logs to an external store that administrators cannot alter, and to repeat the experiments on Azure SQL so that its built-in Always Encrypted, DDM and TDE features can be compared directly with the hand-built equivalents used here.'),
    ],
  };
};
