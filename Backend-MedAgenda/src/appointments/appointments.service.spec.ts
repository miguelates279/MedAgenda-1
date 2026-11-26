import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { DatabaseService } from '../db/database.service';
import * as reads from './repo/reads';
import * as writes from './repo/writes';
import * as clinics from '../clinics/repo/reads';
import { appointmentChangeDeadline } from './appointment-scheduling';
import { Roles } from '../auth/role_guard/roles.enum';
import { allowedAppointmentActions, canEditAppointmentNotes, canRescheduleAppointment } from './appointment-workflow';

describe('Transactional appointment lifecycle', () => {
    const start = new Date('2030-11-25T15:00:00Z');
    const end = new Date(start.getTime() + 30 * 60_000);
    let db: { query: jest.Mock; execute: jest.Mock; inTx: jest.Mock };
    let service: AppointmentsService;
    let current: reads.PatientAppointmentForUpdate | undefined;
    let actorRole: Roles | null;
    let anotherConsultation: boolean;

    beforeEach(() => {
        jest.useFakeTimers().setSystemTime(new Date('2030-11-25T14:00:00Z'));
        current = { appointment_id: 7, patient_id: 42, clinic_id: 2, doctor_id: 3,
            start_timestamp: start.getTime() / 1000, duration_minutes: 30,
            appointment_status: 'scheduled', status_version: 0, status_updated_at: null };
        actorRole = null;
        anotherConsultation = false;
        db = { query: jest.fn(async (sql: string) => sql.includes('FROM users') ? [{ user_id: 3 }] :
                sql.includes("appointment_status = 'in_progress'") && anotherConsultation ? [{ appointment_id: 8 }] : []),
            execute: jest.fn(), inTx: jest.fn(async fn => fn(db)) };
        service = new AppointmentsService(db as unknown as DatabaseService);
        jest.spyOn(clinics, 'getClinicSchedulingRules').mockResolvedValue([{ is_open: 1, minimum_advance_minutes: 60, clinic_opening_time: '08:00', clinic_close_time: '18:00', clinic_break_time: '12:00', clinic_break_duration: '60', clinic_average_appointment_time: '30' }]);
        jest.spyOn(reads, 'getAppointmentDoctorId').mockImplementation(async (_db, _id, patientId) =>
            current && (patientId === undefined || patientId === current.patient_id) ? current.doctor_id : undefined);
        jest.spyOn(reads, 'getPatientAppointmentForUpdate').mockImplementation(async () => current);
        jest.spyOn(clinics, 'getRoleByIds').mockImplementation(async (_db, _clinic, actor) =>
            actor === 3 ? { role_within_clinic: Roles.Doctor } : actorRole ? { role_within_clinic: actorRole } : null);
        jest.spyOn(reads, 'getAppointmentByIdForActor').mockImplementation(async (_db, _id, actor) => {
            if (!current) return undefined;
            const context = { ...current, actor_role: actor === 3 ? Roles.Doctor : actorRole,
                start_date_time: new Date(current.start_timestamp * 1000).toISOString() };
            return { ...context, clinic_name: 'Centro', first_name: 'Ana', first_last_name: 'Ruiz', second_last_name: '',
                end_date_time: new Date((current.start_timestamp + 1800) * 1000).toISOString(),
                status_updated_at: current.status_updated_at, allowed_actions: allowedAppointmentActions(context, actor),
                can_reschedule: canRescheduleAppointment(context, actor), can_edit_notes: canEditAppointmentNotes(context, actor), minimum_advance_minutes: 60,
                change_deadline: appointmentChangeDeadline(context.start_date_time), server_now: new Date().toISOString() };
        });
        jest.spyOn(writes, 'updateAppointmentState').mockImplementation(async (_db, row, status, dto) => {
            current = { ...row, appointment_status: status, status_version: row.status_version + 1,
                status_updated_at: new Date().toISOString(),
                start_timestamp: dto?.start_date_time ? dto.start_date_time.getTime() / 1000 : row.start_timestamp };
            return true;
        });
        jest.spyOn(writes, 'recordAppointmentEvent').mockResolvedValue();
        jest.spyOn(writes, 'insertAppointment').mockResolvedValue(7);
    });

    afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

    it('cancels inside a transaction without deleting appointment history and records one audit event', async () => {
        await expect(service.deleteAppointment(7, 42)).resolves.toEqual({ message: expect.any(String) });
        expect(current?.appointment_status).toBe('cancelled');
        expect(writes.recordAppointmentEvent).toHaveBeenCalledWith(db, 7, 'scheduled', 'cancelled', 'cancel', 42, 1);
        await service.deleteAppointment(7, 42);
        expect(writes.recordAppointmentEvent).toHaveBeenCalledTimes(1);
        expect(db.execute).not.toHaveBeenCalled();
    });

    it('does not reveal or modify another patient appointment', async () => {
        await expect(service.deleteAppointment(7, 99)).rejects.toBeInstanceOf(NotFoundException);
        await expect(service.updateAppointment(7, 99, { appointment_description: 'changed' })).rejects.toBeInstanceOf(NotFoundException);
        await expect(service.performAction(7, 99, { action: 'call', expected_version: 0 })).rejects.toBeInstanceOf(NotFoundException);
        expect(writes.updateAppointmentState).not.toHaveBeenCalled();
    });

    it('preserves legacy past appointments without claiming attendance or deleting them', async () => {
        current!.start_timestamp = 1;
        await expect(service.deleteAppointment(7, 42)).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.updateAppointment(7, 42, { appointment_description: 'changed' })).rejects.toBeInstanceOf(BadRequestException);
        expect(writes.updateAppointmentState).not.toHaveBeenCalled();
    });

    it('keeps notes and audit updates inside the same transaction and uses the observed version', async () => {
        const notes = "x', patient_id=99 --";
        await service.updateAppointment(7, 42, { appointment_description: notes, expected_version: 0 });
        expect(writes.updateAppointmentState).toHaveBeenCalledWith(db, expect.objectContaining({ status_version: 0 }), 'scheduled',
            { appointment_description: notes, expected_version: 0 });
        expect(writes.recordAppointmentEvent).toHaveBeenCalledWith(db, 7, 'scheduled', 'scheduled', 'update_notes', 42, 1);
    });

    it('rejects incomplete dates, invalid duration and empty updates', async () => {
        await expect(service.updateAppointment(7, 42, {})).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.updateAppointment(7, 42, { start_date_time: start })).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.updateAppointment(7, 42, { start_date_time: start, end_date_time: new Date(start.getTime() + 60_000) })).rejects.toBeInstanceOf(BadRequestException);
        expect(writes.updateAppointmentState).not.toHaveBeenCalled();
    });

    it('reschedules the same ID, excludes its slot and resets confirmation with an audited version', async () => {
        current!.appointment_status = 'confirmed';
        const available = jest.spyOn(service, 'isDoctorAvailable').mockResolvedValue(true);
        jest.spyOn(service, 'isClinicAvailable').mockResolvedValue(true);
        await service.updateAppointment(7, 42, { start_date_time: start, end_date_time: end, expected_version: 0 });
        expect(available).toHaveBeenCalledWith(3, 2, start, end, 7, db);
        expect(current?.appointment_id).toBe(7);
        expect(current?.appointment_status).toBe('scheduled');
        expect(writes.recordAppointmentEvent).toHaveBeenCalledWith(db, 7, 'confirmed', 'scheduled', 'reschedule', 42, 1);
        expect(db.query.mock.calls[0][0]).toContain('FROM users WHERE user_id = ? FOR UPDATE');
        expect(db.query.mock.invocationCallOrder[0]).toBeLessThan((reads.getPatientAppointmentForUpdate as jest.Mock).mock.invocationCallOrder[0]);
    });

    it('locks the doctor before scheduling and records the initial scheduled event', async () => {
        jest.spyOn(service, 'isClinicAvailable').mockResolvedValue(true);
        await service.createAppointment({ clinic_id: 2, doctor_id: 3, start_date_time: start, end_date_time: end }, 42);
        expect(db.query.mock.calls[0][0]).toContain('FROM users WHERE user_id = ? FOR UPDATE');
        expect(writes.recordAppointmentEvent).toHaveBeenCalledWith(db, 7, null, 'scheduled', 'schedule', 42, 0);
    });

    it('rejects scheduling an unassigned doctor or a past instant before creating records', async () => {
        (clinics.getRoleByIds as jest.Mock).mockResolvedValue(null);
        await expect(service.createAppointment({ clinic_id: 2, doctor_id: 3, start_date_time: start, end_date_time: end }, 42)).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.createAppointment({ clinic_id: 2, doctor_id: 3, start_date_time: new Date(0), end_date_time: end }, 42)).rejects.toBeInstanceOf(BadRequestException);
        expect(writes.insertAppointment).not.toHaveBeenCalled();
    });

    it('rejects occupied slots, terminal edits and past rescheduling', async () => {
        jest.spyOn(service, 'isDoctorAvailable').mockResolvedValue(false);
        await expect(service.updateAppointment(7, 42, { start_date_time: start, end_date_time: end })).rejects.toBeInstanceOf(ConflictException);
        current!.appointment_status = 'completed';
        await expect(service.updateAppointment(7, 42, { appointment_description: 'changed' })).rejects.toBeInstanceOf(BadRequestException);
        current!.appointment_status = 'scheduled';
        await expect(service.updateAppointment(7, 42, { start_date_time: new Date(0), end_date_time: new Date(1800000) })).rejects.toBeInstanceOf(BadRequestException);
        expect(writes.updateAppointmentState).not.toHaveBeenCalled();
    });

    it('rejects stale versions before applying an action or editing notes', async () => {
        current!.status_version = 2;
        await expect(service.performAction(7, 42, { action: 'confirm', expected_version: 0 })).rejects.toBeInstanceOf(ConflictException);
        await expect(service.updateAppointment(7, 42, { appointment_description: 'changed', expected_version: 0 })).rejects.toBeInstanceOf(ConflictException);
        expect(writes.updateAppointmentState).not.toHaveBeenCalled();
        expect(writes.recordAppointmentEvent).not.toHaveBeenCalled();
    });

    it('returns authoritative next actions and prevents two consultations for the same doctor', async () => {
        const called = await service.performAction(7, 3, { action: 'call', expected_version: 0 });
        expect(called).toEqual(expect.objectContaining({ appointment_status: 'called', status_version: 1, allowed_actions: ['start'], can_reschedule: false }));
        anotherConsultation = true;
        await expect(service.performAction(7, 3, { action: 'start', expected_version: 1 })).rejects.toBeInstanceOf(ConflictException);
        expect(current?.appointment_status).toBe('called');
        anotherConsultation = false;
        await service.performAction(7, 3, { action: 'start', expected_version: 1 });
        expect(current?.appointment_status).toBe('in_progress');
        await service.performAction(7, 3, { action: 'complete', expected_version: 2 });
        expect(current?.appointment_status).toBe('completed');
        expect(writes.recordAppointmentEvent).toHaveBeenCalledTimes(3);
    });

    it('authorizes reception by the requested clinic and validates calendar dates before reading data', async () => {
        await expect(service.getClinicAppointments(2, 99, '2030-02-30')).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.getClinicAppointments(2, 99, '2030-11-25')).rejects.toBeInstanceOf(NotFoundException);
        actorRole = Roles.Employee;
        jest.spyOn(reads, 'getClinicAppointmentsForDay').mockResolvedValue([]);
        await expect(service.getClinicAppointments(2, 99, '2030-11-25')).resolves.toEqual([]);
        expect(reads.getClinicAppointmentsForDay).toHaveBeenCalledWith(db, 2, 99, '2030-11-25');
    });
    it('keeps Friday evening in Colombia available when the UTC date is Saturday', async () => {
        await expect(service.isClinicAvailable(2, new Date('2030-11-29T20:00:00-05:00'))).resolves.toBe(true);
    });

    it('keeps Sunday evening in Colombia unavailable when the UTC date is Monday', async () => {
        await expect(service.isClinicAvailable(2, new Date('2030-12-01T20:00:00-05:00'))).resolves.toBe(false);
    });

    it('keeps future notes editable inside the one hour cutoff but rejects time changes and cancellation for everyone', async () => {
        jest.setSystemTime(new Date('2030-11-25T14:00:00.001Z'));
        await service.updateAppointment(7, 42, { appointment_description: 'new notes' });
        await expect(service.updateAppointment(7, 42, { start_date_time: start, end_date_time: end })).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.deleteAppointment(7, 42)).rejects.toBeInstanceOf(BadRequestException);
        actorRole = Roles.Employee;
        await expect(service.performAction(7, 99, { action: 'cancel', expected_version: 1 })).rejects.toBeInstanceOf(BadRequestException);
        expect(writes.recordAppointmentEvent).toHaveBeenCalledTimes(1);
    });

    it('revalidates the new slot and original deadline after waiting for the doctor lock', async () => {
        const originalQuery = db.query.getMockImplementation()!;
        db.query.mockImplementation(async (...args) => {
            if (args[0].includes('FROM users')) jest.setSystemTime(new Date('2030-11-25T14:00:00.001Z'));
            return originalQuery(...args);
        });
        await expect(service.createAppointment({ clinic_id: 2, doctor_id: 3, start_date_time: start, end_date_time: end }, 42)).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.updateAppointment(7, 42, { start_date_time: new Date('2030-11-25T16:00:00Z'), end_date_time: new Date('2030-11-25T16:30:00Z') })).rejects.toBeInstanceOf(BadRequestException);
        expect(writes.insertAppointment).not.toHaveBeenCalled();
        expect(writes.updateAppointmentState).not.toHaveBeenCalled();
    });

    it('offers patient-owned current slots without accepting a client exclusion or exposing another patient appointment', async () => {
        jest.spyOn(reads, 'getDoctorBusyIntervals').mockResolvedValue([]);
        const result = await service.getReschedulingAvailability(7, 42, '2030-11-25');
        expect(result.slots.find(slot => slot.start_date_time === start.toISOString())?.status).toBe('current');
        expect(reads.getDoctorBusyIntervals).toHaveBeenCalledWith(db, 3, 2, Date.parse('2030-11-25T05:00:00Z'), Date.parse('2030-11-26T05:00:00Z'), 7);
        await expect(service.getReschedulingAvailability(7, 99, '2030-11-25')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects removed doctor membership on reschedule, invalid clinic configuration and closed day writes', async () => {
        (clinics.getRoleByIds as jest.Mock).mockResolvedValue(null);
        await expect(service.updateAppointment(7, 42, { start_date_time: start, end_date_time: end })).rejects.toBeInstanceOf(BadRequestException);
        (clinics.getRoleByIds as jest.Mock).mockResolvedValue({ role_within_clinic: Roles.Doctor });
        (clinics.getClinicSchedulingRules as jest.Mock).mockResolvedValue([{ is_open: 1, clinic_opening_time: null }]);
        await expect(service.getAvailability(2, 3, '2030-11-25')).rejects.toThrow('configuración');
        (clinics.getClinicSchedulingRules as jest.Mock).mockResolvedValue([{ is_open: 0, clinic_opening_time: '08:00', clinic_close_time: '18:00', clinic_break_time: '12:00', clinic_break_duration: '60', clinic_average_appointment_time: '30' }]);
        expect(await service.getAvailability(2, 3, '2030-11-25')).toMatchObject({ unavailable_reason: 'closed', slots: [] });
        await expect(service.createAppointment({ clinic_id: 2, doctor_id: 3, start_date_time: start, end_date_time: end }, 42)).rejects.toBeInstanceOf(BadRequestException);
    });

});
