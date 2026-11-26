async function up(connection) {
  const [columns] = await connection.query('SHOW COLUMNS FROM appointments');
  if (!columns.some(column => column.Field === 'duration_minutes')) {
    await connection.query('ALTER TABLE appointments ADD COLUMN duration_minutes SMALLINT UNSIGNED NULL DEFAULT NULL');
  }
  const [current] = await connection.query('SHOW COLUMNS FROM appointments');
  const duration = current.find(column => column.Field === 'duration_minutes');
  if (!duration || duration.Type !== 'smallint unsigned' || duration.Null !== 'YES' || duration.Default !== null) throw new Error('Unexpected appointments.duration_minutes definition');
  const [clinicColumns] = await connection.query('SHOW COLUMNS FROM clinics');
  for (const name of ['clinic_average_appointment_time', 'clinic_break_duration']) {
    const column = clinicColumns.find(value => value.Field === name);
    if (!column || !['varchar(3)', 'varchar(4)'].includes(column.Type) || column.Null !== 'YES' || column.Default !== null) throw new Error(`Unexpected clinics.${name} definition`);
    if (column.Type === 'varchar(3)') await connection.query(`ALTER TABLE clinics MODIFY COLUMN \`${name}\` VARCHAR(4) NULL DEFAULT NULL`);
  }
  const [constraints] = await connection.query('SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?', ['appointments']);
  if (!constraints.some(row => row.CONSTRAINT_NAME === 'chk_appointment_duration')) {
    await connection.query('ALTER TABLE appointments ADD CONSTRAINT chk_appointment_duration CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 1 AND 1440)');
  }
  const [checks] = await connection.query(`SELECT cc.CHECK_CLAUSE,tc.ENFORCED FROM information_schema.CHECK_CONSTRAINTS cc
    JOIN information_schema.TABLE_CONSTRAINTS tc ON tc.CONSTRAINT_SCHEMA=cc.CONSTRAINT_SCHEMA AND tc.CONSTRAINT_NAME=cc.CONSTRAINT_NAME
    WHERE cc.CONSTRAINT_SCHEMA=DATABASE() AND tc.TABLE_NAME='appointments' AND cc.CONSTRAINT_NAME='chk_appointment_duration'`);
  const normalized = checks[0]?.CHECK_CLAUSE.replace(/[`\s()]/g, '').toLowerCase();
  if (checks.length !== 1 || checks[0].ENFORCED !== 'YES' || normalized !== 'duration_minutesisnullorduration_minutesbetween1and1440') throw new Error('Unexpected or unenforced appointment duration constraint');
  await connection.query(`UPDATE appointments a JOIN clinics c ON c.clinic_id=a.clinic_id
    SET a.duration_minutes=CAST(c.clinic_average_appointment_time AS UNSIGNED)
    WHERE a.duration_minutes IS NULL AND c.clinic_average_appointment_time REGEXP '^[0-9]*[1-9][0-9]*$'
      AND CAST(c.clinic_average_appointment_time AS UNSIGNED) BETWEEN 1 AND 1440`);
  await connection.query(`CREATE TABLE IF NOT EXISTS clinic_doctor_specialties (
    clinic_id INT NOT NULL,
    doctor_id INT NOT NULL,
    specialty_id INT NOT NULL,
    PRIMARY KEY (clinic_id,doctor_id,specialty_id),
    KEY idx_clinic_doctor_specialties_doctor (doctor_id,clinic_id),
    CONSTRAINT fk_clinic_doctor_specialty_clinic FOREIGN KEY (clinic_id) REFERENCES clinics(clinic_id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_clinic_doctor_specialty_doctor FOREIGN KEY (doctor_id) REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_clinic_doctor_specialty_specialty FOREIGN KEY (specialty_id) REFERENCES specialties(specialty_id) ON UPDATE CASCADE ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  const [scopedColumns] = await connection.query('SHOW COLUMNS FROM clinic_doctor_specialties');
  if (scopedColumns.length !== 3 || ['clinic_id', 'doctor_id', 'specialty_id'].some(name => {
    const column = scopedColumns.find(value => value.Field === name);
    return !column || column.Type !== 'int' || column.Null !== 'NO';
  })) throw new Error('Unexpected clinic_doctor_specialties columns');
  const [indexes] = await connection.query('SHOW INDEX FROM clinic_doctor_specialties');
  for (const [name, fields, unique] of [['PRIMARY', ['clinic_id','doctor_id','specialty_id'], true], ['idx_clinic_doctor_specialties_doctor', ['doctor_id','clinic_id'], false]]) {
    const found = indexes.filter(row => row.Key_name === name).sort((a,b) => a.Seq_in_index-b.Seq_in_index);
    if (found.map(row => row.Column_name).join(',') !== fields.join(',') || found.some(row => Number(row.Non_unique) !== Number(!unique))) throw new Error(`Unexpected clinic_doctor_specialties index ${name}`);
  }
  const [foreignKeys] = await connection.query(`SELECT k.CONSTRAINT_NAME,k.COLUMN_NAME,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,r.UPDATE_RULE,r.DELETE_RULE
    FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r
      ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME
    WHERE k.TABLE_SCHEMA=DATABASE() AND k.TABLE_NAME='clinic_doctor_specialties'`);
  for (const [name, column, table, referenced] of [
    ['fk_clinic_doctor_specialty_clinic','clinic_id','clinics','clinic_id'],
    ['fk_clinic_doctor_specialty_doctor','doctor_id','users','user_id'],
    ['fk_clinic_doctor_specialty_specialty','specialty_id','specialties','specialty_id'],
  ]) {
    const found = foreignKeys.filter(row => row.CONSTRAINT_NAME === name);
    if (found.length !== 1 || found[0].COLUMN_NAME !== column || found[0].REFERENCED_TABLE_NAME !== table || found[0].REFERENCED_COLUMN_NAME !== referenced || found[0].UPDATE_RULE !== 'CASCADE' || found[0].DELETE_RULE !== 'CASCADE') throw new Error(`Unexpected clinic_doctor_specialties foreign key ${name}`);
  }
  await connection.query(`INSERT INTO clinic_doctor_specialties (clinic_id,doctor_id,specialty_id)
    SELECT cm.clinic_id,cm.user_id,ds.specialty_id FROM clinic_members cm JOIN doctor_specialties ds ON ds.doctor_id=cm.user_id
    WHERE cm.role_within_clinic IN ('Doctor','Admin')
    UNION SELECT c.clinic_id,c.clinic_owner,ds.specialty_id FROM clinics c JOIN doctor_specialties ds ON ds.doctor_id=c.clinic_owner
    ON DUPLICATE KEY UPDATE specialty_id=clinic_doctor_specialties.specialty_id`);
  await connection.query(`INSERT INTO clinic_specialties(clinic_id,specialty_id)
    SELECT DISTINCT clinic_id,specialty_id FROM clinic_doctor_specialties
    ON DUPLICATE KEY UPDATE specialty_id=clinic_specialties.specialty_id`);
}

module.exports = { up };
