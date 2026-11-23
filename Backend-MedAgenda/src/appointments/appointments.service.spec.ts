import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { DatabaseService } from '../db/database.service';

describe('Appointment lifecycle for local reminders', () => {
    const start = new Date('2030-11-25T14:00:00Z');
    const end = new Date(start.getTime() + 30 * 60_000);
    let db: { query: jest.Mock; execute: jest.Mock; inTx: jest.Mock };
    let service: AppointmentsService;
    let owned: object | undefined;

    beforeEach(() => {
        owned = { appointment_id: 7, clinic_id: 2, doctor_id: 3,
            start_timestamp: start.getTime() / 1000, duration_minutes: 30 };
        db = { query: jest.fn(async (sql: string) => sql.includes('FROM users') ? [{ user_id: 3 }] : sql.includes('FOR UPDATE') ? (owned ? [owned] : []) : []),
            execute: jest.fn(async () => ({ affectedRows: 1 })),
            inTx: jest.fn(async fn => fn(db)) };
        service = new AppointmentsService(db as unknown as DatabaseService);
    });

    it('cancels only the authenticated patient appointment inside a transaction', async () => {
        await expect(service.deleteAppointment(7, 42)).resolves.toEqual({ message: expect.any(String) });
        expect(db.inTx).toHaveBeenCalledTimes(1);
        expect(db.query).toHaveBeenCalledWith(expect.stringContaining('a.patient_id = ? FOR UPDATE'), [7, 42]);
        expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM appointments'), [7, 42]);
    });

    it('does not reveal or delete another patient appointment', async () => {
        owned = undefined;
        await expect(service.deleteAppointment(7, 99)).rejects.toBeInstanceOf(NotFoundException);
        await expect(service.updateAppointment(7, 99, { appointment_description: 'changed' })).rejects.toBeInstanceOf(NotFoundException);
        expect(db.execute).not.toHaveBeenCalled();
    });

    it('preserves past appointments instead of deleting their history', async () => {
        owned = { appointment_id: 7, start_timestamp: 1 };
        await expect(service.deleteAppointment(7, 42)).rejects.toBeInstanceOf(BadRequestException);
        expect(db.execute).not.toHaveBeenCalled();
    });

    it('updates notes with bound parameters and preserves the appointment date', async () => {
        const notes = "x', patient_id=99 --";
        await service.updateAppointment(7, 42, { appointment_description: notes });
        expect(db.execute).toHaveBeenCalledWith(
            'UPDATE appointments SET appointment_description = ? WHERE appointment_id = ? AND patient_id = ?',
            [notes, 7, 42],
        );
    });

    it('rejects incomplete dates, invalid duration and empty updates', async () => {
        await expect(service.updateAppointment(7, 42, {})).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.updateAppointment(7, 42, { start_date_time: start })).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.updateAppointment(7, 42, { start_date_time: start, end_date_time: new Date(start.getTime() + 60_000) }))
            .rejects.toBeInstanceOf(BadRequestException);
        expect(db.execute).not.toHaveBeenCalled();
    });

    it('reschedules the same appointment ID, excludes its current slot and writes the absolute instant', async () => {
        jest.spyOn(service, 'isClinicAvailable').mockResolvedValue(true);
        await service.updateAppointment(7, 42, { start_date_time: start, end_date_time: end });
        expect(db.query.mock.calls.some(([sql, params]) => sql.includes('a.appointment_id <> ?') && params.at(-1) === 7)).toBe(true);
        expect(db.execute).toHaveBeenCalledWith(
            'UPDATE appointments SET scheduled_time_date = FROM_UNIXTIME(?) WHERE appointment_id = ? AND patient_id = ?',
            [start.getTime() / 1000, 7, 42],
        );
    });

    it('locks the doctor before availability checks for both scheduling and rescheduling', async () => {
        jest.spyOn(service, 'isClinicAvailable').mockResolvedValue(true);
        await service.createAppointment({ clinic_id: 2, doctor_id: 3, start_date_time: start, end_date_time: end }, 42);
        const queries = db.query.mock.calls.map(([sql]) => sql as string);
        expect(queries[0]).toContain('FROM users WHERE user_id = ? FOR UPDATE');
        expect(queries.findIndex(sql => sql.includes('FROM appointments'))).toBeGreaterThan(0);
        expect(db.inTx).toHaveBeenCalledTimes(1);
    });

    it('rejects an occupied slot without modifying the appointment', async () => {
        jest.spyOn(service, 'isDoctorAvailable').mockResolvedValue(false);
        await expect(service.updateAppointment(7, 42, { start_date_time: start, end_date_time: end }))
            .rejects.toBeInstanceOf(ConflictException);
        expect(db.execute).not.toHaveBeenCalled();
    });

    it('rejects rescheduling an attended date or a date in the past', async () => {
        await expect(service.updateAppointment(7, 42, { start_date_time: new Date(0), end_date_time: new Date(1800000) }))
            .rejects.toBeInstanceOf(BadRequestException);
        expect(db.execute).not.toHaveBeenCalled();
    });
});
