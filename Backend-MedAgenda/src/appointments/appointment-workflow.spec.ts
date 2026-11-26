import { allowedAppointmentActions, AppointmentWorkflowContext, canRescheduleAppointment, clinicDate } from './appointment-workflow';

describe('Appointment workflow policy', () => {
    const now = new Date('2030-11-25T14:00:00Z');
    const appointment: AppointmentWorkflowContext = {
        patient_id: 42, doctor_id: 3, actor_role: null,
        start_date_time: '2030-11-25T15:00:00Z', appointment_status: 'scheduled',
    };

    it('allows patients to confirm, check in and cancel only their own scheduled appointment', () => {
        expect(allowedAppointmentActions(appointment, 42, now)).toEqual(['confirm', 'check_in', 'cancel']);
        expect(allowedAppointmentActions(appointment, 99, now)).toEqual([]);
        expect(canRescheduleAppointment(appointment, 42, now)).toBe(true);
        expect(canRescheduleAppointment(appointment, 99, now)).toBe(false);
    });

    it('requires clinic doctor membership as well as the assigned doctor identity', () => {
        expect(allowedAppointmentActions(appointment, 3, now)).toEqual([]);
        expect(allowedAppointmentActions({ ...appointment, actor_role: 'Doctor' }, 3, now)).toEqual(['call']);
        expect(allowedAppointmentActions({ ...appointment, actor_role: 'Doctor' }, 99, now)).toEqual([]);
        expect(allowedAppointmentActions({ ...appointment, actor_role: 'Employee' }, 99, now)).not.toContain('start');
    });

    it('allows reception to call but keeps consultation start and completion with the assigned doctor', () => {
        for (const role of ['Owner', 'Admin', 'Employee'] as const) {
            const context = { ...appointment, actor_role: role };
            expect(allowedAppointmentActions(context, 99, now)).toContain('call');
            expect(allowedAppointmentActions({ ...context, appointment_status: 'called' }, 99, now)).not.toContain('start');
            expect(allowedAppointmentActions({ ...context, appointment_status: 'in_progress' }, 99, now)).not.toContain('complete');
        }
        for (const status of ['waiting', 'called'] as const) {
            expect(allowedAppointmentActions({ ...appointment, appointment_status: status, actor_role: 'Doctor' }, 3, now)).toContain('start');
        }
    });

    it('does not infer completion from a past appointment date', () => {
        const past = { ...appointment, start_date_time: '2030-11-24T15:00:00Z' };
        expect(allowedAppointmentActions(past, 42, now)).toEqual([]);
        expect(allowedAppointmentActions({ ...past, actor_role: 'Doctor' }, 3, now)).toEqual([]);
        expect(canRescheduleAppointment(past, 42, now)).toBe(false);
    });

    it('uses the Colombia clinic day across UTC midnight', () => {
        expect(clinicDate(new Date('2030-11-26T04:59:00Z'))).toBe('2030-11-25');
        expect(clinicDate(new Date('2030-11-26T05:00:00Z'))).toBe('2030-11-26');
        const context = { ...appointment, start_date_time: '2030-11-26T03:30:00Z', actor_role: 'Doctor' as const };
        expect(allowedAppointmentActions(context, 3, new Date('2030-11-25T23:30:00Z'))).toContain('call');
        expect(allowedAppointmentActions(context, 3, new Date('2030-11-26T05:30:00Z'))).not.toContain('call');
    });

    it('permits no-show only after the scheduled start for a patient who has not checked in', () => {
        const context = { ...appointment, actor_role: 'Doctor' as const };
        expect(allowedAppointmentActions(context, 3, now)).not.toContain('no_show');
        expect(allowedAppointmentActions(context, 3, new Date('2030-11-25T15:00:00Z'))).toContain('no_show');
        expect(allowedAppointmentActions({ ...context, appointment_status: 'waiting' }, 3, new Date('2030-11-25T16:00:00Z'))).not.toContain('no_show');
    });

    it('keeps terminal states immutable and an ongoing consultation completable after midnight', () => {
        for (const status of ['completed', 'cancelled', 'no_show'] as const) {
            for (const actor of [42, 3, 99]) {
                expect(allowedAppointmentActions({ ...appointment, appointment_status: status, actor_role: 'Owner' }, actor, now)).toEqual([]);
            }
        }
        expect(allowedAppointmentActions({ ...appointment, appointment_status: 'in_progress', actor_role: 'Doctor' }, 3, new Date('2030-11-26T18:00:00Z'))).toEqual(['complete']);
    });

    it('limits rescheduling to future scheduled or confirmed appointments', () => {
        for (const status of ['waiting', 'called', 'in_progress', 'completed', 'cancelled', 'no_show'] as const) {
            expect(canRescheduleAppointment({ ...appointment, appointment_status: status }, 42, now)).toBe(false);
        }
        expect(canRescheduleAppointment({ ...appointment, appointment_status: 'confirmed' }, 42, now)).toBe(true);
    });
});
