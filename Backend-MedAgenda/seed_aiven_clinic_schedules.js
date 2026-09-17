const mysql = require('mysql2/promise');
const readline = require('readline');

const UPDATE_SCHEDULES_SQL = `
UPDATE clinics 
SET 
  clinic_opening_time = '08:00',
  clinic_break_time = '12:00',
  clinic_close_time = '18:00',
  clinic_break_duration = '60',
  clinic_average_appointment_time = '30';
`;

async function run() {
  const connectionUri =
    process.argv[2] ||
    process.env.DATABASE_URL ||
    process.env.AIVEN_SERVICE_URI ||
    process.env.MYSQL_URL;

  let uri = connectionUri;

  if (!uri) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    uri = await new Promise((resolve) =>
      rl.question('Paste your Aiven MySQL Service URI:\n> ', (ans) => {
        rl.close();
        resolve(ans.trim());
      })
    );
  }

  if (!uri) {
    console.error('No URI provided.');
    process.exit(1);
  }

  const connection = await mysql.createConnection({
    uri,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await connection.execute(UPDATE_SCHEDULES_SQL);
    console.log('✅ Clinic schedule rules updated successfully for all clinics!');
    const [rows] = await connection.query(
      'SELECT clinic_id, clinic_name, clinic_opening_time, clinic_break_time, clinic_close_time, clinic_break_duration, clinic_average_appointment_time FROM clinics'
    );
    console.table(rows);
  } catch (err) {
    console.error('❌ Error updating schedules:', err.message);
  } finally {
    await connection.end();
  }
}

run();
