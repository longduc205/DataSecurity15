-- Run after the login roles exist and the seed data is loaded.

-- Least privilege: start from nothing, then grant per role.
REVOKE ALL ON SCHEMA clinic FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA clinic FROM PUBLIC, anon, authenticated, service_role;

GRANT USAGE ON SCHEMA clinic TO doctor_a, doctor_b, receptionist, db_admin, auditor;

-- Doctors: read the rows RLS allows, no delete.
GRANT SELECT ON clinic.patients, clinic.appointments, clinic.doctors TO doctor_a, doctor_b;
GRANT UPDATE (diagnosis_enc) ON clinic.patients TO doctor_a, doctor_b;

-- Receptionist: masked view and scheduling only, never the base patient table.
CREATE VIEW clinic.patients_masked AS
SELECT patient_id,
       full_name,
       '*******' || right(phone, 3)                                AS phone,
       left(email, 1) || '***@' || split_part(email, '@', 2)       AS email,
       doctor_id
FROM clinic.patients;
GRANT SELECT ON clinic.patients_masked, clinic.appointments TO receptionist;

-- DBA: can administer and read all rows, but holds no encryption key.
GRANT SELECT ON ALL TABLES IN SCHEMA clinic TO db_admin;

-- Auditor: no clinical data at all. Reads privileges via catalog functions and logs in the dashboard.

-- Row-Level Security
ALTER TABLE clinic.patients      ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic.patients      FORCE  ROW LEVEL SECURITY;
ALTER TABLE clinic.appointments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic.appointments  FORCE  ROW LEVEL SECURITY;

CREATE POLICY doctor_own_patients ON clinic.patients
  FOR SELECT TO doctor_a, doctor_b
  USING (doctor_id = (SELECT doctor_id FROM clinic.doctors WHERE db_role = current_user));

CREATE POLICY doctor_update_own_patients ON clinic.patients
  FOR UPDATE TO doctor_a, doctor_b
  USING (doctor_id = (SELECT doctor_id FROM clinic.doctors WHERE db_role = current_user))
  WITH CHECK (doctor_id = (SELECT doctor_id FROM clinic.doctors WHERE db_role = current_user));

CREATE POLICY doctor_own_appointments ON clinic.appointments
  FOR SELECT TO doctor_a, doctor_b
  USING (doctor_id = (SELECT doctor_id FROM clinic.doctors WHERE db_role = current_user));

CREATE POLICY reception_appointments ON clinic.appointments
  FOR SELECT TO receptionist USING (true);

CREATE POLICY dba_read_patients ON clinic.patients
  FOR SELECT TO db_admin USING (true);
CREATE POLICY dba_read_appointments ON clinic.appointments
  FOR SELECT TO db_admin USING (true);

-- The view runs as its owner, so the owner needs a policy under FORCE RLS.
CREATE POLICY owner_all_patients ON clinic.patients
  FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY owner_all_appointments ON clinic.appointments
  FOR ALL TO postgres USING (true) WITH CHECK (true);
