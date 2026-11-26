import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ClinicsController } from './clinics.controller';
import { ClinicsService } from './clinics.service';
import { AdminController } from '../admin/admin.controller';
import { AdminService } from '../admin/admin.service';
import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';

describe('Clinic management HTTP contracts', () => {
    let app: INestApplication;
    const clinics = { updateOwnerProvider: jest.fn(async () => ({ message: 'updated' })), getManagement: jest.fn(async () => ({ clinic_id: 2 })), updateManagement: jest.fn(async () => ({ clinic_id: 2 })),
        createClinic: jest.fn(async () => ({ clinic_id: 2 })), addSpecialtiesToClinic: jest.fn(async () => undefined) };
    const admin = { getClinicUsers: jest.fn(async () => []), searchUserByEmail: jest.fn(async () => ({})), updateUserRole: jest.fn(async () => ({})), removeMember: jest.fn(async () => ({})) };
    beforeAll(async () => {
        const module = await Test.createTestingModule({ controllers: [ClinicsController, AdminController],
            providers: [{ provide: ClinicsService, useValue: clinics }, { provide: AdminService, useValue: admin }] })
            .overrideGuard(JwtAuthGuard).useValue({ canActivate(context) { context.switchToHttp().getRequest().user = { id: 10 }; return true; } }).compile();
        app = module.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
        await app.init();
    });
    beforeEach(() => jest.clearAllMocks());
    afterAll(async () => { await app.close(); });

    it('derives actor identity from authentication and parses the explicit clinic scope', async () => {
        await request(app.getHttpServer()).get('/clinics/2/management').expect(200);
        expect(clinics.getManagement).toHaveBeenCalledWith(2, 10);
        await request(app.getHttpServer()).get('/admin/clinic-users?clinic_id=2').expect(200, []);
        expect(admin.getClinicUsers).toHaveBeenCalledWith(10, 2);
        await request(app.getHttpServer()).delete('/admin/clinics/2/members/20').expect(200);
        expect(admin.removeMember).toHaveBeenCalledWith(2, 20, 10);
    });

    it('derives owner provider identity from the token and accepts only clinical configuration', async () => {
        await request(app.getHttpServer()).put('/clinics/2/owner-provider').send({ isDoctor: true, specialty_id: 5 }).expect(200);
        expect(clinics.updateOwnerProvider).toHaveBeenCalledWith(2, 10, expect.objectContaining({ isDoctor: true, specialty_id: 5 }));
    });

    it.each([{}, { isDoctor: 1 }, { isDoctor: null }, { isDoctor: true, owner_id: 20 }, { isDoctor: true, clinic_owner: 20 },
        { isDoctor: true, role_within_clinic: 'Admin' }, { isDoctor: true, specialty_id: null }, { isDoctor: true, specialty_id: 1.5 }])('rejects invalid or protected owner-provider fields %j', async body => {
        await request(app.getHttpServer()).put('/clinics/2/owner-provider').send(body).expect(400);
        expect(clinics.updateOwnerProvider).not.toHaveBeenCalled();
    });

    it('does not silently select the first clinic or accept malformed scopes', async () => {
        for (const query of ['', '?clinic_id=bad', '?clinic_id=0', '?clinic_id=-1', '?clinic_id=1.5']) {
            await request(app.getHttpServer()).get('/admin/clinic-users' + query).expect(400);
        }
        await request(app.getHttpServer()).get('/admin/search-user?email=test@example.com').expect(400);
        expect(admin.getClinicUsers).not.toHaveBeenCalled();
        expect(admin.searchUserByEmail).not.toHaveBeenCalled();
    });

    it('normalizes an exact email search inside the requested clinic', async () => {
        await request(app.getHttpServer()).get('/admin/search-user?clinic_id=2&email=%20TEST%40Example.com%20').expect(200);
        expect(admin.searchUserByEmail).toHaveBeenCalledWith(10, 'test@example.com', 2);
    });

    it('accepts a partial schedule update with numeric duration and a disabled break', async () => {
        await request(app.getHttpServer()).put('/clinics/2/management').send({ clinic_average_appointment_time: 45, clinic_break_time: null, clinic_break_duration: 0 }).expect(200);
        expect(clinics.updateManagement).toHaveBeenCalledWith(2, 10, expect.objectContaining({ clinic_average_appointment_time: 45, clinic_break_time: null, clinic_break_duration: 0 }));
    });

    it.each([{ clinic_owner: 99 }, { clinic_id: 3 }, { role_within_clinic: 'Owner' }, { minimum_advance_minutes: 0 },
        { clinic_average_appointment_time: '30' }, { clinic_average_appointment_time: 0 }, { clinic_average_appointment_time: 1441 },
        { clinic_average_appointment_time: null }, { is_open: 1 }, { clinic_city_id: 1.5 }, { specialty_ids: [1, 1] },
        { clinic_name: '   ' }, { clinic_close_time: '25:00' }, { clinic_break_duration: -1 }])('rejects invalid data or protected fields %j', async body => {
        await request(app.getHttpServer()).put('/clinics/2/management').send(body).expect(400);
        expect(clinics.updateManagement).not.toHaveBeenCalled();
    });

    it('requires clinic scope and boolean role flags on membership updates', async () => {
        for (const body of [{ email: 'doctor@example.com', isDoctor: true, isAdmin: false },
            { clinic_id: 2, email: 'doctor@example.com', isDoctor: 1, isAdmin: false },
            { clinic_id: 2, email: 'doctor@example.com', isDoctor: true, isAdmin: false, actor_id: 99 }]) {
            await request(app.getHttpServer()).put('/admin/update-user-role').send(body).expect(400);
        }
        expect(admin.updateUserRole).not.toHaveBeenCalled();
        await request(app.getHttpServer()).put('/admin/update-user-role').send({ clinic_id: 2, email: 'doctor@example.com', isDoctor: true, isAdmin: false, specialty_id: 5 }).expect(200);
        expect(admin.updateUserRole).toHaveBeenCalledWith(10, expect.objectContaining({ clinic_id: 2, specialty_id: 5 }));
    });

    it('accepts a full-day configured clinic without truncating durations above three digits', async () => {
        await request(app.getHttpServer()).post('/clinics/createClinic').send({ clinic_name: 'Centro', clinic_phone_number: '+573001234567', clinic_city_id: 1, clinic_address: 'Calle 1',
            is_open: true, clinic_opening_time: '00:00', clinic_close_time: '24:00', clinic_average_appointment_time: 1440, clinic_break_duration: 0, clinic_break_time: null }).expect(201);
        expect(clinics.createClinic).toHaveBeenCalledWith(expect.objectContaining({ clinic_average_appointment_time: 1440 }), 10);
    });

    it('passes authenticated identity into the legacy specialty mutation instead of bypassing scope checks', async () => {
        await request(app.getHttpServer()).post('/clinics/addSpecialtiesToClinic').send({ clinic_id: 2, specialty_ids: [5] }).expect(201);
        expect(clinics.addSpecialtiesToClinic).toHaveBeenCalledWith(expect.objectContaining({ clinic_id: 2, specialty_ids: [5] }), 10);
    });
});
