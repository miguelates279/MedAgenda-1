import { getAppointmentsByPatientId } from './reads';
import { insertAppointment } from './writes';
import type { Db } from '../../db/types/types';

describe('Absolute appointment instants for device reminders', () => {
    it('returns ISO instants without depending on MySQL timezone tables or the connection timezone', async () => {
        const starts = Date.parse('2030-11-25T09:00:00-05:00');
        const db = { query: jest.fn(async () => [{
            appointment_id: 7, clinic_id: 2, doctor_id: 3, clinic_name: 'Centro', first_name: 'Ana',
            first_last_name: 'Ruiz', second_last_name: '', starts_at_seconds: starts / 1000,
            duration_minutes: '30',
        }]) } as unknown as Db;
        const result = await getAppointmentsByPatientId(db, 42);
        expect(result[0].doctor_id).toBe(3);
        expect(db.query).toHaveBeenCalledWith(expect.stringContaining('a.doctor_id'), [42, 42, 42]);
        expect(result[0].start_date_time).toBe('2030-11-25T14:00:00.000Z');
        expect(result[0].end_date_time).toBe('2030-11-25T14:30:00.000Z');
        expect(result[0]).not.toHaveProperty('starts_at_seconds');
        expect(result[0]).not.toHaveProperty('duration_minutes');
        expect(db.query).toHaveBeenCalledWith(expect.stringContaining('UNIX_TIMESTAMP'), [42, 42, 42]);
    });

    it('stores the requested instant rather than interpreting a UTC text as a local SQL time', async () => {
        const db = { execute: jest.fn(async () => ({ insertId: 7 })) } as unknown as Db;
        const start = new Date('2030-11-25T09:00:00-05:00');
        await insertAppointment(db, {
            clinic_id: 2, doctor_id: 3, start_date_time: start,
            end_date_time: new Date(start.getTime() + 1800000),
        }, 42);
        expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('FROM_UNIXTIME(?)'),
            [2, 42, 3, start.getTime() / 1000, null]);
    });
});
