import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/db/database.service';

const enabled = process.env.WORKFLOW_INTEGRATION === '1';
const databaseName = process.env.DB_NAME ?? '';
const isolatedName = /^medagenda_workflow_qa_[a-zA-Z0-9_]+$/i;
if (enabled && !isolatedName.test(databaseName)) throw new Error('Prescription document integration requires an isolated medagenda_workflow_qa_ database.');
const integration = enabled ? describe : describe.skip;
const users = { owner: 9601, admin: 9602, doctor: 9603, otherDoctor: 9604, patient: 9605, otherPatient: 9606, outsider: 9607, employee: 9608 };
const clinics = { first: 9701, second: 9702 };
const email = (id: number) => `qa-pdf-${id}@example.test`;
const emitted = Date.parse('2026-11-25T12:34:56Z') / 1000;
const description = 'Contenido ficticio: á é í ó ú ü ñ ¿? ¡! ≤ ≥ ±\n<script>alert("sin ejecutar")</script> & <img src="https://example.test/no-cargar.png">\nConservar el texto y sus saltos.';

integration('Prescription document HTTP and isolated MySQL integration', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let jwt: JwtService;
  let isolatedVerified = false;
  let cityId: number;
  let prescriptionId: number;
  const guard = () => { if (!isolatedVerified) throw new Error('Refusing prescription fixture writes before isolated verification.'); };
  const write = (sql: string, parameters: unknown[] = []) => { guard(); return db.execute(sql, parameters); };
  const auth = (actor = users.patient, claims: Record<string, unknown> = {}) => jwt.sign({ sub: actor, email: email(actor), ...claims }, { expiresIn: '1h' });
  const get = (id: number | string = prescriptionId, actor = users.patient, claims: Record<string, unknown> = {}) => request(app.getHttpServer()).get(`/prescriptions/${encodeURIComponent(String(id))}/document`).auth(auth(actor, claims), { type: 'bearer' });
  const cleanup = async () => {
    guard();
    const actorIds = Object.values(users);
    const marks = actorIds.map(() => '?').join(',');
    const owned = await db.query<{ clinic_id: number }>("SELECT clinic_id FROM clinics WHERE clinic_id IN (?,?) AND clinic_name LIKE 'QA PDF%' AND clinic_owner=?", [clinics.first, clinics.second, users.owner]);
    for (const row of owned) {
      await write('DELETE e FROM appointment_status_events e JOIN appointments a ON a.appointment_id=e.appointment_id WHERE a.clinic_id=?', [row.clinic_id]);
      await write('DELETE FROM appointments WHERE clinic_id=?', [row.clinic_id]);
      await write('DELETE FROM prescriptions WHERE clinic_id=?', [row.clinic_id]);
      await write('DELETE FROM clinic_members WHERE clinic_id=?', [row.clinic_id]);
      await write("DELETE FROM clinics WHERE clinic_id=? AND clinic_name LIKE 'QA PDF%'", [row.clinic_id]);
    }
    await write(`DELETE FROM users WHERE user_id IN (${marks}) AND user_email_address LIKE 'qa-pdf-%@example.test'`, actorIds);
  };
  const seedPrescription = async (clinicId = clinics.first, doctorId = users.doctor, patientId = users.patient, text = description) => {
    const row = await write('INSERT INTO prescriptions(doctor_id,clinic_id,patient_id,prescription_description,date_emitted) VALUES(?,?,?,?,FROM_UNIXTIME(?))', [doctorId, clinicId, patientId, text, emitted]);
    return Number(row.insertId);
  };
  const reset = async () => {
    await cleanup();
    for (const id of Object.values(users)) await write('INSERT INTO users(user_id,first_name,second_name,first_last_name,second_last_name,legal_id,password_hash,user_phone_number,user_email_address) VALUES(?,?,?,?,?,?,?,?,?)', [id, id === users.doctor ? 'Camila' : id === users.patient ? 'María' : 'Prueba', id === users.doctor ? 'Inés' : id === users.patient ? 'José' : null, id === users.doctor ? 'Muñoz' : 'Pérez', id === users.doctor ? 'Güiza' : 'Niño', `qapdf${id}`, 'unused-isolated-test-password', '3000000000', email(id)]);
    for (const id of Object.values(clinics)) await write("INSERT INTO clinics(clinic_id,clinic_name,is_open,clinic_phone_number,clinic_city_id,clinic_address,clinic_owner,clinic_opening_time,clinic_close_time,clinic_average_appointment_time) VALUES(?,?,1,?,?,?,?,'08:00','18:00','30')", [id, `QA PDF & <Sede ${id}>`, '+573001112233', cityId, 'Carrera 8 # 45–23 · Prueba', users.owner]);
    for (const [actor, role] of [[users.admin, 'Admin'], [users.doctor, 'Doctor'], [users.otherDoctor, 'Doctor'], [users.employee, 'Employee']] as const) await write('INSERT INTO clinic_members(clinic_id,user_id,role_within_clinic) VALUES(?,?,?)', [clinics.first, actor, role]);
    prescriptionId = await seedPrescription();
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    db = app.get(DatabaseService);
    const [identity] = await db.query<{ database_name: string; port: number; datadir: string }>('SELECT DATABASE() AS database_name,@@port AS port,@@datadir AS datadir');
    if (!isolatedName.test(identity.database_name) || identity.database_name.toLowerCase() !== databaseName.toLowerCase() || Number(identity.port) !== 3317 || process.env.DB_HOST !== '127.0.0.1' || !identity.datadir.replace(/\\/g, '/').toLowerCase().replace(/\/$/, '').endsWith('/medagenda-movil/dist/workflow/mysql-local/data')) throw new Error('Refusing prescription writes outside the verified local isolated schema.');
    isolatedVerified = true;
    const [city] = await db.query<{ city_id: number }>('SELECT city_id FROM cities ORDER BY city_id LIMIT 1');
    cityId = city.city_id;
    jwt = new JwtService({ secret: process.env.JWT_SECRET });
  });
  beforeEach(reset);
  afterAll(async () => { if (db && isolatedVerified) await cleanup(); if (app) await app.close(); });

  it('requires authentication before reading a saved document', async () => {
    await request(app.getHttpServer()).get(`/prescriptions/${prescriptionId}/document`).expect(401);
    await request(app.getHttpServer()).get(`/prescriptions/${prescriptionId}/document`).auth('invalid-token', { type: 'bearer' }).expect(401);
  });

  it.each([['patient', users.patient], ['author', users.doctor]])('returns the exact saved document to its %s with private cache headers', async (_label, actor) => {
    const result = await get(prescriptionId, actor).expect(200);
    expect(result.headers['cache-control']).toContain('no-store');
    expect(result.headers['cache-control']).toContain('private');
    expect(result.body).toEqual({ prescription_id: prescriptionId, clinic_id: clinics.first, clinic_name: `QA PDF & <Sede ${clinics.first}>`, clinic_address: 'Carrera 8 # 45–23 · Prueba', clinic_phone: '+573001112233', doctor_id: users.doctor, doctor_name: 'Camila Inés Muñoz Güiza', patient_id: users.patient, patient_name: 'María José Pérez Niño', date_emitted: '2026-11-25T12:34:56.000Z', prescription_description: description });
    expect(Object.keys(result.body).some(key => /password|email|legal|birth|emergency/i.test(key))).toBe(false);
  });

  it.each([['owner', users.owner], ['administrator', users.admin], ['other doctor', users.otherDoctor], ['other patient', users.otherPatient], ['employee', users.employee], ['outsider', users.outsider]])('rejects document access by an unrelated %s', async (_label, actor) => {
    await get(prescriptionId, actor, { isAdmin: true, role: 'Owner', patient_id: users.patient, doctor_id: users.doctor }).expect(403);
  });

  it.each(['0', '-1', '1.2', '1e2', 'abc', '9007199254740992', '1 OR 1=1'])('rejects invalid document identifier %s', async id => {
    await get(id).expect(400);
  });

  it('returns 404 for a valid but missing prescription', async () => {
    await get(2_000_000_000).expect(404);
  });

  it('uses each saved clinic and patient instead of caller-provided query parameters', async () => {
    const second = await seedPrescription(clinics.second, users.doctor, users.patient, 'Segunda sede');
    const other = await seedPrescription(clinics.first, users.otherDoctor, users.otherPatient, 'Otra relación médica');
    const selected = await get(second).expect(200);
    expect(selected.body).toEqual(expect.objectContaining({ clinic_id: clinics.second, clinic_name: `QA PDF & <Sede ${clinics.second}>`, prescription_description: 'Segunda sede' }));
    await get(second, users.doctor).expect(200);
    await get(other).expect(403);
    await get(other, users.doctor).expect(403);
    await request(app.getHttpServer()).get(`/prescriptions/${other}/document?patient_id=${users.patient}&doctor_id=${users.doctor}&clinic_id=${clinics.first}`).auth(auth(), { type: 'bearer' }).expect(403);
  });

  it('refetches edited content and makes deleted prescriptions unavailable', async () => {
    const updated = 'Fórmula actualizada & <b>texto literal</b>\nÚltima línea íntegra.';
    await request(app.getHttpServer()).put(`/prescriptions/${prescriptionId}`).auth(auth(users.doctor), { type: 'bearer' }).send({ prescription_description: updated }).expect(200);
    const document = await get().expect(200);
    expect(document.body.prescription_description).toBe(updated);
    expect(document.body.date_emitted).toBe('2026-11-25T12:34:56.000Z');
    await request(app.getHttpServer()).delete(`/prescriptions/${prescriptionId}`).auth(auth(users.doctor), { type: 'bearer' }).expect(200);
    await get().expect(404);
  });

  it('preserves already-issued documents when clinic membership changes without granting a replacement doctor access', async () => {
    await write('DELETE FROM clinic_members WHERE clinic_id=? AND user_id=?', [clinics.first, users.doctor]);
    await get(prescriptionId, users.doctor).expect(200);
    await get(prescriptionId, users.patient).expect(200);
    await get(prescriptionId, users.otherDoctor).expect(403);
  });

  it('returns a large saved prescription without truncation or interpreting HTML', async () => {
    const long = Array.from({ length: 120 }, (_, index) => `${index}: á, ñ, ü, <script>sin ejecutar</script>, & datos ficticios. ${'sinseparadores'.repeat(10)}`).join('\n');
    await write('UPDATE prescriptions SET prescription_description=? WHERE prescription_id=?', [long, prescriptionId]);
    const result = await get().expect(200);
    expect(result.body.prescription_description).toBe(long);
    expect(result.body.prescription_description).toContain('119:');
  });

  it('blocks documents with a missing saved issue date after authorizing access', async () => {
    await write('UPDATE prescriptions SET date_emitted=NULL WHERE prescription_id=?', [prescriptionId]);
    for (const actor of [users.patient, users.doctor]) {
      const result = await get(prescriptionId, actor).expect(409);
      expect(result.body.message).toContain('fecha de emisión válida');
      expect(result.body).not.toHaveProperty('date_emitted');
    }
    for (const actor of [users.owner, users.admin, users.otherDoctor, users.otherPatient, users.outsider]) await get(prescriptionId, actor).expect(403);
    await write('UPDATE prescriptions SET date_emitted=FROM_UNIXTIME(?) WHERE prescription_id=?', [emitted, prescriptionId]);
    expect((await get().expect(200)).body.date_emitted).toBe('2026-11-25T12:34:56.000Z');
  });

  it('keeps patient prescription lists scoped to their own records across authors', async () => {
    const otherAuthor = await seedPrescription(clinics.first, users.otherDoctor, users.patient, 'Mismo paciente, otro autor');
    const otherPatient = await seedPrescription(clinics.first, users.doctor, users.otherPatient, 'Otro paciente');
    const result = await request(app.getHttpServer()).get('/prescriptions/getUserPrescriptions').auth(auth(users.patient), { type: 'bearer' }).expect(200);
    const ids = result.body.map((row: { prescription_id: number }) => row.prescription_id);
    expect(ids).toEqual(expect.arrayContaining([prescriptionId, otherAuthor]));
    expect(ids).not.toContain(otherPatient);
  });

  it('keeps doctor prescription lists scoped to authored records without exposing another author', async () => {
    const otherAuthor = await seedPrescription(clinics.first, users.otherDoctor, users.patient, 'Otro autor');
    const result = await request(app.getHttpServer()).get('/prescriptions/getPrescriptionsAssignedByDoctor').auth(auth(users.doctor), { type: 'bearer' }).expect(200);
    const ids = result.body.map((row: { prescription_id: number }) => row.prescription_id);
    expect(ids).toContain(prescriptionId);
    expect(ids).not.toContain(otherAuthor);
  });

  it('limits clinical appointment history to completed care by the requesting doctor with current clinic membership', async () => {
    for (const [doctor, status, notes] of [[users.doctor, 'completed', 'QA PDF atención propia completada'], [users.otherDoctor, 'completed', 'QA PDF atención ajena'], [users.doctor, 'in_progress', 'QA PDF atención propia activa']] as const) await write('INSERT INTO appointments(clinic_id,patient_id,doctor_id,scheduled_time_date,duration_minutes,appointment_description,appointment_status,status_version) VALUES(?,?,?,FROM_UNIXTIME(?),30,?,?,0)', [clinics.first, users.patient, doctor, emitted, notes, status]);
    const history = () => request(app.getHttpServer()).get('/doctors/getDoctorPatientHistories').auth(auth(users.doctor), { type: 'bearer' });
    const first = await history().expect(200);
    expect(first.body).toHaveLength(1);
    expect(first.body[0]).toEqual(expect.objectContaining({ user_id: users.patient, clinic_id: clinics.first, appointment_description: 'QA PDF atención propia completada', appointment_date: '2026-11-25T12:34:56.000Z' }));
    await write('DELETE FROM clinic_members WHERE clinic_id=? AND user_id=?', [clinics.first, users.doctor]);
    expect((await history().expect(200)).body).toEqual([]);
  });
});
