/**
 * Script to assign specialties to doctors on AIVEN Cloud MySQL (Vercel Backend DB).
 *
 * MAPPING APPLIED (from your database registries):
 * - Dr. user_id: 5  (CardioSalud Medellín) -> specialty_id: 1  (Cardiología)
 * - Dr. user_id: 6  (NeuroCentro Bogotá)   -> specialty_id: 2  (Neurología)
 * - Dr. user_id: 7  (Pediátrico Arcoíris)  -> specialty_id: 3  (Pediatría)
 * - Dr. user_id: 8  (Mujer Vital)          -> specialty_id: 4  (Ginecología)
 * - Dr. user_id: 9  (DermaClinic)          -> specialty_id: 5  (Dermatología)
 * - Dr. user_id: 10 (Instituto Oncológico) -> specialty_id: 6  (Oncología)
 * - Dr. user_id: 11 (Equilibrio Mental)    -> specialty_id: 7  (Psiquiatría)
 * - Dr. user_id: 12 (VisiónClara)          -> specialty_id: 8  (Oftalmología)
 * - Dr. user_id: 13 (Salud Auditiva CCS)   -> specialty_id: 9  (Otorrinolaringología)
 * - Dr. user_id: 14 (TraumaClinic Zulia)   -> specialty_id: 10 (Traumatología)
 *
 * USAGE:
 *   node seed_aiven_doctor_specialties.js "<AIVEN_SERVICE_URI>"
 *
 * EXAMPLE:
 *   node seed_aiven_doctor_specialties.js "mysql://avnadmin:AVNS_xxxx@mysql-xxx.aivencloud.com:12345/defaultdb?ssl-mode=REQUIRED"
 *
 * Or using environment variables:
 *   $env:DATABASE_URL="mysql://avnadmin:..." ; node seed_aiven_doctor_specialties.js
 */

const mysql = require('mysql2/promise');
const readline = require('readline');

const DOCTOR_SPECIALTY_ASSIGNMENTS = [
  { doctor_id: 5,  specialty_id: 1,  name: 'Dr. user_id 5 -> Cardiología (CardioSalud Medellín)' },
  { doctor_id: 6,  specialty_id: 2,  name: 'Dr. user_id 6 -> Neurología (NeuroCentro Bogotá)' },
  { doctor_id: 7,  specialty_id: 3,  name: 'Dr. user_id 7 -> Pediatría (Pediátrico Arcoíris)' },
  { doctor_id: 8,  specialty_id: 4,  name: 'Dr. user_id 8 -> Ginecología (Mujer Vital)' },
  { doctor_id: 9,  specialty_id: 5,  name: 'Dr. user_id 9 -> Dermatología (DermaClinic)' },
  { doctor_id: 10, specialty_id: 6,  name: 'Dr. user_id 10 -> Oncología (Instituto Oncológico)' },
  { doctor_id: 11, specialty_id: 7,  name: 'Dr. user_id 11 -> Psiquiatría (Equilibrio Mental)' },
  { doctor_id: 12, specialty_id: 8,  name: 'Dr. user_id 12 -> Oftalmología (VisiónClara)' },
  { doctor_id: 13, specialty_id: 9,  name: 'Dr. user_id 13 -> Otorrinolaringología (Salud Auditiva CCS)' },
  { doctor_id: 14, specialty_id: 10, name: 'Dr. user_id 14 -> Traumatología (TraumaClinic Zulia)' },
];

async function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim());
    })
  );
}

async function run() {
  let connectionUri =
    process.argv[2] ||
    process.env.DATABASE_URL ||
    process.env.AIVEN_SERVICE_URI ||
    process.env.MYSQL_URL;

  if (!connectionUri) {
    console.log('=================================================================');
    console.log('  AIVEN CLOUD MYSQL - DOCTOR SPECIALTIES SEEDER');
    console.log('=================================================================\n');
    connectionUri = await askQuestion(
      'Paste your Aiven MySQL Service URI (e.g. mysql://avnadmin:password@host:port/defaultdb?ssl-mode=REQUIRED):\n> '
    );
  }

  if (!connectionUri) {
    console.error(' No connection URI provided. Exiting.');
    process.exit(1);
  }

  console.log('\n Connecting to Aiven Cloud MySQL with SSL...');
  let connection;

  try {
    // Connect with SSL enabled for Aiven
    connection = await mysql.createConnection({
      uri: connectionUri,
      ssl: {
        rejectUnauthorized: false,
      },
    });

    console.log(' Successfully connected to Aiven database!');

    console.log('\n Inserting doctor specialties mapping into `doctor_specialties` table...');
    for (const item of DOCTOR_SPECIALTY_ASSIGNMENTS) {
      await connection.execute(
        `INSERT INTO doctor_specialties (doctor_id, specialty_id) 
         VALUES (?, ?) 
         ON DUPLICATE KEY UPDATE specialty_id = VALUES(specialty_id)`,
        [item.doctor_id, item.specialty_id]
      );
      console.log(`   ${item.name}`);
    }

    console.log('\n Verifying updated doctor_specialties in Aiven DB:');
    const [rows] = await connection.query(`
      SELECT 
        ds.doctor_id,
        u.first_name,
        u.first_last_name,
        cm.clinic_id,
        c.clinic_name,
        sp.specialty_id,
        sp.specialty_name
      FROM doctor_specialties ds
      JOIN users u ON u.user_id = ds.doctor_id
      JOIN clinic_members cm ON cm.user_id = ds.doctor_id
      JOIN clinics c ON c.clinic_id = cm.clinic_id
      JOIN specialties sp ON sp.specialty_id = ds.specialty_id
      ORDER BY cm.clinic_id ASC
    `);

    console.table(rows);

    console.log('\n Testing live endpoint response...');
    try {
      const liveRes = await fetch('https://med-agenda-1-three.vercel.app/clinics/getClinicDoctors?clinic_id=1');
      const liveData = await liveRes.json();
      console.log(` Live Vercel API for Clinic 1 returned ${liveData.length} doctor(s):`, liveData);
    } catch (e) {
      console.log(' (Could not test live endpoint automatically)');
    }

    console.log('\n All doctor specialties populated on Aiven successfully!');
  } catch (err) {
    console.error('\n Error connecting/updating Aiven database:', err.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

run();
