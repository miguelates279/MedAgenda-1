/**
 * Script to assign specialties to doctors in MySQL database (doctor_specialties table).
 *
 * MAPPING FROM YOUR SCREENSHOTS:
 * - user_id: 5  (CardioSalud Medellín) -> specialty_id: 1  (Cardiología)
 * - user_id: 6  (NeuroCentro Bogotá)   -> specialty_id: 2  (Neurología)
 * - user_id: 7  (Pediátrico Arcoíris)  -> specialty_id: 3  (Pediatría)
 * - user_id: 8  (Mujer Vital)          -> specialty_id: 4  (Ginecología)
 * - user_id: 9  (DermaClinic)          -> specialty_id: 5  (Dermatología)
 * - user_id: 10 (Instituto Oncológico) -> specialty_id: 6  (Oncología)
 * - user_id: 11 (Equilibrio Mental)    -> specialty_id: 7  (Psiquiatría)
 * - user_id: 12 (VisiónClara)          -> specialty_id: 8  (Oftalmología)
 * - user_id: 13 (Salud Auditiva CCS)   -> specialty_id: 9  (Otorrinolaringología)
 * - user_id: 14 (TraumaClinic Zulia)   -> specialty_id: 10 (Traumatología)
 *
 * TO RUN:
 *   node assign_doctor_specialties.js
 *
 * You can customize DB parameters via environment variables or directly in the dbConfig object below.
 */

const mysql = require('mysql2/promise');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'medagenda',
};

const DOCTOR_SPECIALTY_ASSIGNMENTS = [
  { doctor_id: 5,  specialty_id: 1,  doctor_note: 'CardioSalud Medellín (Dr. user_id 5 -> Cardiología)' },
  { doctor_id: 6,  specialty_id: 2,  doctor_note: 'NeuroCentro Bogotá (Dr. user_id 6 -> Neurología)' },
  { doctor_id: 7,  specialty_id: 3,  doctor_note: 'Pediátrico Arcoíris (Dr. user_id 7 -> Pediatría)' },
  { doctor_id: 8,  specialty_id: 4,  doctor_note: 'Mujer Vital (Dr. user_id 8 -> Ginecología)' },
  { doctor_id: 9,  specialty_id: 5,  doctor_note: 'DermaClinic (Dr. user_id 9 -> Dermatología)' },
  { doctor_id: 10, specialty_id: 6,  doctor_note: 'Instituto Oncológico (Dr. user_id 10 -> Oncología)' },
  { doctor_id: 11, specialty_id: 7,  doctor_note: 'Equilibrio Mental (Dr. user_id 11 -> Psiquiatría)' },
  { doctor_id: 12, specialty_id: 8,  doctor_note: 'VisiónClara (Dr. user_id 12 -> Oftalmología)' },
  { doctor_id: 13, specialty_id: 9,  doctor_note: 'Salud Auditiva CCS (Dr. user_id 13 -> Otorrinolaringología)' },
  { doctor_id: 14, specialty_id: 10, doctor_note: 'TraumaClinic Zulia (Dr. user_id 14 -> Traumatología)' },
];

async function main() {
  console.log('Connecting to MySQL database with config:', {
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    database: dbConfig.database,
  });

  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log(' Successfully connected to database!');

    for (const item of DOCTOR_SPECIALTY_ASSIGNMENTS) {
      // Use INSERT IGNORE or ON DUPLICATE KEY UPDATE to prevent duplicates
      await connection.execute(
        'INSERT IGNORE INTO doctor_specialties (doctor_id, specialty_id) VALUES (?, ?)',
        [item.doctor_id, item.specialty_id]
      );
      console.log(` Inserted: ${item.doctor_note}`);
    }

    const [rows] = await connection.query('SELECT * FROM doctor_specialties');
    console.log('\n Current records in doctor_specialties:');
    console.table(rows);
    console.log('\n All doctor specialties updated successfully!');
  } catch (err) {
    console.error(' Error executing script:', err.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

main();
