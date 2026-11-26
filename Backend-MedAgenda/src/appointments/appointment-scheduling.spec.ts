import { BadRequestException } from '@nestjs/common';
import { createAvailabilitySlots, parseClinicSchedulingPolicy, validateAppointmentSlot, validateSchedulingDate } from './appointment-scheduling';
import type { ClinicScheduleRules } from '../clinics/repo/reads';

const rules: ClinicScheduleRules = { is_open: 1, minimum_advance_minutes: 60, clinic_opening_time: '08:00', clinic_close_time: '18:00',
    clinic_break_time: '12:00', clinic_break_duration: '60', clinic_average_appointment_time: '30' };
const date = '2030-11-25';
const at = (time: string) => new Date(`${date}T${time}:00-05:00`);
const now = new Date('2030-11-25T06:00:00-05:00');

describe('Authoritative appointment scheduling rules', () => {
    const policy = parseClinicSchedulingPolicy(rules);

    it.each([
        ['08:00', '08:30'], ['11:30', '12:00'], ['13:00', '13:30'], ['17:30', '18:00'],
    ])('allows opening, closing and adjacent break boundaries %s–%s', (start, end) => {
        expect(() => validateAppointmentSlot(policy, at(start), at(end), now)).not.toThrow();
    });

    it.each([
        ['07:30', '08:00'], ['18:00', '18:30'], ['08:15', '08:45'], ['08:00', '08:15'],
        ['12:00', '12:30'], ['12:30', '13:00'], ['23:30', '00:00'],
    ])('rejects out of hours, off-grid, wrong duration and break slot %s–%s', (start, end) => {
        expect(() => validateAppointmentSlot(policy, at(start), at(end), now)).toThrow(BadRequestException);
    });

    it('enforces the same one hour boundary down to a millisecond', () => {
        expect(() => validateAppointmentSlot(policy, at('08:00'), at('08:30'), at('07:00'))).not.toThrow();
        expect(() => validateAppointmentSlot(policy, at('08:00'), at('08:30'), new Date(at('07:00').getTime() + 1))).toThrow('una hora');
    });

    it('rejects invalid dates, seconds, milliseconds and storage overflow without rounding them', () => {
        for (const start of [new Date(NaN), new Date(at('08:00').getTime() + 1000), new Date(at('08:00').getTime() + 1), new Date('2038-01-20T08:00:00-05:00')]) {
            expect(() => validateAppointmentSlot(policy, start, new Date(start.getTime() + 1_800_000), now)).toThrow(BadRequestException);
        }
    });

    it('uses the Colombian day rather than the UTC day and permits an end exactly at midnight', () => {
        const evening = parseClinicSchedulingPolicy({ ...rules, clinic_opening_time: '20:00', clinic_close_time: '24:00', clinic_break_duration: '0', clinic_break_time: '' });
        expect(() => validateAppointmentSlot(evening, new Date('2030-11-29T23:30:00-05:00'), new Date('2030-11-30T00:00:00-05:00'), now)).not.toThrow();
        expect(() => validateAppointmentSlot(evening, new Date('2030-12-01T23:00:00-05:00'), new Date('2030-12-01T23:30:00-05:00'), now)).toThrow(BadRequestException);
    });

    it.each([
        { clinic_opening_time: '08:60' }, { clinic_opening_time: '24:00' }, { clinic_close_time: '8:0' },
        { clinic_close_time: '08:00' }, { clinic_close_time: '07:00' }, { clinic_break_time: 'bad' },
        { clinic_break_time: '07:30' }, { clinic_break_time: '17:30' }, { clinic_break_duration: '-1' },
        { clinic_break_duration: '1.5' }, { clinic_average_appointment_time: '0' }, { clinic_average_appointment_time: 'abc' },
        { clinic_average_appointment_time: '601' }, { clinic_opening_time: null }, { clinic_break_duration: null },
    ])('fails closed for invalid clinic configuration %j', change => {
        expect(() => parseClinicSchedulingPolicy({ ...rules, ...change } as unknown as ClinicScheduleRules)).toThrow('configuración');
    });

    it('accepts legacy single digit hours and disabled breaks', () => {
        expect(parseClinicSchedulingPolicy({ ...rules, clinic_opening_time: '8:00', clinic_break_duration: '0', clinic_break_time: '' }).breakStart).toBeNull();
        expect(parseClinicSchedulingPolicy({ ...rules, clinic_break_duration: null, clinic_break_time: null }).breakStart).toBeNull();
        expect(parseClinicSchedulingPolicy({ ...rules, clinic_break_duration: '', clinic_break_time: '' }).breakStart).toBeNull();
        expect(() => parseClinicSchedulingPolicy({ ...rules, clinic_break_duration: '30', clinic_break_time: null })).toThrow('configuración');
    });

    it('does not restart the slot grid after a break and marks every partial break overlap', () => {
        const grid = parseClinicSchedulingPolicy({ ...rules, clinic_average_appointment_time: '20', clinic_break_time: '12:50', clinic_break_duration: '40' });
        const slots = createAvailabilitySlots(grid, date, now, []);
        expect(slots.find(slot => slot.start_date_time === at('12:40').toISOString())?.status).toBe('break');
        expect(slots.find(slot => slot.start_date_time === at('13:20').toISOString())?.status).toBe('break');
        expect(slots.find(slot => slot.start_date_time === at('13:40').toISOString())?.status).toBe('available');
        expect(slots.some(slot => slot.start_date_time === at('13:30').toISOString())).toBe(false);
        expect(() => validateAppointmentSlot(grid, at('13:30'), at('13:50'), now)).toThrow(BadRequestException);
    });

    it('builds privacy-safe slots with strict overlap, exact cutoff and own-slot exclusion', () => {
        const busy = [{ start: at('08:30').getTime(), end: at('09:00').getTime() }, { start: at('10:00').getTime(), end: at('10:15').getTime() }];
        const slots = createAvailabilitySlots(policy, date, at('08:00'), busy, { start: at('09:30').getTime(), end: at('10:00').getTime() });
        const status = (time: string) => slots.find(slot => slot.start_date_time === at(time).toISOString())?.status;
        expect(status('08:00')).toBe('past');
        expect(status('08:30')).toBe('booked');
        expect(status('09:00')).toBe('available');
        expect(status('09:30')).toBe('current');
        expect(status('10:00')).toBe('booked');
        expect(status('10:30')).toBe('available');
        expect(createAvailabilitySlots(policy, date, new Date(at('08:00').getTime() + 1), [])[2].status).toBe('too_soon');
        expect(slots.every(slot => Object.keys(slot).sort().join(',') === 'end_date_time,start_date_time,status')).toBe(true);
    });

    it('returns no slots on closed clinics or Colombian weekends', () => {
        expect(createAvailabilitySlots({ ...policy, isOpen: false }, date, now, [])).toEqual([]);
        expect(createAvailabilitySlots(policy, '2030-11-30', now, [])).toEqual([]);
        expect(createAvailabilitySlots(policy, '2030-12-01', now, [])).toEqual([]);
    });

    it.each(['2030-02-30', '2030-13-01', '2030-00-10', '2030-11-00', '2030-1-01', '2030-11-25T00:00:00Z', '', undefined])('rejects invalid day query %s', value => {
        expect(() => validateSchedulingDate(value as string)).toThrow(BadRequestException);
    });
});
