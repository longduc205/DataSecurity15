-- Fictional clinic. All data is synthetic.
DROP SCHEMA IF EXISTS clinic CASCADE;
CREATE SCHEMA clinic;

CREATE TABLE clinic.doctors (
  doctor_id  int PRIMARY KEY,
  full_name  text NOT NULL,
  db_role    text NOT NULL UNIQUE
);

CREATE TABLE clinic.patients (
  patient_id        int PRIMARY KEY,
  full_name         text NOT NULL,
  phone             text NOT NULL,
  email             text NOT NULL,
  national_id_enc   text NOT NULL,  -- AES-256-GCM, encrypted by the client
  national_id_hmac  text NOT NULL,  -- HMAC-SHA-256 blind index for exact lookup
  diagnosis_enc     text NOT NULL,  -- AES-256-GCM, encrypted by the client
  doctor_id         int NOT NULL REFERENCES clinic.doctors
);
CREATE INDEX ON clinic.patients (national_id_hmac);
CREATE INDEX ON clinic.patients (doctor_id);

CREATE TABLE clinic.appointments (
  appointment_id int PRIMARY KEY,
  patient_id     int NOT NULL REFERENCES clinic.patients,
  doctor_id      int NOT NULL REFERENCES clinic.doctors,
  starts_at      timestamptz NOT NULL
);
CREATE INDEX ON clinic.appointments (doctor_id);
