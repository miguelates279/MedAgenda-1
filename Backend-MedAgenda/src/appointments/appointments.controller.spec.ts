import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';

describe('Authenticated appointment HTTP routes', () => {
    let app: INestApplication;
    const service = { updateAppointment: jest.fn(async () => ({ message: 'updated' })),
        deleteAppointment: jest.fn(async () => ({ message: 'cancelled' })) };

    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [AppointmentsController],
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
});
