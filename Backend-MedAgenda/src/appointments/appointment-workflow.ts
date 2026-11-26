import { hasMinimumAppointmentAdvance } from './appointment-scheduling';

export const APPOINTMENT_STATUSES = ['scheduled', 'confirmed', 'waiting', 'called', 'in_progress', 'completed', 'cancelled', 'no_show'] as const;
export const APPOINTMENT_ACTIONS = ['confirm', 'check_in', 'call', 'start', 'complete', 'no_show', 'cancel'] as const;
export type AppointmentStatus = typeof APPOINTMENT_STATUSES[number];
export type AppointmentAction = typeof APPOINTMENT_ACTIONS[number];
export type AppointmentRole = 'Owner' | 'Admin' | 'Doctor' | 'Employee' | null;

export interface AppointmentWorkflowContext {
    appointment_status: AppointmentStatus;
    start_date_time: string;
    patient_id: number;
    doctor_id: number;
    actor_role: AppointmentRole;
}

export interface AppointmentStateView {
    appointment_id: number;
    appointment_status: AppointmentStatus;
    status_version: number;
    status_updated_at: string | null;
    allowed_actions: AppointmentAction[];
    can_reschedule: boolean;
    can_edit_notes: boolean;
    minimum_advance_minutes: number;
    change_deadline: string;
    server_now: string;
}

const PRECONSULT_STATUSES: readonly AppointmentStatus[] = ['scheduled', 'confirmed', 'waiting', 'called'];

export function clinicDate(value: Date): string {
    return new Date(value.getTime() - 5 * 60 * 60_000).toISOString().slice(0, 10);
}

export function canEditAppointmentNotes(appointment: AppointmentWorkflowContext, actorId: number, now = new Date(Date.now())): boolean {
    return appointment.patient_id === actorId &&
        ['scheduled', 'confirmed'].includes(appointment.appointment_status) &&
        Date.parse(appointment.start_date_time) > now.getTime();
}

export function canRescheduleAppointment(appointment: AppointmentWorkflowContext, actorId: number, now = new Date(Date.now())): boolean {
    return canEditAppointmentNotes(appointment, actorId, now) &&
        hasMinimumAppointmentAdvance(Date.parse(appointment.start_date_time), now.getTime());
}

export function allowedAppointmentActions(appointment: AppointmentWorkflowContext, actorId: number, now = new Date(Date.now())): AppointmentAction[] {
    const start = new Date(appointment.start_date_time);
    if (!Number.isFinite(start.getTime())) return [];
    const patient = appointment.patient_id === actorId;
    const staff = ['Owner', 'Admin', 'Employee'].includes(appointment.actor_role ?? '');
    const doctor = appointment.doctor_id === actorId && ['Owner', 'Admin', 'Doctor'].includes(appointment.actor_role ?? '');
    const future = start.getTime() > now.getTime();
    const today = clinicDate(start) === clinicDate(now);
    const actions: AppointmentAction[] = [];
    const status = appointment.appointment_status;
    if (status === 'scheduled' && future && (patient || staff)) actions.push('confirm');
    if (['scheduled', 'confirmed'].includes(status) && today && (patient || staff)) actions.push('check_in');
    if (['scheduled', 'confirmed', 'waiting'].includes(status) && today && (doctor || staff)) actions.push('call');
    if (['waiting', 'called'].includes(status) && today && doctor) actions.push('start');
    if (status === 'in_progress' && doctor) actions.push('complete');
    if (['scheduled', 'confirmed', 'called'].includes(status) && today && !future && (doctor || staff)) actions.push('no_show');
    if (PRECONSULT_STATUSES.includes(status) && (patient || staff) &&
        hasMinimumAppointmentAdvance(start.getTime(), now.getTime())) actions.push('cancel');
    return actions;
}

export function statusForAppointmentAction(action: AppointmentAction): AppointmentStatus {
    const statuses: Record<AppointmentAction, AppointmentStatus> = {
        confirm: 'confirmed', check_in: 'waiting', call: 'called', start: 'in_progress',
        complete: 'completed', no_show: 'no_show', cancel: 'cancelled',
    };
    return statuses[action];
}
