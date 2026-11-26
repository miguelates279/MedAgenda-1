import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/db/database.service';
import { AppointmentsService } from '../src/appointments/appointments.service';
import type { Db } from '../src/db/types/types';

const enabled = process.env.WORKFLOW_INTEGRATION === '1';
const databaseName = process.env.DB_NAME ?? '';
const isolatedName = /^medagenda_workflow_qa_[a-zA-Z0-9_]+$/i;
if (enabled && !isolatedName.test(databaseName)) {
  throw new Error('Scheduling integration tests require an isolated medagenda_workflow_qa_ database.');
}
const integration = enabled ? describe : describe.skip;
const MINUTE = 60_000;
const DAY = 86_400_000;
const BASE = Date.parse('2026-11-30T07:00:00-05:00');
const at = (clock: string, day = '2026-11-30') => Date.parse(`${day}T${clock}:00-05:00`);
const iso = (time: number) => new Date(time).toISOString();

integration('Scheduling rules HTTP and isolated MySQL integration', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let jwt: JwtService;
  let current = BASE;
  let isolatedVerified = false;
  const guard = () => {
    if (!isolatedVerified) throw new Error('Refusing a write before verifying the isolated scheduling schema.');
  };
  const auth = (actor = 201) => jwt.sign({ sub: actor, email: `scheduling-${actor}@example.test` }, { expiresIn: '1h' });
  const get = (path: string, actor = 201) => request(app.getHttpServer()).get(path).auth(auth(actor), { type: 'bearer' });
  const create = (start = at('08:00'), overrides: Record<string, unknown> = {}) => request(app.getHttpServer())
    .post('/appointments/scheduleAppointment').auth(auth(), { type: 'bearer' }).send({
      clinic_id: 101, doctor_id: 101,
      start_date_time: iso(start), end_date_time: iso(start + 30 * MINUTE),
      appointment_description: 'Private scheduling fixture', ...overrides,
    });
  const update = (id: number, body: object) => request(app.getHttpServer()).put(`/appointments/${id}`)
    .auth(auth(), { type: 'bearer' }).send(body);
  const cancel = (id: number, actor = 201) => request(app.getHttpServer()).post(`/appointments/${id}/actions`)
    .auth(auth(actor), { type: 'bearer' }).send({ action: 'cancel', expected_version: 0 });
  const publicPath = (day = '2026-11-30', clinic = 101, doctor = 101) => `/appointments/availability/day?clinic_id=${clinic}&doctor_id=${doctor}&date=${day}`;
  const preview = (day = '2026-11-30', clinic = 101, doctor = 101) => request(app.getHttpServer()).get(publicPath(day, clinic, doctor));
  const write = async (sql: string, values: unknown[] = []) => {
    guard();
    return db.execute(sql, values);
  };
  const seed = async (id = 1000, start = at('08:00'), options: { clinic?: number; doctor?: number; patient?: number; status?: string } = {}) => {
    await write(`INSERT INTO appointments (appointment_id,clinic_id,patient_id,doctor_id,scheduled_time_date,appointment_description,appointment_status,status_version)
      VALUES (?,?,?,?,FROM_UNIXTIME(?),?,?,0)`, [id, options.clinic ?? 101, options.patient ?? 201, options.doctor ?? 101, start / 1000, 'Secret notes never published', options.status ?? 'scheduled']);
  };
  const state = async (id = 1000) => (await db.query<{ appointment_status: string; status_version: number; appointment_description: string; starts: number }>(
    'SELECT appointment_status,status_version,appointment_description,UNIX_TIMESTAMP(scheduled_time_date) AS starts FROM appointments WHERE appointment_id=?', [id],
  ))[0];
  const eventCount = async (id = 1000) => Number((await db.query<{ count: number }>('SELECT COUNT(*) AS count FROM appointment_status_events WHERE appointment_id=?', [id]))[0].count);
  const reset = async () => {
    await write('DELETE FROM appointment_status_events WHERE appointment_id >= 1000 AND appointment_id < 2000');
    await write('DELETE FROM appointments WHERE appointment_id >= 1000 AND appointment_id < 2000');
    await write('DELETE FROM absences WHERE doctor_id IN (101,102)');
    await write("UPDATE clinics SET is_open=TRUE,clinic_opening_time='08:00',clinic_close_time='18:00',clinic_average_appointment_time='30',clinic_break_time='12:00',clinic_break_duration='60' WHERE clinic_id IN (101,102)");
    await write('ALTER TABLE appointments AUTO_INCREMENT=1000');
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    db = app.get(DatabaseService);
    const [identity] = await db.query<{ database_name: string }>('SELECT DATABASE() AS database_name');
    if (!isolatedName.test(identity.database_name) || identity.database_name.toLowerCase() !== databaseName.toLowerCase()) {
      throw new Error('Refusing to mutate a database outside the verified scheduling test schema.');
    }
    isolatedVerified = true;
    jwt = new JwtService({ secret: process.env.JWT_SECRET });
  });

  beforeEach(async () => {
    current = BASE;
    jest.spyOn(Date, 'now').mockImplementation(() => current);
    await reset();
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    if (db && isolatedVerified) await reset();
    if (app) await app.close();
  });

  it('provides a public, server-timed preview and accepts the exact one-hour boundary', async () => {
    const result = await preview().expect(200);
    expect(result.body).toEqual(expect.objectContaining({ clinic_id: 101, doctor_id: 101, date: '2026-11-30', time_zone: 'America/Bogota', server_now: iso(BASE), minimum_advance_minutes: 60, duration_minutes: 30, unavailable_reason: null }));
    expect(result.body.slots[0]).toEqual({ start_date_time: iso(at('08:00')), end_date_time: iso(at('08:30')), status: 'available' });
    const created = await create().expect(201);
    expect(created.text).toBe('');
    const records = await db.query<{ appointment_id: number; clinic_id: number; doctor_id: number; patient_id: number; appointment_status: string; starts: number }>(
      'SELECT appointment_id,clinic_id,doctor_id,patient_id,appointment_status,UNIX_TIMESTAMP(scheduled_time_date) AS starts FROM appointments WHERE appointment_id >=1000 AND appointment_id <2000',
    );
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual(expect.objectContaining({ appointment_id: expect.any(Number), clinic_id: 101, doctor_id: 101, patient_id: 201, appointment_status: 'scheduled' }));
    expect(Number(records[0].starts)).toBe(at('08:00') / 1000);
    expect(await eventCount(records[0].appointment_id)).toBe(1);
    const saved = await get(`/appointments/${records[0].appointment_id}`).expect(200);
    expect(saved.body).toEqual(expect.objectContaining({ appointment_id: records[0].appointment_id, patient_id: 201, clinic_id: 101, doctor_id: 101, start_date_time: iso(at('08:00')), end_date_time: iso(at('08:30')), appointment_status: 'scheduled', status_version: 0 }));
    const updated = await preview().expect(200);
    expect(updated.body.slots[0].status).toBe('booked');
    for (const slot of updated.body.slots) expect(Object.keys(slot).sort()).toEqual(['end_date_time', 'start_date_time', 'status']);
    const serialized = JSON.stringify(updated.body);
    for (const secret of ['patient_id', 'appointment_id', 'appointment_description', 'Private scheduling fixture', 'patient_first_name']) expect(serialized).not.toContain(secret);
  });

  it('rejects creation a millisecond inside the hour and marks the slot too soon', async () => {
    current = BASE + 1;
    const result = await preview().expect(200);
    expect(result.body.slots[0].status).toBe('too_soon');
    expect(result.body.server_now).toBe(iso(current));
    await create().expect(400);
    expect(await state()).toBeUndefined();
  });

  it.each([
    ['before opening', at('07:30'), {}],
    ['after closing', at('18:00'), {}],
    ['off opening grid', at('08:15'), {}],
    ['nonzero seconds', at('08:00') + 1000, {}],
    ['nonzero milliseconds', at('08:00') + 1, {}],
    ['wrong duration', at('08:00'), { end_date_time: iso(at('08:45')) }],
    ['negative interval', at('08:00'), { end_date_time: iso(at('07:30')) }],
    ['break overlap', at('12:00'), {}],
    ['weekend in Colombia', at('08:00', '2026-12-05'), {}],
    ['UTC Monday is Colombia Sunday', Date.parse('2026-12-07T02:00:00Z'), {}],
    ['missing zone', at('08:00'), { start_date_time: '2026-11-30T08:00:00' }],
    ['invalid calendar', at('08:00'), { start_date_time: '2026-02-30T08:00:00-05:00' }],
    ['missing end', at('08:00'), { end_date_time: null }],
    ['outside timestamp storage range', Date.parse('2099-11-30T13:00:00Z'), {}],
  ])('rejects a direct API request with %s without inserting or auditing', async (_name, start, overrides) => {
    await create(start as number, overrides as Record<string, unknown>).expect(400);
    expect(await state()).toBeUndefined();
    expect(await eventCount()).toBe(0);
  });

  it('anchors the slot grid at opening and rejects partial overlap with a non-aligned break', async () => {
    await write("UPDATE clinics SET clinic_opening_time='08:10',clinic_break_time='12:05',clinic_break_duration='20' WHERE clinic_id=101");
    await create(at('08:00')).expect(400);
    await create(at('08:10')).expect(201);
    await create(at('11:40')).expect(400);
    await create(at('12:10')).expect(400);
    await create(at('12:40')).expect(201);
    const result = await preview().expect(200);
    expect(result.body.slots.find((slot: { start_date_time: string }) => slot.start_date_time === iso(at('11:40'))).status).toBe('break');
  });

  it.each([
    ['clinic_average_appointment_time', '0'],
    ['clinic_average_appointment_time', 'bad'],
    ['clinic_average_appointment_time', null],
    ['clinic_opening_time', '25:00'],
    ['clinic_close_time', '07:00'],
    ['clinic_break_duration', '-1'],
    ['clinic_break_time', '19:00'],
  ])('fails closed for invalid clinic configuration %s=%s', async (column, value) => {
    const allowed = new Set(['clinic_average_appointment_time', 'clinic_opening_time', 'clinic_close_time', 'clinic_break_duration', 'clinic_break_time']);
    expect(allowed.has(column)).toBe(true);
    await write(`UPDATE clinics SET ${column}=? WHERE clinic_id=101`, [value]);
    await preview().expect(400);
    await create().expect(400);
    expect(await state()).toBeUndefined();
  });

  it('returns closure and weekend reasons and rejects booking the unavailable clinic', async () => {
    await write('UPDATE clinics SET is_open=FALSE WHERE clinic_id=101');
    const closed = await preview().expect(200);
    expect(closed.body).toEqual(expect.objectContaining({ unavailable_reason: 'closed', slots: [] }));
    await create().expect(400);
    const weekend = await preview('2026-12-05', 102).expect(200);
    expect(weekend.body).toEqual(expect.objectContaining({ unavailable_reason: 'weekend', slots: [] }));
  });

  it('blocks a doctor booked in another clinic and an absence without publishing foreign appointment details', async () => {
    await seed(1000, at('08:00'), { clinic: 102, patient: 202 });
    await write('INSERT INTO absences (doctor_id,clinic_id,start_date_time,end_date_time) VALUES (101,101,FROM_UNIXTIME(?),FROM_UNIXTIME(?))', [at('09:00') / 1000, at('10:00') / 1000]);
    const result = await preview().expect(200);
    const statusAt = (minute: string) => result.body.slots.find((slot: { start_date_time: string }) => slot.start_date_time === iso(at(minute))).status;
    expect(statusAt('08:00')).toBe('booked');
    expect(statusAt('08:30')).toBe('available');
    expect(statusAt('09:00')).toBe('booked');
    expect(statusAt('10:00')).toBe('available');
    expect(JSON.stringify(result.body)).not.toContain('Secret notes');
    for (const slot of result.body.slots) expect(Object.keys(slot).sort()).toEqual(['end_date_time', 'start_date_time', 'status']);
    await create().expect(409);
    await create(at('09:30')).expect(409);
    await create(at('10:00')).expect(201);
    const otherClinic = await preview('2026-11-30', 102).expect(200);
    expect(otherClinic.body.slots.find((slot: { start_date_time: string }) => slot.start_date_time === iso(at('09:00'))).status).toBe('available');
  });

  it.each([null, '0', 'bad'])('fails closed when another clinic has an active legacy appointment with duration %s', async duration => {
    await seed(1000, at('08:00'));
    await seed(1001, at('09:00'), { clinic: 102, patient: 202 });
    await write('UPDATE clinics SET clinic_average_appointment_time=? WHERE clinic_id=102', [duration]);
    const publicResult = await preview().expect(400);
    const privateResult = await get('/appointments/1000/availability?date=2026-11-30').expect(400);
    const booking = await create(at('09:00')).expect(400);
    const rescheduling = await update(1000, { start_date_time: iso(at('09:00')), end_date_time: iso(at('09:30')), appointment_description: 'Must not save notes', expected_version: 0 }).expect(400);
    for (const response of [publicResult, privateResult, booking, rescheduling]) {
      expect(response.body).toEqual(expect.objectContaining({ statusCode: 400, message: expect.any(String) }));
      const message = JSON.stringify(response.body);
      expect(message).not.toMatch(/patient_id|doctor_id|clinic_id|appointment_id|Secret notes/);
      expect(response.body.message).not.toContain('102');
    }
    const records = await db.query<{ appointment_id: number }>('SELECT appointment_id FROM appointments WHERE appointment_id >=1000 AND appointment_id <2000 ORDER BY appointment_id');
    expect(records.map(record => record.appointment_id)).toEqual([1000, 1001]);
    expect(await state()).toEqual(expect.objectContaining({ appointment_status: 'scheduled', status_version: 0, appointment_description: 'Secret notes never published' }));
    expect(Number((await state()).starts)).toBe(at('08:00') / 1000);
    expect((await state(1001)).status_version).toBe(0);
    expect(await eventCount()).toBe(0);
    expect(await eventCount(1001)).toBe(0);
  });

  it.each([
    ['cancelled', null], ['cancelled', '0'], ['cancelled', 'bad'],
    ['no_show', null], ['no_show', '0'], ['no_show', 'bad'],
  ])('ignores a %s legacy appointment with invalid duration %s while preserving private own exclusion', async (status, duration) => {
    await seed(1000, at('08:00'));
    await seed(1001, at('09:00'), { clinic: 102, patient: 202, status: status as string });
    await write('UPDATE clinics SET clinic_average_appointment_time=? WHERE clinic_id=102', [duration]);
    const publicResult = await preview().expect(200);
    const slotAt = (result: { body: { slots: { start_date_time: string; status: string }[] } }, time: string) => result.body.slots.find(slot => slot.start_date_time === iso(at(time)))?.status;
    expect(slotAt(publicResult, '08:00')).toBe('booked');
    expect(slotAt(publicResult, '09:00')).toBe('available');
    const own = await get('/appointments/1000/availability?date=2026-11-30').expect(200);
    expect(slotAt(own, '08:00')).toBe('current');
    expect(slotAt(own, '09:00')).toBe('available');
    await create(at('10:00')).expect(201);
    await update(1000, { start_date_time: iso(at('09:00')), end_date_time: iso(at('09:30')), expected_version: 0 }).expect(200);
    expect(Number((await state()).starts)).toBe(at('09:00') / 1000);
    expect((await state()).status_version).toBe(1);
    expect(await eventCount()).toBe(1);
    expect((await state(1001)).appointment_status).toBe(status);
    expect((await state(1001)).status_version).toBe(0);
    expect(await eventCount(1001)).toBe(0);
  });

  it('excludes only an owned reschedulable appointment through the private availability endpoint', async () => {
    await seed();
    await request(app.getHttpServer()).get('/appointments/1000/availability?date=2026-11-30').expect(401);
    await get('/appointments/1000/availability?date=2026-11-30', 202).expect(404);
    await get('/appointments/1000/availability?date=2026-11-30', 101).expect(404);
    await request(app.getHttpServer()).get(`${publicPath()}&exclude_appointment_id=1000`).expect(400);
    const own = await get('/appointments/1000/availability?date=2026-11-30').expect(200);
    expect(own.body.slots[0].status).toBe('current');
    await seed(1001, at('09:00'), { patient: 202 });
    await update(1000, { start_date_time: iso(at('09:00')), end_date_time: iso(at('09:30')), expected_version: 0 }).expect(409);
    await update(1000, { start_date_time: iso(at('08:30')), end_date_time: iso(at('09:00')), expected_version: 0 }).expect(200);
    expect(Number((await state()).starts)).toBe(at('08:30') / 1000);
    expect(await eventCount()).toBe(1);
    current = at('07:30') + 1;
    await get('/appointments/1000/availability?date=2026-11-30').expect(400);
  });

  it.each([
    { name: 'off-grid start', start_date_time: iso(at('09:15')), end_date_time: iso(at('09:45')) },
    { name: 'wrong duration', start_date_time: iso(at('09:00')), end_date_time: iso(at('09:45')) },
    { name: 'clinic break', start_date_time: iso(at('12:00')), end_date_time: iso(at('12:30')) },
    { name: 'after closing', start_date_time: iso(at('18:00')), end_date_time: iso(at('18:30')) },
    { name: 'weekend', start_date_time: iso(at('09:00', '2026-12-05')), end_date_time: iso(at('09:30', '2026-12-05')) },
    { name: 'naive local date', start_date_time: '2026-11-30T09:00:00', end_date_time: iso(at('09:30')) },
    { name: 'invalid calendar', start_date_time: '2026-02-30T09:00:00-05:00', end_date_time: '2026-02-30T09:30:00-05:00' },
    { name: 'missing paired end', start_date_time: iso(at('09:00')) },
  ])('rejects direct rescheduling with $name and preserves the original record', async ({ name, ...times }) => {
    expect(name).toEqual(expect.any(String));
    await seed();
    await update(1000, { ...times, expected_version: 0, appointment_description: 'Must roll back too' }).expect(400);
    expect(await state()).toEqual(expect.objectContaining({ appointment_status: 'scheduled', status_version: 0, appointment_description: 'Secret notes never published' }));
    expect(Number((await state()).starts)).toBe(at('08:00') / 1000);
    expect(await eventCount()).toBe(0);
  });

  it('serializes booking against rescheduling for the same doctor across clinics', async () => {
    await seed();
    const results = await Promise.all([
      update(1000, { start_date_time: iso(at('09:00')), end_date_time: iso(at('09:30')), expected_version: 0 }),
      create(at('09:00'), { clinic_id: 102 }),
    ]);
    expect(results.filter(result => result.status === 409)).toHaveLength(1);
    expect(results.filter(result => result.status === 200 || result.status === 201)).toHaveLength(1);
    const records = await db.query<{ appointment_id: number }>('SELECT appointment_id FROM appointments WHERE doctor_id=101 AND scheduled_time_date=FROM_UNIXTIME(?) AND appointment_status NOT IN (\'cancelled\',\'no_show\')', [at('09:00') / 1000]);
    expect(records).toHaveLength(1);
    const [audit] = await db.query<{ count: number }>('SELECT COUNT(*) AS count FROM appointment_status_events WHERE appointment_id >=1000 AND appointment_id <2000');
    expect(Number(audit.count)).toBe(1);
  });

  it.each([201, 301, 302])('allows actor %s to cancel at exactly one hour and retains a single event', async actor => {
    await seed();
    await cancel(1000, actor).expect(200);
    expect((await state()).appointment_status).toBe('cancelled');
    expect(await eventCount()).toBe(1);
    if (actor === 201) {
      current = at('08:01');
      await request(app.getHttpServer()).delete('/appointments/1000').auth(auth(), { type: 'bearer' }).expect(200);
      expect(await eventCount()).toBe(1);
    }
  });

  it.each([201, 301, 302])('rejects actor %s cancellation inside the hour without changing the version', async actor => {
    await seed();
    current = BASE + 1;
    const detail = await get('/appointments/1000', actor).expect(200);
    expect(detail.body.allowed_actions).not.toContain('cancel');
    expect(detail.body.change_deadline).toBe(iso(BASE));
    expect(detail.body.minimum_advance_minutes).toBe(60);
    await cancel(1000, actor).expect(400);
    expect((await state()).status_version).toBe(0);
    expect(await eventCount()).toBe(0);
  });

  it('requires an hour for original and destination slots but allows future notes until the appointment starts', async () => {
    await seed();
    current = BASE + 1;
    await update(1000, { start_date_time: iso(at('10:00')), end_date_time: iso(at('10:30')), expected_version: 0 }).expect(400);
    await request(app.getHttpServer()).delete('/appointments/1000').auth(auth(), { type: 'bearer' }).expect(400);
    const notes = await update(1000, { appointment_description: 'Allowed before start', expected_version: 0 }).expect(200);
    expect(notes.body).toBeDefined();
    expect((await state()).status_version).toBe(1);
    expect((await state()).appointment_description).toBe('Allowed before start');
    current = at('08:00');
    await update(1000, { appointment_description: 'Late notes', expected_version: 1 }).expect(400);
    expect(await eventCount()).toBe(1);
    await seed(1001, at('11:00'));
    current = BASE + 1;
    await update(1001, { start_date_time: iso(at('08:00')), end_date_time: iso(at('08:30')), expected_version: 0 }).expect(400);
    expect((await state(1001)).status_version).toBe(0);
  });

  it.each(['create', 'cancel', 'reschedule'])('checks the hour after acquiring the doctor lock for %s', async operation => {
    if (operation !== 'create') await seed();
    guard();
    const connection = await db.getConnection();
    await connection.beginTransaction();
    await connection.query('SELECT user_id FROM users WHERE user_id=101 FOR UPDATE');
    const service = app.get(AppointmentsService) as unknown as { lockDoctor: (tx: Db, id: number) => Promise<void> };
    const original = service.lockDoctor.bind(service);
    let issued: () => void = () => {};
    const lockIssued = new Promise<void>(resolve => { issued = resolve; });
    const spy = jest.spyOn(service, 'lockDoctor').mockImplementation(async (tx, id) => {
      const pending = original(tx, id);
      issued();
      await pending;
    });
    try {
      const pending = (operation === 'create' ? create() : operation === 'cancel' ? cancel(1000) : update(1000, { start_date_time: iso(at('10:00')), end_date_time: iso(at('10:30')), expected_version: 0 })).then(result => result);
      await lockIssued;
      current = BASE + 1;
      await connection.rollback();
      const result = await pending;
      expect(result.status).toBe(400);
      if (operation === 'create') expect(await state()).toBeUndefined();
      else expect((await state()).status_version).toBe(0);
      expect(await eventCount()).toBe(0);
    } finally {
      spy.mockRestore();
      await connection.rollback();
      connection.release();
    }
  });
});
