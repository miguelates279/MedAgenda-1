import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/db/database.service';
import type { AppointmentAction, AppointmentStatus } from '../src/appointments/appointment-workflow';

const enabled = process.env.WORKFLOW_INTEGRATION === '1';
const databaseName = process.env.DB_NAME ?? '';
if (enabled && !/^MedAgenda_workflow_qa_[a-zA-Z0-9_]+$/.test(databaseName)) {
  throw new Error('Appointment integration tests require an isolated MedAgenda_workflow_qa_ database.');
}
const integration = enabled ? describe : describe.skip;
const DAY = 86_400_000;
const MINUTE = 60_000;
const clinicDay = (time: number) => new Date(time - 5 * 60 * MINUTE).toISOString().slice(0, 10);
const todayAt = (minute: number) => Date.parse(`${clinicDay(Date.now())}T00:00:00-05:00`) + minute * MINUTE;
const futureSlot = (minute = 480) => {
  let time = todayAt(minute) + DAY;
  while ([0, 6].includes(new Date(time - 5 * 60 * MINUTE).getUTCDay())) time += DAY;
  return time;
};

integration('Appointment workflow HTTP and MySQL integration', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let jwt: JwtService;
  let isolatedVerified = false;
  const token = (actorId: number, claims: Record<string, unknown> = {}) => jwt.sign({
    sub: actorId, email: `workflow-${actorId}@example.test`, ...claims,
  }, { expiresIn: '1h' });
  const get = (path: string, actorId = 201) => request(app.getHttpServer()).get(path).auth(token(actorId), { type: 'bearer' });
  const act = (id: number, actorId: number, action: AppointmentAction, expected_version: number) =>
    request(app.getHttpServer()).post(`/appointments/${id}/actions`).auth(token(actorId), { type: 'bearer' }).send({ action, expected_version });
  const update = (id: number, actorId: number, body: object) =>
    request(app.getHttpServer()).put(`/appointments/${id}`).auth(token(actorId), { type: 'bearer' }).send(body);
  const cancel = (id: number, actorId = 201) => request(app.getHttpServer()).delete(`/appointments/${id}`).auth(token(actorId), { type: 'bearer' });
  const create = (actorId: number, startsAt: number, overrides: Record<string, unknown> = {}) =>
    request(app.getHttpServer()).post('/appointments/scheduleAppointment').auth(token(actorId), { type: 'bearer' }).send({
      clinic_id: 101, doctor_id: 101,
      start_date_time: new Date(startsAt).toISOString(),
      end_date_time: new Date(startsAt + 30 * MINUTE).toISOString(),
      appointment_description: 'Isolated appointment workflow test', ...overrides,
    });
  const seed = async ({
    id = 1000, status = 'scheduled', startsAt = todayAt(480), doctorId = 101, clinicId = 101, patientId = 201,
  }: { id?: number; status?: AppointmentStatus; startsAt?: number; doctorId?: number; clinicId?: number; patientId?: number } = {}) => {
    await db.execute(
      `INSERT INTO appointments (appointment_id,clinic_id,patient_id,doctor_id,scheduled_time_date,appointment_description,appointment_status,status_version,status_updated_at)
       VALUES (?,?,?,?,FROM_UNIXTIME(?),?,?,0,NULL)`,
      [id, clinicId, patientId, doctorId, startsAt / 1000, 'Isolated workflow fixture', status],
    );
  };
  const events = (id = 1000) => db.query<{
    appointment_id: number; from_status: AppointmentStatus | null; to_status: AppointmentStatus;
    action: string; actor_user_id: number; version: number;
  }>('SELECT appointment_id,from_status,to_status,action,actor_user_id,version FROM appointment_status_events WHERE appointment_id = ? ORDER BY version', [id]);
  const row = async (id = 1000) => (await db.query<{
    appointment_status: AppointmentStatus; status_version: number; appointment_description: string;
    starts_at_seconds: number; status_updated_at: string | null;
  }>('SELECT appointment_status,status_version,appointment_description,UNIX_TIMESTAMP(scheduled_time_date) AS starts_at_seconds,status_updated_at FROM appointments WHERE appointment_id = ?', [id]))[0];
  const slots = (startsAt: number, doctorId = 101, clinicId = 101) => get(
    `/clinics/getClinicDoctorAppointmentsForDay?clinic_id=${clinicId}&doctor_id=${doctorId}&appointment_date=${clinicDay(startsAt)}`,
  );

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    db = app.get(DatabaseService);
    const [identity] = await db.query<{ database_name: string }>('SELECT DATABASE() AS database_name');
    if (identity.database_name !== databaseName || !identity.database_name.startsWith('MedAgenda_workflow_qa_')) {
      throw new Error('Refusing to mutate a database outside the isolated appointment test schema.');
    }
    isolatedVerified = true;
    jwt = new JwtService({ secret: process.env.JWT_SECRET });
  });

  beforeEach(async () => {
    if (!isolatedVerified) throw new Error('Isolated schema was not verified.');
    await db.execute('DELETE FROM appointment_status_events WHERE appointment_id >= 1000 AND appointment_id < 2000');
    await db.execute('DELETE FROM appointments WHERE appointment_id >= 1000 AND appointment_id < 2000');
    await db.execute('UPDATE clinics SET is_open = TRUE WHERE clinic_id IN (101,102)');
  });

  afterAll(async () => {
    if (db && isolatedVerified) {
      await db.execute('DELETE FROM appointment_status_events WHERE appointment_id >= 1000 AND appointment_id < 2000');
      await db.execute('DELETE FROM appointments WHERE appointment_id >= 1000 AND appointment_id < 2000');
      await db.execute('UPDATE clinics SET is_open = TRUE WHERE clinic_id IN (101,102)');
    }
    if (app) await app.close();
  });

  it('requires authentication and accepts a real fixture login without trusting client role claims', async () => {
    await request(app.getHttpServer()).get('/appointments/patient').expect(401);
    await request(app.getHttpServer()).post('/appointments/1000/actions').send({ action: 'call', expected_version: 0 }).expect(401);
    const [patient] = await db.query<{ user_email_address: string }>('SELECT user_email_address FROM users WHERE user_id=201');
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email: patient.user_email_address, password: 'layout123' }).expect(201);
    expect(jwt.verify<{ sub: number }>(login.body.token).sub).toBe(201);
    await seed();
    await request(app.getHttpServer()).post('/appointments/1000/actions')
      .auth(token(401, { isDoctor: true, isAdmin: true, role: 'Owner' }), { type: 'bearer' })
      .send({ action: 'call', expected_version: 0 }).expect(404);
    const expired = jwt.sign({ sub: 201 }, { expiresIn: '-1s' });
    await request(app.getHttpServer()).get('/appointments/patient').auth(expired, { type: 'bearer' }).expect(401);
  });

  it.each([
    {}, { action: 'call' }, { action: null, expected_version: 0 }, { action: 'finished', expected_version: 0 },
    { action: 'call', expected_version: null }, { action: 'call', expected_version: -1 },
    { action: 'call', expected_version: 0.5 }, { action: 'call', expected_version: '0' },
    { action: 'call', expected_version: 0, appointment_status: 'completed' },
  ])('rejects invalid workflow payloads before touching the appointment: %j', async body => {
    await seed();
    await request(app.getHttpServer()).post('/appointments/1000/actions').auth(token(101), { type: 'bearer' }).send(body).expect(400);
    expect((await row()).status_version).toBe(0);
    expect(await events()).toEqual([]);
  });

  it('isolates patient, doctor and reception access by appointment and clinic', async () => {
    await seed();
    await seed({ id: 1001, clinicId: 102 });
    for (const actor of [202, 102, 401]) {
      await get('/appointments/1000', actor).expect(404);
      await act(1000, actor, 'call', 0).expect(404);
      await update(1000, actor, { appointment_description: 'Unauthorized edit' }).expect(404);
      await cancel(1000, actor).expect(404);
    }
    await get('/appointments/1001', 302).expect(404);
    await act(1001, 302, 'call', 0).expect(404);
    await get(`/appointments/clinic/102?date=${clinicDay(Date.now())}`, 302).expect(404);
    const dispatch = await get('/appointments/dispatch-clinics', 302).expect(200);
    expect(dispatch.body).toEqual([expect.objectContaining({ clinic_id: 101, role_within_clinic: 'Employee' })]);
    const patientDispatch = await get('/appointments/dispatch-clinics', 201).expect(200);
    expect(patientDispatch.body).toEqual([]);
    const reception = await get(`/appointments/clinic/101?date=${clinicDay(Date.now())}`, 302).expect(200);
    expect(reception.body.map((item: { appointment_id: number }) => item.appointment_id)).toEqual([1000]);
    expect(reception.body[0]).toEqual(expect.objectContaining({ patient_id: 201, doctor_id: 101, clinic_id: 101 }));
    expect(reception.body[0].doctor_first_name).toEqual(expect.any(String));
    const otherDoctor = await get('/doctors/getDoctorAppointments', 102).expect(200);
    expect(otherDoctor.body).toEqual([]);
    const ownPatient = await get('/appointments/patient', 202).expect(200);
    expect(ownPatient.body).toEqual([]);
    await get('/appointments/clinic/101?date=2026-02-30', 301).expect(400);
    await get('/appointments/clinic/101', 301).expect(400);
  });

  it('confirms a future appointment and rejects arrival on another clinic day', async () => {
    await seed({ startsAt: futureSlot() });
    const confirmed = await act(1000, 201, 'confirm', 0).expect(200);
    expect(confirmed.body).toEqual(expect.objectContaining({ appointment_status: 'confirmed', status_version: 1, can_reschedule: true }));
    expect(confirmed.body.status_updated_at).toEqual(expect.any(String));
    expect(confirmed.body.allowed_actions).toContain('cancel');
    await act(1000, 201, 'check_in', 1).expect(400);
    expect(await events()).toEqual([expect.objectContaining({ action: 'confirm', from_status: 'scheduled', to_status: 'confirmed', actor_user_id: 201, version: 1 })]);
  });

  it('executes patient arrival and assigned-doctor call, consultation and completion with matching views', async () => {
    await seed();
    await act(1000, 201, 'check_in', 0).expect(200);
    await act(1000, 101, 'call', 1).expect(200);
    await act(1000, 101, 'start', 2).expect(200);
    await act(1000, 201, 'complete', 3).expect(400);
    await act(1000, 302, 'complete', 3).expect(400);
    await act(1000, 101, 'complete', 3).expect(200);
    for (const actor of [201, 101, 301, 302]) {
      const current = await get('/appointments/1000', actor).expect(200);
      expect(current.body).toEqual(expect.objectContaining({ appointment_status: 'completed', status_version: 4, allowed_actions: [], can_reschedule: false, can_edit_notes: false }));
    }
    expect((await events()).map(event => [event.action, event.version])).toEqual([
      ['check_in', 1], ['call', 2], ['start', 3], ['complete', 4],
    ]);
    const history = await get('/doctors/getDoctorPatientHistories', 101).expect(200);
    expect(history.body).toEqual(expect.arrayContaining([expect.objectContaining({ user_id: 201 })]));
    await act(1000, 101, 'call', 4).expect(400);
    await update(1000, 201, { appointment_description: 'Closed consultation', expected_version: 4 }).expect(400);
    expect((await events()).length).toBe(4);
  });

  it('lets reception register arrival or call while reserving clinical start and completion for the assigned doctor', async () => {
    await seed();
    await act(1000, 302, 'check_in', 0).expect(200);
    await act(1000, 302, 'no_show', 1).expect(400);
    await act(1000, 301, 'call', 1).expect(200);
    await act(1000, 301, 'start', 2).expect(400);
    await act(1000, 302, 'start', 2).expect(400);
    await act(1000, 101, 'start', 2).expect(200);
    await act(1000, 101, 'complete', 3).expect(200);
    await seed({ id: 1001, startsAt: futureSlot() });
    await act(1001, 302, 'confirm', 0).expect(200);
    await act(1001, 301, 'cancel', 1).expect(200);
  });

  it('records no-show only once the time has arrived, excludes it from occupied slots and retains the record', async () => {
    const startsAt = todayAt(0);
    await seed({ startsAt });
    await act(1000, 302, 'no_show', 0).expect(200);
    expect((await row()).appointment_status).toBe('no_show');
    const occupied = await slots(startsAt).expect(200);
    expect(occupied.body.some((item: { appointment_id: number }) => item.appointment_id === 1000)).toBe(false);
    const patient = await get('/appointments/patient').expect(200);
    expect(patient.body).toEqual(expect.arrayContaining([expect.objectContaining({ appointment_id: 1000, appointment_status: 'no_show', allowed_actions: [] })]));
    await seed({ id: 1001, startsAt: futureSlot() });
    await act(1001, 302, 'no_show', 0).expect(400);
  });

  it('soft-cancels through the legacy endpoint, releases the slot, keeps history and makes retry idempotent', async () => {
    const startsAt = futureSlot();
    await seed({ startsAt });
    const booked = await slots(startsAt).expect(200);
    expect(booked.body).toEqual(expect.arrayContaining([expect.objectContaining({ appointment_id: 1000 })]));
    expect(booked.body[0].patient_id).toBeUndefined();
    expect(booked.body[0].appointment_description).toBeUndefined();
    await cancel(1000).expect(200);
    await cancel(1000).expect(200);
    expect((await row()).appointment_status).toBe('cancelled');
    expect((await row()).status_version).toBe(1);
    expect((await events()).length).toBe(1);
    const free = await slots(startsAt).expect(200);
    expect(free.body.some((item: { appointment_id: number }) => item.appointment_id === 1000)).toBe(false);
    await create(202, startsAt).expect(201);
    const patient = await get('/appointments/patient').expect(200);
    expect(patient.body).toEqual(expect.arrayContaining([expect.objectContaining({ appointment_id: 1000, appointment_status: 'cancelled' })]));
  });

  it('reschedules a confirmed appointment with version and audit, and preserves changes when the clinic is closed', async () => {
    const startsAt = futureSlot();
    await seed({ startsAt });
    await act(1000, 201, 'confirm', 0).expect(200);
    await update(1000, 201, { expected_version: 0, appointment_description: 'Stale notes' }).expect(409);
    const movedAt = startsAt + 60 * MINUTE;
    await update(1000, 201, { expected_version: 1, start_date_time: new Date(movedAt).toISOString(), end_date_time: new Date(movedAt + 30 * MINUTE).toISOString() }).expect(200);
    const moved = await row();
    expect(moved.appointment_status).toBe('scheduled');
    expect(moved.status_version).toBe(2);
    expect(Number(moved.starts_at_seconds)).toBe(movedAt / 1000);
    expect((await events()).map(event => event.action)).toEqual(['confirm', 'reschedule']);
    await db.execute('UPDATE clinics SET is_open=FALSE WHERE clinic_id=101');
    const refusedAt = movedAt + 60 * MINUTE;
    await update(1000, 201, { expected_version: 2, start_date_time: new Date(refusedAt).toISOString(), end_date_time: new Date(refusedAt + 30 * MINUTE).toISOString() }).expect(409);
    expect((await row()).status_version).toBe(2);
    expect(Number((await row()).starts_at_seconds)).toBe(movedAt / 1000);
    await db.execute('UPDATE clinics SET is_open=TRUE WHERE clinic_id=101');
    await update(1000, 201, { expected_version: 2, appointment_description: 'Updated patient notes' }).expect(200);
    expect((await row()).status_version).toBe(3);
    expect((await events())[2]).toEqual(expect.objectContaining({ action: 'update_notes', from_status: 'scheduled', to_status: 'scheduled', version: 3 }));
  });

  it('allows only one concurrent action for the same version and commits exactly one event', async () => {
    await seed();
    const results = await Promise.all([act(1000, 101, 'call', 0), act(1000, 302, 'call', 0)]);
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    expect((await row()).appointment_status).toBe('called');
    expect((await row()).status_version).toBe(1);
    expect((await events()).length).toBe(1);
  });

  it('serializes starts across clinics so a doctor cannot have two consultations in progress', async () => {
    await seed({ status: 'waiting' });
    await seed({ id: 1001, clinicId: 102, status: 'called' });
    const results = await Promise.all([act(1000, 101, 'start', 0), act(1001, 101, 'start', 0)]);
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    const records = await db.query<{ appointment_id: number; appointment_status: AppointmentStatus }>('SELECT appointment_id,appointment_status FROM appointments WHERE appointment_id IN (1000,1001)');
    const active = records.filter(item => item.appointment_status === 'in_progress');
    expect(active).toHaveLength(1);
    const winner = active[0].appointment_id;
    const loser = winner === 1000 ? 1001 : 1000;
    expect((await events(winner)).length).toBe(1);
    expect((await events(loser)).length).toBe(0);
    await act(winner, 101, 'complete', 1).expect(200);
    await act(loser, 101, 'start', 0).expect(200);
  });

  it('allows completion after day rollover without reopening old appointments for new dispatch', async () => {
    await seed({ status: 'in_progress', startsAt: todayAt(480) - DAY });
    await act(1000, 101, 'complete', 0).expect(200);
    await seed({ id: 1001, startsAt: todayAt(480) - DAY });
    await act(1001, 101, 'call', 0).expect(400);
    await act(1001, 201, 'check_in', 0).expect(400);
    await act(1001, 302, 'no_show', 0).expect(400);
    expect((await row(1001)).appointment_status).toBe('scheduled');
  });

  it('validates doctor membership and protects creation against client-supplied patient or status', async () => {
    const startsAt = futureSlot();
    await create(201, startsAt, { doctor_id: 401 }).expect(400);
    await create(201, startsAt, { doctor_id: 201 }).expect(400);
    await create(201, startsAt, { patient_id: 202 }).expect(400);
    await create(201, startsAt, { appointment_status: 'completed' }).expect(400);
    await create(201, startsAt, { start_date_time: new Date(Date.now() - MINUTE).toISOString() }).expect(400);
    await create(201, startsAt).expect(201);
    const [created] = await db.query<{ appointment_id: number; patient_id: number; appointment_status: AppointmentStatus; status_version: number }>('SELECT appointment_id,patient_id,appointment_status,status_version FROM appointments WHERE appointment_id >=1000 AND appointment_id <2000');
    expect(created).toEqual(expect.objectContaining({ patient_id: 201, appointment_status: 'scheduled', status_version: 0 }));
    expect(await events(created.appointment_id)).toEqual([expect.objectContaining({ from_status: null, to_status: 'scheduled', action: 'schedule', actor_user_id: 201, version: 0 })]);
  });

  it('serializes competing bookings for the same doctor across clinics', async () => {
    const startsAt = futureSlot();
    const results = await Promise.all([create(201, startsAt), create(202, startsAt, { clinic_id: 102 })]);
    expect(results.map(result => result.status).sort()).toEqual([201, 409]);
    const records = await db.query<{ appointment_id: number }>('SELECT appointment_id FROM appointments WHERE appointment_id >=1000 AND appointment_id <2000');
    expect(records).toHaveLength(1);
    expect((await events(records[0].appointment_id)).length).toBe(1);
  });

  it('retains the migrated legacy appointment without inventing a completed consultation or history event', async () => {
    const legacy = await get('/appointments/1').expect(200);
    expect(legacy.body).toEqual(expect.objectContaining({ appointment_status: 'scheduled', status_version: 0, status_updated_at: null }));
    expect(Date.parse(legacy.body.start_date_time)).toBeLessThan(Date.now());
    expect(await events(1)).toEqual([]);
    const history = await get('/doctors/getDoctorPatientHistories', 101).expect(200);
    expect(history.body).toEqual([]);
  });
});