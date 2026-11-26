import { BadRequestException } from '@nestjs/common';
import type { ClinicScheduleRules } from '../clinics/repo/reads';

export const MINIMUM_APPOINTMENT_ADVANCE_MINUTES = 60;
export const APPOINTMENT_TIME_ZONE = 'America/Bogota';
const MINUTE = 60_000;
const TIMESTAMP_MIN = Date.parse('1970-01-01T00:00:01.000Z');
const TIMESTAMP_MAX = Date.parse('2038-01-19T03:14:07.000Z');

export type AvailabilityStatus = 'available' | 'booked' | 'break' | 'past' | 'too_soon' | 'unavailable' | 'current';
export interface AvailabilitySlot {
    start_date_time: string;
    end_date_time: string;
    status: AvailabilityStatus;
}
export interface AppointmentAvailability {
    clinic_id: number;
    doctor_id: number;
    date: string;
    time_zone: typeof APPOINTMENT_TIME_ZONE;
    server_now: string;
    minimum_advance_minutes: number;
    duration_minutes: number;
    unavailable_reason: 'closed' | 'weekend' | null;
    slots: AvailabilitySlot[];
}
export interface ClinicSchedulingPolicy {
    isOpen: boolean;
    opening: number;
    closing: number;
    duration: number;
    breakStart: number | null;
    breakEnd: number | null;
}
export interface BusyInterval {
    start: number;
    end: number;
}

function configurationError(): never {
    throw new BadRequestException('La configuración del horario de la clínica no es válida. Contacta a la clínica.');
}

function minuteOfDay(value: unknown, allowMidnight = false): number {
    if (typeof value !== 'string' || !/^\d{1,2}:\d{2}$/.test(value)) return configurationError();
    const [hour, minute] = value.split(':').map(Number);
    if (hour === 24 && minute === 0 && allowMidnight) return 1440;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return configurationError();
    return hour * 60 + minute;
}

function integerMinutes(value: unknown): number {
    if ((typeof value !== 'number' && typeof value !== 'string') || !/^\d+$/.test(String(value))) return configurationError();
    const minutes = Number(value);
    if (!Number.isSafeInteger(minutes)) return configurationError();
    return minutes;
}

export function parseClinicSchedulingPolicy(rules: ClinicScheduleRules): ClinicSchedulingPolicy {
    const opening = minuteOfDay(rules.clinic_opening_time);
    const closing = minuteOfDay(rules.clinic_close_time, true);
    const duration = integerMinutes(rules.clinic_average_appointment_time);
    const absent = (value: unknown) => value === null || value === undefined || value === '';
    const breakDuration = absent(rules.clinic_break_duration) && absent(rules.clinic_break_time) ? 0 : integerMinutes(rules.clinic_break_duration);
    if (closing <= opening || duration <= 0 || duration > closing - opening) return configurationError();
    const breakStart = breakDuration === 0 ? null : minuteOfDay(rules.clinic_break_time);
    const breakEnd = breakStart === null ? null : breakStart + breakDuration;
    if (breakStart !== null && (breakStart < opening || breakEnd! > closing)) return configurationError();
    return { isOpen: rules.is_open === true || Number(rules.is_open) === 1, opening, closing, duration, breakStart, breakEnd };
}

export function validateSchedulingDate(date: string): number {
    const instant = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T00:00:00.000Z`) : NaN;
    if (!Number.isFinite(instant) || new Date(instant).toISOString().slice(0, 10) !== date) {
        throw new BadRequestException('La fecha debe ser válida y usar el formato AAAA-MM-DD.');
    }
    return Date.parse(`${date}T00:00:00.000-05:00`);
}

export function clinicDayUnavailableReason(policy: ClinicSchedulingPolicy, date: string): 'closed' | 'weekend' | null {
    const midnight = validateSchedulingDate(date);
    if (!policy.isOpen) return 'closed';
    const day = new Date(midnight - 5 * 60 * MINUTE).getUTCDay();
    return day === 0 || day === 6 ? 'weekend' : null;
}

export function hasMinimumAppointmentAdvance(start: number, now: number): boolean {
    return Number.isFinite(start) && start - now >= MINIMUM_APPOINTMENT_ADVANCE_MINUTES * MINUTE;
}

export function appointmentChangeDeadline(start: string): string {
    return new Date(Date.parse(start) - MINIMUM_APPOINTMENT_ADVANCE_MINUTES * MINUTE).toISOString();
}

export function isStoredAppointmentInstant(start: number): boolean {
    return Number.isFinite(start) && start >= TIMESTAMP_MIN && start <= TIMESTAMP_MAX;
}

export function intervalsOverlap(start: number, end: number, interval: BusyInterval): boolean {
    return start < interval.end && end > interval.start;
}

export function validateAppointmentSlot(policy: ClinicSchedulingPolicy, start: Date, end: Date, now: Date): void {
    if (!(start instanceof Date) || !(end instanceof Date) || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
        throw new BadRequestException('La cita debe tener un horario válido.');
    }
    if (!isStoredAppointmentInstant(start.getTime())) throw new BadRequestException('La fecha excede el rango admitido por la base de datos.');
    if (!hasMinimumAppointmentAdvance(start.getTime(), now.getTime())) {
        throw new BadRequestException('Debes agendar o reprogramar con al menos una hora de anticipación.');
    }
    const date = new Date(start.getTime() - 5 * 60 * MINUTE).toISOString().slice(0, 10);
    const midnight = validateSchedulingDate(date);
    if (clinicDayUnavailableReason(policy, date)) throw new BadRequestException('La clínica no atiende en la fecha seleccionada.');
    if (start.getUTCSeconds() !== 0 || start.getUTCMilliseconds() !== 0 || end.getUTCSeconds() !== 0 || end.getUTCMilliseconds() !== 0) {
        throw new BadRequestException('El horario debe coincidir exactamente con un turno de la clínica.');
    }
    if (end.getTime() - start.getTime() !== policy.duration * MINUTE) throw new BadRequestException('La duración debe coincidir con el horario de la clínica.');
    const startMinute = (start.getTime() - midnight) / MINUTE;
    const endMinute = (end.getTime() - midnight) / MINUTE;
    if (startMinute < policy.opening || endMinute > policy.closing || (startMinute - policy.opening) % policy.duration !== 0) {
        throw new BadRequestException('El horario debe coincidir con un turno dentro del horario de atención.');
    }
    if (policy.breakStart !== null && startMinute < policy.breakEnd! && endMinute > policy.breakStart) {
        throw new BadRequestException('El horario coincide con el descanso de la clínica.');
    }
}

export function createAvailabilitySlots(policy: ClinicSchedulingPolicy, date: string, now: Date, busy: BusyInterval[], current?: BusyInterval): AvailabilitySlot[] {
    const midnight = validateSchedulingDate(date);
    if (clinicDayUnavailableReason(policy, date)) return [];
    const slots: AvailabilitySlot[] = [];
    for (let minute = policy.opening; minute + policy.duration <= policy.closing; minute += policy.duration) {
        const start = midnight + minute * MINUTE;
        const end = start + policy.duration * MINUTE;
        let status: AvailabilityStatus = 'available';
        if (current && current.start === start && current.end === end) status = 'current';
        else if (policy.breakStart !== null && minute < policy.breakEnd! && minute + policy.duration > policy.breakStart) status = 'break';
        else if (busy.some(interval => intervalsOverlap(start, end, interval))) status = 'booked';
        else if (start <= now.getTime()) status = 'past';
        else if (!hasMinimumAppointmentAdvance(start, now.getTime())) status = 'too_soon';
        else if (!isStoredAppointmentInstant(start)) status = 'unavailable';
        slots.push({ start_date_time: new Date(start).toISOString(), end_date_time: new Date(end).toISOString(), status });
    }
    return slots;
}
