const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');

const quote = value => `\`${String(value).replace(/`/g, '``')}\``;

async function backupDatabase(connection, directory, key) {
  if (!directory || !/^[a-f\d]{64}$/i.test(key || '')) {
    throw new Error('Pending migrations require --backup-dir and a 64-character hexadecimal MIGRATION_BACKUP_KEY');
  }
  const [identity] = await connection.query('SELECT DATABASE() AS database_name,@@session.time_zone AS time_zone,@@session.sql_mode AS sql_mode');
  const [tables] = await connection.query("SELECT TABLE_NAME,ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME");
  if (tables.some(table=>table.ENGINE!=='InnoDB')) throw new Error('Migration backup requires transactional InnoDB tables');
  const [objects] = await connection.query(`SELECT
    (SELECT COUNT(*) FROM information_schema.VIEWS WHERE TABLE_SCHEMA=DATABASE()) AS views,
    (SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE()) AS triggers,
    (SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE()) AS routines`);
  if (Object.values(objects[0]).some(value=>Number(value)!==0)) throw new Error('Back up views, triggers and routines before running this table migration');
  const backup = { database: identity[0].database_name, created_at: new Date().toISOString(), time_zone: '+00:00', sql_mode:identity[0].sql_mode, original_session_time_zone: identity[0].time_zone, scope:'base_tables',tables: [] };
  await connection.query("SET SESSION time_zone='+00:00'");
  await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
  try {
    for (const table of tables) {
      const name = table.TABLE_NAME;
      const [schema] = await connection.query(`SHOW CREATE TABLE ${quote(name)}`);
      const [rows] = await connection.query(`SELECT * FROM ${quote(name)}`);
      backup.tables.push({ name, schema: schema[0]['Create Table'], rows });
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.query('SET SESSION time_zone=?',[identity[0].time_zone]);
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(backup),'utf8'),cipher.final()]);
  const payload = Buffer.concat([Buffer.from('MEDAGENDA1'),iv,cipher.getAuthTag(),encrypted]);
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const filename = path.join(directory, `${backup.database}-${Date.now()}.enc`);
  fs.writeFileSync(filename,payload,{flag:'wx',mode:0o600});
  return { filename,sha256:crypto.createHash('sha256').update(payload).digest('hex'),tables:backup.tables.map(table=>({name:table.name,rows:table.rows.length})) };
}

async function runMigrations(connection, options = {}) {
  const [identity] = await connection.query('SELECT DATABASE() AS database_name');
  const database = identity[0].database_name;
  if (!database) throw new Error('An explicit database is required');
  const lock = `medagenda:migrations:${crypto.createHash('sha256').update(database).digest('hex').slice(0,32)}`;
  const [locks] = await connection.query('SELECT GET_LOCK(?,30) AS acquired',[lock]);
  if (Number(locks[0].acquired) !== 1) throw new Error('Could not obtain migration lock');
  try {
    const directory = path.resolve(__dirname,'../migrations');
    const files = fs.readdirSync(directory).filter(name=>/^\d{8}_\d+_[a-z_]+\.cjs$/.test(name)).sort();
    const [ledger] = await connection.query("SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='schema_migrations'");
    const applied = ledger.length ? (await connection.query('SELECT version,checksum FROM schema_migrations'))[0] : [];
    const pending = [];
    for (const file of files) {
      const checksum = crypto.createHash('sha256').update(fs.readFileSync(path.join(directory,file),'utf8').replace(/\r\n/g,'\n')).digest('hex');
      const previous = applied.find(row=>row.version===file);
      if (previous && previous.checksum !== checksum) throw new Error(`Migration checksum changed: ${file}`);
      if (!previous) pending.push({file,checksum});
    }
    if (!pending.length) return { database,applied:[],already_current:true };
    const backup = await backupDatabase(connection,options.backupDir,options.backupKey);
    await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(190) NOT NULL PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ) ENGINE=InnoDB`);
    for (const migration of pending) {
      await require(path.join(directory,migration.file)).up(connection);
      await connection.execute('INSERT INTO schema_migrations (version,checksum) VALUES (?,?)',[migration.file,migration.checksum]);
    }
    return { database,applied:pending.map(migration=>migration.file),backup };
  } finally {
    await connection.query('SELECT RELEASE_LOCK(?)',[lock]);
  }
}

async function main() {
  const env = path.resolve(__dirname,'../.env');
  if (fs.existsSync(env)) process.loadEnvFile(env);
  for (const key of ['DB_HOST','DB_PORT','DB_USER','DB_PASS','DB_NAME']) {
    if (!process.env[key]) throw new Error(`Missing ${key}`);
  }
  const ssl = process.env.DB_SSL === 'true' || process.env.DB_HOST.includes('aivencloud.com');
  const connection = await mysql.createConnection({
    host:process.env.DB_HOST,port:Number(process.env.DB_PORT),user:process.env.DB_USER,
    password:process.env.DB_PASS,database:process.env.DB_NAME,dateStrings:true,
    ...(ssl ? {ssl:{rejectUnauthorized:true,verifyIdentity:true,...(process.env.DB_SSL_CA ? {ca:fs.readFileSync(process.env.DB_SSL_CA)} : {})}} : {}),
  });
  try {
    const index = process.argv.indexOf('--backup-dir');
    console.log(JSON.stringify(await runMigrations(connection,{backupDir:index>=0 ? process.argv[index+1]:undefined,backupKey:process.env.MIGRATION_BACKUP_KEY}),null,2));
  } finally { await connection.end(); }
}

module.exports = {runMigrations,backupDatabase};
if (require.main === module) main().catch(error=>{
  console.error(error.code ? `Migration failed (${error.code})` : error.message);
  process.exitCode=1;
});
