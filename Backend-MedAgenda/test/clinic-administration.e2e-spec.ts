import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/db/database.service';
import { AppointmentsService } from '../src/appointments/appointments.service';
import { getClinicsWithSpecialtyInState } from '../src/clinics/repo/reads';

const enabled = process.env.WORKFLOW_INTEGRATION === '1';
const databaseName = process.env.DB_NAME ?? '';
const isolatedName = /^medagenda_workflow_qa_[a-zA-Z0-9_]+$/i;
if (enabled && !isolatedName.test(databaseName)) throw new Error('Clinic administration integration requires an isolated medagenda_workflow_qa_ database.');
const integration = enabled ? describe : describe.skip;
const BASE = Date.parse('2030-11-25T07:00:00-05:00');
const MINUTE = 60_000;
const at = (clock: string) => Date.parse(`2030-11-25T${clock}:00-05:00`);
const iso = (value: number) => new Date(value).toISOString();
const users = { owner: 9101, admin: 9102, doctor: 9103, employee: 9104, candidate: 9105, outsider: 9106, otherOwner: 9107, patient: 9108, peer: 9109 };
const clinics = { first: 9201, second: 9202, foreign: 9203 };
const specialty = { first: 9301, second: 9302 };
const email = (id: number) => `qa-admin-${id}@example.test`;

integration('Clinic administration HTTP and isolated MySQL integration', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let jwt: JwtService;
  let isolatedVerified = false;
  let cityId: number;
  let current = BASE;
  const guard = () => { if (!isolatedVerified) throw new Error('Refusing clinic fixture writes before isolated schema verification.'); };
  const write = (sql: string, parameters: unknown[] = []) => { guard(); return db.execute(sql, parameters); };
  const auth = (actor = users.owner, claims: Record<string, unknown> = {}) => jwt.sign({ sub: actor, email: email(actor), ...claims }, { expiresIn: '1h' });
  const get = (path: string, actor = users.owner) => request(app.getHttpServer()).get(path).auth(auth(actor), { type: 'bearer' });
  const put = (path: string, body: object, actor = users.owner) => request(app.getHttpServer()).put(path).auth(auth(actor), { type: 'bearer' }).send(body);
  const post = (path: string, body: object, actor = users.owner) => request(app.getHttpServer()).post(path).auth(auth(actor), { type: 'bearer' }).send(body);
  const remove = (path: string, actor = users.owner) => request(app.getHttpServer()).delete(path).auth(auth(actor), { type: 'bearer' });
  const management = (id = clinics.first) => `/clinics/${id}/management`;
  const roster = (id = clinics.first) => `/admin/clinic-users?clinic_id=${id}`;
  const role = (id: number, clinic = clinics.first) => db.query<{ role_within_clinic: string }>('SELECT role_within_clinic FROM clinic_members WHERE clinic_id=? AND user_id=?', [clinic, id]);
  const assign = (id = users.candidate, clinic = clinics.first, overrides: Record<string, unknown> = {}, actor = users.owner) => put('/admin/update-user-role', { clinic_id: clinic, email: email(id), isDoctor: false, isAdmin: false, ...overrides }, actor);
  const schedule = (start = at('10:00'), duration = 30) => post('/appointments/scheduleAppointment', { clinic_id: clinics.first, doctor_id: users.doctor, start_date_time: iso(start), end_date_time: iso(start + duration * MINUTE), appointment_description: 'QA Admin appointment' }, users.patient);
  const appointment = async (id: number) => (await db.query<{ duration_minutes: number | null; appointment_status: string; status_version: number; appointment_description: string; starts: number }>('SELECT duration_minutes,appointment_status,status_version,appointment_description,UNIX_TIMESTAMP(scheduled_time_date) AS starts FROM appointments WHERE appointment_id=?', [id]))[0];
  const seedAppointment = async (duration: number | null = 30, status = 'scheduled', start = at('10:00')) => {
    const inserted = await write('INSERT INTO appointments (clinic_id,patient_id,doctor_id,scheduled_time_date,appointment_description,appointment_status,status_version,duration_minutes) VALUES (?,?,?,FROM_UNIXTIME(?),?,?,0,?)', [clinics.first, users.patient, users.doctor, start / 1000, 'QA Admin original notes', status, duration]);
    return Number(inserted.insertId);
  };
  const cleanup = async () => {
    guard();
    const actorIds = Object.values(users);
    const actorMarks = actorIds.map(() => '?').join(',');
    const owned = await db.query<{ clinic_id: number }>(`SELECT clinic_id FROM clinics WHERE clinic_owner IN (${actorMarks}) AND clinic_name LIKE 'QA Admin%'`, actorIds);
    if (owned.length) {
      const ids = owned.map((item) => item.clinic_id);
      const marks = ids.map(() => '?').join(',');
      await write(`DELETE e FROM appointment_status_events e JOIN appointments a ON a.appointment_id=e.appointment_id WHERE a.clinic_id IN (${marks})`, ids);
      await write(`DELETE FROM appointments WHERE clinic_id IN (${marks})`, ids);
      await write(`DELETE FROM prescriptions WHERE clinic_id IN (${marks})`, ids);
      await write(`DELETE FROM absences WHERE clinic_id IN (${marks})`, ids);
      await write(`DELETE FROM clinic_doctor_specialties WHERE clinic_id IN (${marks})`, ids);
      await write(`DELETE FROM clinic_specialties WHERE clinic_id IN (${marks})`, ids);
      await write(`DELETE FROM clinic_members WHERE clinic_id IN (${marks})`, ids);
      await write(`DELETE FROM clinics WHERE clinic_id IN (${marks}) AND clinic_name LIKE 'QA Admin%'`, ids);
    }
    await write(`DELETE FROM doctor_specialties WHERE doctor_id IN (${actorMarks})`, actorIds);
    await write(`DELETE FROM users WHERE user_id IN (${actorMarks}) AND user_email_address LIKE 'qa-admin-%@example.test'`, actorIds);
    await write("DELETE FROM specialties WHERE specialty_id IN (?,?) AND specialty_name LIKE 'QA Admin%'", [specialty.first, specialty.second]);
  };
  const reset = async () => {
    await cleanup();
    for (const id of Object.values(users)) await write('INSERT INTO users (user_id,first_name,first_last_name,second_last_name,legal_id,password_hash,user_phone_number,user_email_address) VALUES (?,?,?,?,?,?,?,?)', [id, `QA ${id}`, 'Admin', 'Fixture', `qaadmin${id}`, 'unused-isolated-test-password', '3000000000', email(id)]);
    await write('INSERT INTO specialties (specialty_id,specialty_name) VALUES (?,?),(?,?)', [specialty.first, 'QA Admin general', specialty.second, 'QA Admin pediatria']);
    for (const [name, id] of Object.entries(clinics)) {
      await write("INSERT INTO clinics (clinic_id,clinic_name,is_open,clinic_phone_number,clinic_city_id,clinic_address,clinic_description,clinic_owner,clinic_opening_time,clinic_close_time,clinic_average_appointment_time,clinic_break_time,clinic_break_duration) VALUES (?,?,1,'+573001112233',?,'Calle QA 1','QA Admin description',?,'08:00','18:00','30','12:00','60')", [id, `QA Admin ${name}`, cityId, id === clinics.first ? users.owner : users.otherOwner]);
      await write('INSERT INTO clinic_specialties (clinic_id,specialty_id) VALUES (?,?),(?,?)', [id, specialty.first, id, specialty.second]);
    }
    for (const [clinicId, userId, membership] of [
      [clinics.first, users.admin, 'Admin'], [clinics.first, users.peer, 'Admin'], [clinics.first, users.doctor, 'Doctor'], [clinics.first, users.employee, 'Employee'], [clinics.first, users.candidate, 'Employee'],
      [clinics.second, users.owner, 'Admin'], [clinics.second, users.doctor, 'Doctor'], [clinics.second, users.candidate, 'Employee'],
    ]) await write('INSERT INTO clinic_members (clinic_id,user_id,role_within_clinic) VALUES (?,?,?)', [clinicId, userId, membership]);
    await write('INSERT INTO doctor_specialties (doctor_id,specialty_id) VALUES (?,?)', [users.doctor, specialty.first]);
    await write('INSERT INTO clinic_doctor_specialties (clinic_id,doctor_id,specialty_id) VALUES (?,?,?),(?,?,?)', [clinics.first, users.doctor, specialty.first, clinics.second, users.doctor, specialty.first]);
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    db = app.get(DatabaseService);
    const [identity] = await db.query<{ database_name: string; port: number }>('SELECT DATABASE() AS database_name,@@port AS port');
    if (!isolatedName.test(identity.database_name) || identity.database_name.toLowerCase() !== databaseName.toLowerCase() || Number(identity.port) !== 3317 || process.env.DB_HOST !== '127.0.0.1') throw new Error('Refusing clinic writes outside the verified local isolated schema.');
    const columns = await db.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='appointments' AND COLUMN_NAME='duration_minutes'");
    const tables = await db.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='clinic_doctor_specialties'");
    if (columns.length !== 1 || tables.length !== 1) throw new Error('Clinic administration tests require migration002 before fixture writes.');
    isolatedVerified = true;
    const [city] = await db.query<{ city_id: number }>('SELECT city_id FROM cities ORDER BY city_id LIMIT 1');
    cityId = city.city_id;
    jwt = new JwtService({ secret: process.env.JWT_SECRET });
  });
  beforeEach(async () => { current = BASE; jest.spyOn(Date, 'now').mockImplementation(() => current); await reset(); });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => { if (db && isolatedVerified) await cleanup(); if (app) await app.close(); });

  it('authenticates management and derives selected-clinic permissions from stored membership', async () => {
    await request(app.getHttpServer()).get(management()).expect(401);
    await request(app.getHttpServer()).get(management()).auth(auth(users.outsider, { isAdmin: true, role: 'Owner' }), { type: 'bearer' }).expect(403);
    const owned = await get(management()).expect(200);
    const administered = await get(management(clinics.second)).expect(200);
    expect(owned.body).toEqual(expect.objectContaining({ clinic_id: clinics.first, role_within_clinic: 'Owner', clinic_average_appointment_time: 30, specialty_ids: [specialty.first, specialty.second] }));
    expect(administered.body.role_within_clinic).toBe('Admin');
    expect((await get('/admin/my-clinics').expect(200)).body).toEqual(expect.arrayContaining([expect.objectContaining({ clinic_id: clinics.first, role_within_clinic: 'Owner' }), expect.objectContaining({ clinic_id: clinics.second, role_within_clinic: 'Admin' })]));
    for (const actor of [users.employee, users.doctor, users.outsider]) { await get(management(), actor).expect(403); await put(management(), { clinic_name: 'QA Admin denied' }, actor).expect(403); }
    await get(management(clinics.foreign)).expect(403);
    expect((await get(management()).expect(200)).body.clinic_name).toBe('QA Admin first');
  });

  it('requires an explicit clinic for member operations and returns only safe scoped fields', async () => {
    await get('/admin/clinic-users').expect(400);
    await get(`/admin/search-user?email=${email(users.candidate)}`).expect(400);
    await put('/admin/update-user-role', { email: email(users.candidate), isDoctor: false, isAdmin: false }).expect(400);
    const first = (await get(roster()).expect(200)).body;
    expect(first.some((user: { user_id: number; role_within_clinic: string }) => user.user_id === users.owner && user.role_within_clinic === 'Owner')).toBe(true);
    expect(first.every((user: { clinic_id: number; is_member: boolean }) => user.clinic_id === clinics.first && user.is_member)).toBe(true);
    for (const forbidden of ['password_hash', 'legal_id', 'birth_date', 'emergency_contact']) expect(JSON.stringify(first)).not.toContain(forbidden);
    await get(roster(clinics.second), users.admin).expect(403);
    const found = (await get(`/admin/search-user?clinic_id=${clinics.first}&email=${email(users.outsider)}`).expect(200)).body;
    expect(found).toEqual(expect.objectContaining({ user_id: users.outsider, role_within_clinic: null, is_member: false }));
    await get(`/admin/search-user?clinic_id=${clinics.first}&email=qa-admin-`).expect(400);
  });

  it('updates the selected second clinic without modifying membership in the first', async () => {
    await assign(users.candidate, clinics.second, { isDoctor: true, specialty_id: specialty.second }).expect(200);
    expect((await role(users.candidate, clinics.first))[0].role_within_clinic).toBe('Employee');
    expect((await role(users.candidate, clinics.second))[0].role_within_clinic).toBe('Doctor');
    const selected = (await get(roster(clinics.second)).expect(200)).body.find((user: { user_id: number }) => user.user_id === users.candidate);
    expect(selected).toEqual(expect.objectContaining({ specialty_id: specialty.second, isDoctor: true, is_member: true }));
    const first = (await get(roster()).expect(200)).body.find((user: { user_id: number }) => user.user_id === users.candidate);
    expect(first.isDoctor).toBe(false);
  });

  it.each([
    ['owner role', users.owner, {}, users.owner],
    ['self role', users.admin, {}, users.admin],
    ['peer admin role', users.peer, {}, users.admin],
    ['admin promotion', users.candidate, { isAdmin: true }, users.admin],
    ['admin promotion in second clinic', users.candidate, { isAdmin: true }, users.owner, clinics.second],
  ])('protects %s and leaves membership unchanged', async (_name, target, overrides, actor, clinic = clinics.first) => {
    const before = await db.query('SELECT * FROM clinic_members WHERE clinic_id=? ORDER BY user_id', [clinic]);
    await assign(target as number, clinic as number, overrides as Record<string, unknown>, actor as number).expect(403);
    expect(await db.query('SELECT * FROM clinic_members WHERE clinic_id=? ORDER BY user_id', [clinic])).toEqual(before);
  });

  it('lets only the owner promote or remove an administrator and preserves owner identity', async () => {
    await assign(users.candidate, clinics.first, { isAdmin: true }).expect(200);
    expect((await role(users.candidate))[0].role_within_clinic).toBe('Admin');
    await remove(`/admin/clinics/${clinics.first}/members/${users.candidate}`, users.admin).expect(403);
    await remove(`/admin/clinics/${clinics.first}/members/${users.candidate}`).expect(200);
    expect(await role(users.candidate)).toHaveLength(0);
    await remove(`/admin/clinics/${clinics.first}/members/${users.owner}`).expect(403);
    expect((await get(management()).expect(200)).body.clinic_owner).toBe(users.owner);
  });

  it('updates doctor specialties only in the selected clinic and preserves global credentials', async () => {
    await assign(users.doctor, clinics.first, { isDoctor: true, specialty_id: specialty.second }).expect(200);
    const scoped = await db.query<{ clinic_id: number; specialty_id: number }>('SELECT clinic_id,specialty_id FROM clinic_doctor_specialties WHERE doctor_id=? ORDER BY clinic_id', [users.doctor]);
    expect(scoped.map((row) => [row.clinic_id, row.specialty_id])).toEqual([[clinics.first, specialty.second], [clinics.second, specialty.first]]);
    expect(await db.query('SELECT specialty_id FROM doctor_specialties WHERE doctor_id=?', [users.doctor])).toEqual([{ specialty_id: specialty.first }]);
    const result = await request(app.getHttpServer()).get(`/clinics/getClinicDoctors?clinic_id=${clinics.first}`).expect(200);
    const provider = result.body.find((doctor: { doctor_id: number }) => doctor.doctor_id === users.doctor);
    expect(provider.specialties.map((item: { specialty_id: number }) => item.specialty_id)).toEqual([specialty.second]);
  });

  it.each([
    ['unknown specialty', { isDoctor: true, specialty_id: 999999 }],
    ['missing specialty', { isDoctor: true }],
    ['nonboolean privilege', { isAdmin: 'true' }],
    ['owner privilege injection', { role_within_clinic: 'Owner' }],
  ])('rejects member writes with %s without adding membership or specialty links', async (_name, invalid) => {
    await assign(users.outsider, clinics.first, invalid as Record<string, unknown>).expect(400);
    expect(await role(users.outsider)).toHaveLength(0);
    expect(await db.query('SELECT * FROM clinic_doctor_specialties WHERE doctor_id=?', [users.outsider])).toHaveLength(0);
    expect(await db.query('SELECT * FROM doctor_specialties WHERE doctor_id=?', [users.outsider])).toHaveLength(0);
  });

  it('rejects assigning a specialty not offered in the selected clinic and protects legacy mutation routes', async () => {
    await write('DELETE FROM clinic_specialties WHERE clinic_id=? AND specialty_id=?', [clinics.first, specialty.second]);
    await assign(users.outsider, clinics.first, { isDoctor: true, specialty_id: specialty.second }).expect(400);
    expect(await role(users.outsider)).toHaveLength(0);
    await request(app.getHttpServer()).post('/clinics/addSpecialtiesToClinic').send({ clinic_id: clinics.first, specialty_ids: [specialty.second] }).expect(401);
    await post('/clinics/addSpecialtiesToClinic', { clinic_id: clinics.first, specialty_ids: [specialty.second] }, users.employee).expect(403);
    await post('/clinics/addMemberToClinic', { clinic_id: clinics.first, user_id: users.outsider, role_within_clinic: 'Employee' }, users.outsider).expect(403);
    expect(await db.query('SELECT * FROM clinic_specialties WHERE clinic_id=? AND specialty_id=?', [clinics.first, specialty.second])).toHaveLength(0);
    expect(await role(users.outsider)).toHaveLength(0);
  });

  it('preserves the legacy doctor-by-user-id flow without requiring global specialty credentials', async () => {
    const body = { clinic_id: clinics.first, user_id: users.outsider, role_within_clinic: 'Doctor' };
    await request(app.getHttpServer()).post('/clinics/addMemberToClinic').send(body).expect(401);
    await post('/clinics/addMemberToClinic', body, users.employee).expect(403);
    await post('/clinics/addMemberToClinic', body).expect(201);
    expect((await role(users.outsider))[0].role_within_clinic).toBe('Doctor');
    expect(await db.query('SELECT * FROM doctor_specialties WHERE doctor_id=?', [users.outsider])).toHaveLength(0);
    expect(await db.query('SELECT * FROM clinic_doctor_specialties WHERE doctor_id=?', [users.outsider])).toHaveLength(0);
    const providers = (await request(app.getHttpServer()).get(`/clinics/getClinicDoctors?clinic_id=${clinics.first}`).expect(200)).body;
    expect(providers.find((doctor: { doctor_id: number }) => doctor.doctor_id === users.outsider)).toEqual(expect.objectContaining({ doctor_id: users.outsider, specialties: [] }));
    await post('/appointments/scheduleAppointment', { clinic_id: clinics.first, doctor_id: users.outsider, start_date_time: iso(at('11:00')), end_date_time: iso(at('11:30')) }, users.patient).expect(201);
    const saved = await db.query<{ doctor_id: number; duration_minutes: number }>('SELECT doctor_id,duration_minutes FROM appointments WHERE clinic_id=?', [clinics.first]);
    expect(saved).toEqual([{ doctor_id: users.outsider, duration_minutes: 30 }]);
  });

  it('rejects duplicate legacy membership without overwriting role or specialties and enforces administrator hierarchy', async () => {
    const before = await db.query('SELECT * FROM clinic_members WHERE clinic_id=? AND user_id=?', [clinics.first, users.doctor]);
    const specialtiesBefore = await db.query('SELECT * FROM clinic_doctor_specialties WHERE clinic_id=? AND doctor_id=?', [clinics.first, users.doctor]);
    await post('/clinics/addMemberToClinic', { clinic_id: clinics.first, user_id: users.doctor, role_within_clinic: 'Employee' }).expect(409);
    expect(await db.query('SELECT * FROM clinic_members WHERE clinic_id=? AND user_id=?', [clinics.first, users.doctor])).toEqual(before);
    expect(await db.query('SELECT * FROM clinic_doctor_specialties WHERE clinic_id=? AND doctor_id=?', [clinics.first, users.doctor])).toEqual(specialtiesBefore);
    await post('/clinics/addMemberToClinic', { clinic_id: clinics.first, user_id: users.outsider, role_within_clinic: 'Admin' }, users.admin).expect(403);
    await post('/clinics/addMemberToClinic', { clinic_id: clinics.first, user_id: users.owner, role_within_clinic: 'Employee' }).expect(403);
    expect(await role(users.outsider)).toHaveLength(0);
  });

  it('does not make an administrative-only member a public doctor and removes only that clinic membership', async () => {
    await assign(users.candidate, clinics.first, { isAdmin: true }).expect(200);
    let providers = (await request(app.getHttpServer()).get(`/clinics/getClinicDoctors?clinic_id=${clinics.first}`).expect(200)).body;
    expect(providers.some((doctor: { doctor_id: number }) => doctor.doctor_id === users.candidate)).toBe(false);
    await assign(users.candidate, clinics.first, { isAdmin: true, isDoctor: true, specialty_id: specialty.second }).expect(200);
    providers = (await request(app.getHttpServer()).get(`/clinics/getClinicDoctors?clinic_id=${clinics.first}`).expect(200)).body;
    expect(providers.some((doctor: { doctor_id: number }) => doctor.doctor_id === users.candidate)).toBe(true);
    expect(JSON.parse((await get('/doctors/isUserDoctorAnywhere', users.candidate).expect(200)).text)).toBe(true);
    await remove(`/admin/clinics/${clinics.first}/members/${users.candidate}`).expect(200);
    expect(await role(users.candidate, clinics.first)).toHaveLength(0);
    expect((await role(users.candidate, clinics.second))[0].role_within_clinic).toBe('Employee');
    expect((await get('/appointments/dispatch-clinics', users.candidate).expect(200)).body.some((item: { clinic_id: number }) => item.clinic_id === clinics.first)).toBe(false);
    expect(JSON.parse((await get('/doctors/isUserDoctorAnywhere', users.candidate).expect(200)).text)).toBe(false);
  });

  it.each(['scheduled', 'confirmed', 'waiting', 'called', 'in_progress'])('blocks removing or demoting a doctor with %s work', async (status) => {
    const id = await seedAppointment(30, status);
    await remove(`/admin/clinics/${clinics.first}/members/${users.doctor}`).expect(409);
    await assign(users.doctor).expect(409);
    expect((await role(users.doctor))[0].role_within_clinic).toBe('Doctor');
    expect((await appointment(id)).appointment_status).toBe(status);
  });

  it.each(['completed', 'cancelled', 'no_show'])('retains %s history when a doctor leaves and blocks later reservations', async (status) => {
    const id = await seedAppointment(30, status);
    await remove(`/admin/clinics/${clinics.first}/members/${users.doctor}`).expect(200);
    const retained = await get(`/appointments/${id}`, users.patient).expect(200);
    expect(retained.body).toEqual(expect.objectContaining({ appointment_id: id, doctor_id: users.doctor, appointment_status: status, start_date_time: iso(at('10:00')), end_date_time: iso(at('10:30')) }));
    await schedule(at('11:00')).expect(400);
    expect(await role(users.doctor, clinics.second)).toHaveLength(1);
  });

  it.each([
    ['invalid city', { clinic_city_id: 999999 }], ['invalid specialty', { specialty_ids: [999999] }],
    ['reversed hours', { clinic_close_time: '07:00' }], ['invalid clock', { clinic_opening_time: '25:00' }],
    ['zero duration', { clinic_average_appointment_time: 0 }], ['partial break', { clinic_break_time: null, clinic_break_duration: 60 }],
    ['break outside hours', { clinic_break_time: '17:45', clinic_break_duration: 60 }],
    ['owner injection', { clinic_owner: users.outsider }], ['unknown field', { administrative_override: true }],
  ])('rolls back data and schedule changes with %s', async (_name, invalid) => {
    const before = (await get(management()).expect(200)).body;
    await put(management(), { clinic_description: 'Must roll back', ...(invalid as object) }).expect(400);
    expect((await get(management()).expect(200)).body).toEqual(before);
  });

  it('blocks removing offered specialties that still have providers and rolls back clinic data', async () => {
    await put(management(), { specialty_ids: [specialty.second], clinic_description: 'Must roll back' }).expect(409);
    expect((await get(management()).expect(200)).body).toEqual(expect.objectContaining({ specialty_ids: [specialty.first, specialty.second], clinic_description: 'QA Admin description' }));
  });

  it('returns each clinic once when several offered specialties match public location filters', async () => {
    const [location] = await db.query<{ state_id: number; country_id: number }>('SELECT s.state_id,s.country_id FROM cities c JOIN states s ON s.state_id=c.state_id WHERE c.city_id=?', [cityId]);
    const ids = `${specialty.first},${specialty.second}`;
    const paths = [
      `/clinics/getAllClinicsWithSpecialty?specialty_ids=${ids}`,
      `/clinics/getAllClinicsWithSpecialtiesInCity?specialty_ids=${ids}&city_id=${cityId}`,
      `/clinics/getAllClinicsWithSpecialtiesInCountry?specialty_ids=${ids}&country_id=${location.country_id}`,
    ];
    const results: Array<Array<{ clinic_id: number }>> = [];
    for (const path of paths) results.push((await request(app.getHttpServer()).get(path).expect(200)).body);
    results.push(await getClinicsWithSpecialtyInState(db, [specialty.first, specialty.second], location.state_id));
    for (const result of results) {
      expect(result).toHaveLength(3);
      expect(result.map((clinic: { clinic_id: number }) => clinic.clinic_id).sort((a: number, b: number) => a-b)).toEqual(Object.values(clinics).sort((a,b) => a-b));
      expect(result.filter((clinic: { clinic_id: number }) => clinic.clinic_id === clinics.first)).toEqual([expect.objectContaining({ clinic_name: 'QA Admin first', clinic_city_id: cityId, clinic_address: 'Calle QA 1', clinic_phone_number: '+573001112233' })]);
    }
  });

  it.each([null, 30])('freezes old appointment duration %s before changing rules and uses new duration only for new or moved slots', async (stored) => {
    const id = await seedAppointment(stored);
    await put(management(), { clinic_name: 'QA Admin updated', clinic_average_appointment_time: 45, clinic_opening_time: '08:00', clinic_close_time: '18:00', clinic_break_time: '12:00', clinic_break_duration: 60 }).expect(200);
    expect(Number((await appointment(id)).duration_minutes)).toBe(30);
    const old = await get(`/appointments/${id}`, users.patient).expect(200);
    expect(old.body.end_date_time).toBe(iso(at('10:30')));
    const legacy = await get(`/clinics/getClinicDoctorAppointmentsForDay?clinic_id=${clinics.first}&doctor_id=${users.doctor}&appointment_date=2030-11-25`, users.patient).expect(200);
    expect(legacy.body.find((item: { appointment_id: number }) => item.appointment_id === id).end_date_time).toBe(iso(at('10:30')));
    const doctor = await get('/doctors/getDoctorAppointments', users.doctor).expect(200);
    expect(doctor.body.find((item: { appointment_id: number }) => item.appointment_id === id).end_date_time).toBe(iso(at('10:30')));
    const preview = await request(app.getHttpServer()).get(`/appointments/availability/day?clinic_id=${clinics.first}&doctor_id=${users.doctor}&date=2030-11-25`).expect(200);
    expect(preview.body.duration_minutes).toBe(45);
    expect(preview.body.slots.find((slot: { start_date_time: string }) => slot.start_date_time === iso(at('10:15'))).status).toBe('booked');
    await schedule(at('14:00'), 30).expect(400);
    await schedule(at('14:00'), 45).expect(201);
    await put(`/appointments/${id}`, { expected_version: 0, start_date_time: iso(at('15:30')), end_date_time: iso(at('16:15')) }, users.patient).expect(200);
    expect(Number((await appointment(id)).duration_minutes)).toBe(45);
    expect((await get(`/appointments/${id}`, users.patient).expect(200)).body.end_date_time).toBe(iso(at('16:15')));
  });

  it('closes a clinic without deleting, moving or rewriting existing appointment history', async () => {
    const id = await seedAppointment();
    const before = await appointment(id);
    await put(management(), { is_open: false }).expect(200);
    expect(await appointment(id)).toEqual(before);
    const preview = await request(app.getHttpServer()).get(`/appointments/availability/day?clinic_id=${clinics.first}&doctor_id=${users.doctor}&date=2030-11-25`).expect(200);
    expect(preview.body).toEqual(expect.objectContaining({ unavailable_reason: 'closed', slots: [] }));
    await schedule(at('11:00')).expect(400);
    await remove(`/clinics/${clinics.first}`).expect(409);
    expect((await get(`/appointments/${id}`, users.patient).expect(200)).body.appointment_id).toBe(id);
  });

  it('rejects an empty clinic patch and preserves all existing data when updating only descriptive text', async () => {
    await put(management(), {}).expect(400);
    const before = (await get(management()).expect(200)).body;
    const changed = await put(management(), { clinic_description: 'QA Admin text only' }).expect(200);
    expect(changed.body).toEqual({ ...before, clinic_description: 'QA Admin text only' });
  });

  it('marks an unchanged start as current after a duration change and rejects extending the appointment in place', async () => {
    const id = await seedAppointment(30, 'confirmed', at('14:00'));
    await put(management(), { clinic_average_appointment_time: 45 }).expect(200);
    const original = await appointment(id);
    const preview = await get(`/appointments/${id}/availability?date=2030-11-25`, users.patient).expect(200);
    const currentSlot = preview.body.slots.find((slot: { start_date_time: string }) => slot.start_date_time === iso(at('14:00')));
    expect(currentSlot).toEqual(expect.objectContaining({ end_date_time: iso(at('14:45')), status: 'current' }));
    await put(`/appointments/${id}`, { expected_version: 0, start_date_time: iso(at('14:00')), end_date_time: iso(at('14:45')), appointment_description: 'Must not extend or overwrite notes' }, users.patient).expect(400);
    expect(await appointment(id)).toEqual(original);
    expect(await db.query('SELECT action FROM appointment_status_events WHERE appointment_id=?', [id])).toHaveLength(0);
    expect((await get(`/appointments/${id}`, users.patient).expect(200)).body.end_date_time).toBe(iso(at('14:30')));
  });

  it('creates a closed clinic without rules, configures it explicitly and allows owner-only empty deletion', async () => {
    const created = await post('/clinics/createClinic', { clinic_name: 'QA Admin new', clinic_phone_number: '+573001112233', clinic_city_id: cityId, clinic_address: 'Calle QA 9' }).expect(201);
    const id = Number(created.body.clinic_id);
    expect(id).toBeGreaterThan(0);
    const initial = (await get(management(id)).expect(200)).body;
    expect(initial.is_open === false || initial.is_open === 0).toBe(true);
    await put(management(id), { is_open: true, clinic_opening_time: '08:00', clinic_close_time: '17:00', clinic_average_appointment_time: 30, clinic_break_time: null, clinic_break_duration: 0, specialty_ids: [specialty.first] }).expect(200);
    expect((await get(management(id)).expect(200)).body).toEqual(expect.objectContaining({ clinic_average_appointment_time: 30, specialty_ids: [specialty.first] }));
    await remove(`/clinics/${id}`, users.admin).expect(403);
    await remove(`/clinics/${id}`).expect(200);
    expect(await db.query('SELECT clinic_id FROM clinics WHERE clinic_id=?', [id])).toHaveLength(0);
  });

  it('lets a first-clinic owner activate their own provider profile without changing ownership, memberships or global credentials', async () => {
    const actor = users.patient;
    const created = await post('/clinics/createClinic', { clinic_name: 'QA Admin owner practice', clinic_phone_number: '+573001112233', clinic_city_id: cityId, clinic_address: 'Calle QA 10', clinic_opening_time: '08:00', clinic_close_time: '18:00', clinic_average_appointment_time: 30, clinic_break_duration: 0, specialty_ids: [specialty.first] }, actor).expect(201);
    const id = Number(created.body.clinic_id);
    const path = `/clinics/${id}/owner-provider`;
    expect((await get(management(id), actor).expect(200)).body.role_within_clinic).toBe('Owner');
    expect((await get('/admin/my-clinics', actor).expect(200)).body).toEqual(expect.arrayContaining([expect.objectContaining({ clinic_id: id, role_within_clinic: 'Owner' })]));
    const preview = `/appointments/availability/day?clinic_id=${id}&doctor_id=${actor}&date=2030-11-25`;
    await request(app.getHttpServer()).get(preview).expect(400);
    await assign(users.admin, id, { isAdmin: true }, actor).expect(200);
    for (const denied of [users.admin, users.outsider]) await put(path, { isDoctor: true, specialty_id: specialty.first }, denied).expect(403);
    await put(path, { isDoctor: true, specialty_id: specialty.first, owner_id: users.admin }, actor).expect(400);
    await put(path, { isDoctor: true, specialty_id: specialty.first }, actor).expect(200);
    expect((await get(management(id), actor).expect(200)).body.clinic_owner).toBe(actor);
    expect(await role(actor, id)).toHaveLength(0);
    expect(await db.query('SELECT * FROM doctor_specialties WHERE doctor_id=?', [actor])).toHaveLength(0);
    expect(JSON.parse((await get('/doctors/isUserDoctorAnywhere', actor).expect(200)).text)).toBe(true);
    const providers = (await request(app.getHttpServer()).get(`/clinics/getClinicDoctors?clinic_id=${id}`).expect(200)).body;
    expect(providers.find((doctor: { doctor_id: number }) => doctor.doctor_id === actor)).toEqual(expect.objectContaining({ doctor_id: actor, specialties: [expect.objectContaining({ specialty_id: specialty.first })] }));
    await request(app.getHttpServer()).get(preview).expect(200);
    const appointments: { appointment_id: number; patient_id: number }[] = [];
    for (const [patient, start] of [[users.owner, at('10:00')], [actor, at('11:00')]]) {
      await post('/appointments/scheduleAppointment', { clinic_id: id, doctor_id: actor, start_date_time: iso(start), end_date_time: iso(start + 30 * MINUTE), appointment_description: 'QA Admin owner provider' }, patient).expect(201);
      const saved = await db.query<{ appointment_id: number; patient_id: number }>('SELECT appointment_id,patient_id FROM appointments WHERE clinic_id=? AND patient_id=?', [id, patient]);
      expect(saved).toHaveLength(1);
      appointments.push(saved[0]);
    }
    await put(path, { isDoctor: false }, actor).expect(409);
    await assign(actor, id, {}, actor).expect(403);
    for (const item of appointments) await post(`/appointments/${item.appointment_id}/actions`, { action: 'cancel', expected_version: 0 }, item.patient_id).expect(200);
    await put(path, { isDoctor: false }, actor).expect(200);
    expect((await get(management(id), actor).expect(200)).body).toEqual(expect.objectContaining({ clinic_owner: actor, role_within_clinic: 'Owner' }));
    expect(await role(actor, id)).toHaveLength(0);
    expect(await db.query('SELECT * FROM doctor_specialties WHERE doctor_id=?', [actor])).toHaveLength(0);
    expect(JSON.parse((await get('/doctors/isUserDoctorAnywhere', actor).expect(200)).text)).toBe(false);
    await request(app.getHttpServer()).get(preview).expect(400);
    await post('/appointments/scheduleAppointment', { clinic_id: id, doctor_id: actor, start_date_time: iso(at('14:00')), end_date_time: iso(at('14:30')) }, users.owner).expect(400);
  });

  it.each(['schedule edit', 'doctor removal'])('serializes %s against a booking already validating its original clinic policy', async (mutation) => {
    const service = app.get(AppointmentsService);
    const original = service.isDoctorAvailable.bind(service);
    let signalEntered = () => {};
    let release = () => {};
    const entered = new Promise<void>((resolve) => { signalEntered = resolve; });
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    jest.spyOn(service, 'isDoctorAvailable').mockImplementation(async (...parameters) => {
      signalEntered();
      await blocked;
      return original(...parameters);
    });
    const booking = schedule().then((result) => result);
    let pending: Promise<request.Response> | undefined;
    let finished = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([entered, new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Booking never reached its validation barrier.')), 5000); })]);
      clearTimeout(timeout);
      pending = (mutation === 'schedule edit'
        ? put(management(), { clinic_average_appointment_time: 45 })
        : remove(`/admin/clinics/${clinics.first}/members/${users.doctor}`))
        .then((result) => { finished = true; return result; });
      await new Promise((resolve) => setTimeout(resolve, 120));
      expect(finished).toBe(false);
      release();
      expect((await booking).status).toBe(201);
      expect((await pending).status).toBe(mutation === 'schedule edit' ? 200 : 409);
      const saved = await db.query<{ appointment_id: number; duration_minutes: number; clinic_id: number; doctor_id: number }>('SELECT appointment_id,duration_minutes,clinic_id,doctor_id FROM appointments WHERE clinic_id=?', [clinics.first]);
      expect(saved).toHaveLength(1);
      expect(Number(saved[0].duration_minutes)).toBe(30);
      expect((await role(users.doctor))[0].role_within_clinic).toBe('Doctor');
      expect((await get(`/appointments/${saved[0].appointment_id}`, users.patient).expect(200)).body.end_date_time).toBe(iso(at('10:30')));
    } finally {
      clearTimeout(timeout);
      release();
      await Promise.allSettled([booking, ...(pending ? [pending] : [])]);
    }
  });
});
