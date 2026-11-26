import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppointmentsController } from './appointments.controller';
import { AppointmentAvailabilityController } from './appointment-availability.controller';
import { AppointmentsService } from './appointments.service';
import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';

describe('Authenticated appointment HTTP routes', () => {
    let app: INestApplication;
    const service = { updateAppointment: jest.fn(async () => ({ message: 'updated' })),
        deleteAppointment: jest.fn(async () => ({ message: 'cancelled' })),
        performAction: jest.fn(async () => ({ appointment_id: 7, appointment_status: 'confirmed', status_version: 1 })),
        getDispatchClinics: jest.fn(async () => []), getClinicAppointments: jest.fn(async () => []),
        createAppointment: jest.fn(async () => undefined), getAvailability: jest.fn(async () => ({ slots: [] })),
        getReschedulingAvailability: jest.fn(async () => ({ slots: [] })),
        getAppointment: jest.fn(async () => ({ appointment_id: 7 })) };

    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [AppointmentAvailabilityController, AppointmentsController],
            providers: [{ provide: AppointmentsService, useValue: service }],
        }).overrideGuard(JwtAuthGuard).useValue({
            canActivate(context) { context.switchToHttp().getRequest().user = { id: 42 }; return true; },
        }).compile();
        app = module.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
        await app.init();
    });
    beforeEach(() => jest.clearAllMocks());
    afterAll(async () => { await app.close(); });

    it('DELETE derives patient identity from the session, not the request', async () => {
        await request(app.getHttpServer()).delete('/appointments/7').expect(200, { message: 'cancelled' });
        expect(service.deleteAppointment).toHaveBeenCalledWith(7, 42);
    });
    it('PUT converts ISO dates before calling the service', async () => {
        await request(app.getHttpServer()).put('/appointments/7').send({
            start_date_time: '2030-11-25T09:00:00-05:00', end_date_time: '2030-11-25T09:30:00-05:00',
        }).expect(200);
        expect(service.updateAppointment).toHaveBeenCalledWith(7, 42, expect.objectContaining({
            start_date_time: new Date('2030-11-25T14:00:00Z'), end_date_time: new Date('2030-11-25T14:30:00Z'),
        }));
    });
    it('rejects malformed, null and injected identity fields', async () => {
        for (const body of [{ start_date_time: 'bad' }, { start_date_time: null },
            { end_date_time: null }, { patient_id: 99, appointment_description: 'test' }]) {
            await request(app.getHttpServer()).put('/appointments/7').send(body).expect(400);
        }
        expect(service.updateAppointment).not.toHaveBeenCalled();
    });
    it('rejects invalid route identifiers', async () => {
        await request(app.getHttpServer()).delete('/appointments/not-a-number').expect(400);
        expect(service.deleteAppointment).not.toHaveBeenCalled();
    });
    it('derives action identity from the authenticated session and requires the observed version', async () => {
        await request(app.getHttpServer()).post('/appointments/7/actions').send({ action: 'confirm', expected_version: 0 }).expect(200);
        expect(service.performAction).toHaveBeenCalledWith(7, 42, expect.objectContaining({ action: 'confirm', expected_version: 0 }));
    });
    it('rejects unknown actions, missing or invalid versions and injected actor identity', async () => {
        for (const body of [{ action: 'complete' }, { action: 'made_up', expected_version: 0 },
            { action: 'confirm', expected_version: null }, { action: 'confirm', expected_version: -1 },
            { action: 'confirm', expected_version: 1.5 }, { action: 'confirm', expected_version: '0' },
            { action: 'confirm', expected_version: 0, actor_user_id: 99 }]) {
            await request(app.getHttpServer()).post('/appointments/7/actions').send(body).expect(400);
        }
        expect(service.performAction).not.toHaveBeenCalled();
    });
    it('routes dispatch discovery before the appointment identifier route', async () => {
        await request(app.getHttpServer()).get('/appointments/dispatch-clinics').expect(200, []);
        expect(service.getDispatchClinics).toHaveBeenCalledWith(42);
        expect(service.getAppointment).not.toHaveBeenCalled();
        await request(app.getHttpServer()).get('/appointments/clinic/2?date=2030-11-25').expect(200, []);
        expect(service.getClinicAppointments).toHaveBeenCalledWith(2, 42, '2030-11-25');
    });

    it('keeps public availability unauthenticated and derives private availability identity from the session', async () => {
        await request(app.getHttpServer()).get('/appointments/availability/day?clinic_id=2&doctor_id=3&date=2030-11-25').expect(200, { slots: [] });
        expect(service.getAvailability).toHaveBeenCalledWith(2, 3, '2030-11-25');
        await request(app.getHttpServer()).get('/appointments/7/availability?date=2030-11-25').expect(200, { slots: [] });
        expect(service.getReschedulingAvailability).toHaveBeenCalledWith(7, 42, '2030-11-25');
        expect(service.getAppointment).not.toHaveBeenCalled();
    });

    it('rejects public identity injection, ambiguous identifiers and private exclusion attempts', async () => {
        for (const query of ['clinic_id=2&doctor_id=3&date=2030-11-25&exclude_appointment_id=7',
            'clinic_id=0&doctor_id=3&date=2030-11-25', 'clinic_id=2&doctor_id=3.5&date=2030-11-25',
            'clinic_id=2&doctor_id=3', 'clinic_id=2&clinic_id=3&doctor_id=3&date=2030-11-25']) {
            await request(app.getHttpServer()).get(`/appointments/availability/day?${query}`).expect(400);
        }
        await request(app.getHttpServer()).get('/appointments/7/availability?date=2030-11-25&patient_id=99').expect(400);
        expect(service.getAvailability).not.toHaveBeenCalled();
        expect(service.getReschedulingAvailability).not.toHaveBeenCalled();
    });

    it('rejects normalized impossible dates, timezone-less timestamps and non-string instants on create and update', async () => {
        for (const value of ['2030-02-30T09:00:00-05:00', '2030-11-25T09:00:00', '2030-11-25',
            '2030-11-25T24:00:00Z', '2030-11-25T09:00:00+25:00', '2030-11-25T09:00:00.000001Z', 1921831200000, null]) {
            await request(app.getHttpServer()).post('/appointments/scheduleAppointment').send({
                clinic_id: 2, doctor_id: 3, start_date_time: value, end_date_time: '2030-11-25T09:30:00-05:00',
            }).expect(400);
            await request(app.getHttpServer()).put('/appointments/7').send({ start_date_time: value, end_date_time: '2030-11-25T09:30:00-05:00' }).expect(400);
        }
        expect(service.createAppointment).not.toHaveBeenCalled();
        expect(service.updateAppointment).not.toHaveBeenCalled();
    });

});
