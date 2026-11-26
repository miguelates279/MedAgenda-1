const columns = {
  appointment_status: "VARCHAR(20) NOT NULL DEFAULT 'scheduled'",
  status_version: 'INT UNSIGNED NOT NULL DEFAULT 0',
  status_updated_at: 'TIMESTAMP(6) NULL DEFAULT NULL',
};

async function up(connection) {
  const [existing] = await connection.query('SHOW COLUMNS FROM appointments');
  for (const [name, definition] of Object.entries(columns)) {
    if (!existing.some(column => column.Field === name)) {
      await connection.query(`ALTER TABLE appointments ADD COLUMN \`${name}\` ${definition}`);
    }
  }
  const [current] = await connection.query('SHOW COLUMNS FROM appointments');
  const expected = {
    appointment_status: ['varchar(20)', 'NO', 'scheduled'],
    status_version: ['int unsigned', 'NO', '0'],
    status_updated_at: ['timestamp(6)', 'YES', null],
  };
  for (const [name, [type, nullable, defaultValue]] of Object.entries(expected)) {
    const column = current.find(value => value.Field === name);
    if (!column || column.Type !== type || column.Null !== nullable || column.Default !== defaultValue) {
      throw new Error(`Unexpected definition for appointments.${name}`);
    }
  }
  const [constraints] = await connection.query(
    'SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',
    ['appointments'],
  );
  if (!constraints.some(row => row.CONSTRAINT_NAME === 'chk_appointment_status')) {
    await connection.query(`ALTER TABLE appointments ADD CONSTRAINT chk_appointment_status
      CHECK (appointment_status IN ('scheduled','confirmed','waiting','called','in_progress','completed','cancelled','no_show'))`);
  }
  const [checks] = await connection.query(`SELECT cc.CHECK_CLAUSE,tc.ENFORCED
    FROM information_schema.CHECK_CONSTRAINTS cc JOIN information_schema.TABLE_CONSTRAINTS tc
      ON tc.CONSTRAINT_SCHEMA=cc.CONSTRAINT_SCHEMA AND tc.CONSTRAINT_NAME=cc.CONSTRAINT_NAME
    WHERE cc.CONSTRAINT_SCHEMA=DATABASE() AND tc.TABLE_NAME='appointments' AND cc.CONSTRAINT_NAME='chk_appointment_status'`);
  const normalizedCheck = checks[0]?.CHECK_CLAUSE.replace(/\\+(?=')/g,'').replace(/(^|[\s,(])_[a-zA-Z0-9]+(?=')/g,'$1').replace(/[`"\s()]/g,'').toLowerCase();
  if (checks[0]?.ENFORCED!=='YES' || normalizedCheck!=="appointment_statusin'scheduled','confirmed','waiting','called','in_progress','completed','cancelled','no_show'") {
    throw new Error('Unexpected or unenforced appointment status constraint');
  }
  const [indexes] = await connection.query('SHOW INDEX FROM appointments');
  for (const [name, fields] of Object.entries({
    idx_appointments_clinic_day: ['clinic_id', 'scheduled_time_date', 'appointment_status'],
    idx_appointments_doctor_day: ['doctor_id', 'scheduled_time_date', 'appointment_status'],
    idx_appointments_patient_day: ['patient_id', 'scheduled_time_date'],
  })) {
    const existingFields = indexes.filter(row => row.Key_name === name)
      .sort((a,b) => a.Seq_in_index-b.Seq_in_index).map(row => row.Column_name);
    if (!existingFields.length) {
      await connection.query(`ALTER TABLE appointments ADD INDEX \`${name}\` (${fields.map(field => `\`${field}\``).join(',')})`);
    } else if (existingFields.join(',') !== fields.join(',')) {
      throw new Error(`Unexpected definition for appointments.${name}`);
    }
  }
  await connection.query(`CREATE TABLE IF NOT EXISTS appointment_status_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    appointment_id INT NOT NULL,
    from_status VARCHAR(20) NULL,
    to_status VARCHAR(20) NOT NULL,
    action VARCHAR(20) NOT NULL,
    actor_user_id INT NULL,
    occurred_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    version INT UNSIGNED NOT NULL,
    UNIQUE KEY uq_appointment_status_version (appointment_id,version),
    KEY idx_appointment_status_events_time (appointment_id,occurred_at),
    CONSTRAINT fk_appointment_status_event_appointment FOREIGN KEY (appointment_id)
      REFERENCES appointments(appointment_id) ON UPDATE CASCADE ON DELETE RESTRICT
  ) ENGINE=InnoDB`);
  const [eventColumns] = await connection.query('SHOW COLUMNS FROM appointment_status_events');
  const eventDefinitions={
    id:['bigint unsigned','NO'],appointment_id:['int','NO'],from_status:['varchar(20)','YES'],
    to_status:['varchar(20)','NO'],action:['varchar(20)','NO'],actor_user_id:['int','YES'],
    occurred_at:['timestamp(6)','NO'],version:['int unsigned','NO'],
  };
  for (const [name,[type,nullable]] of Object.entries(eventDefinitions)) {
    const column=eventColumns.find(value=>value.Field===name);
    if (!column || column.Type!==type || column.Null!==nullable) throw new Error(`Unexpected appointment_status_events.${name}`);
  }
  if(!eventColumns.find(column=>column.Field==='id').Extra.includes('auto_increment') ||
    eventColumns.find(column=>column.Field==='occurred_at').Default?.toLowerCase()!=='current_timestamp(6)') throw new Error('Unexpected event identity or timestamp default');
  const [eventIndexes]=await connection.query('SHOW INDEX FROM appointment_status_events');
  const unique=eventIndexes.filter(index=>index.Key_name==='uq_appointment_status_version').sort((a,b)=>a.Seq_in_index-b.Seq_in_index);
  if(unique.map(index=>index.Column_name).join(',')!=='appointment_id,version'||unique.some(index=>Number(index.Non_unique)!==0)) throw new Error('Missing unique appointment event version');
  const [foreignKeys]=await connection.query(`SELECT k.COLUMN_NAME,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,r.UPDATE_RULE,r.DELETE_RULE
    FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r
      ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME
    WHERE k.TABLE_SCHEMA=DATABASE() AND k.TABLE_NAME='appointment_status_events' AND k.CONSTRAINT_NAME='fk_appointment_status_event_appointment'`);
  const foreignKey=foreignKeys[0];
  if(foreignKeys.length!==1||foreignKey.COLUMN_NAME!=='appointment_id'||foreignKey.REFERENCED_TABLE_NAME!=='appointments'||foreignKey.REFERENCED_COLUMN_NAME!=='appointment_id'||foreignKey.UPDATE_RULE!=='CASCADE'||foreignKey.DELETE_RULE!=='RESTRICT') throw new Error('Unexpected appointment event foreign key');
}

module.exports = { up };
