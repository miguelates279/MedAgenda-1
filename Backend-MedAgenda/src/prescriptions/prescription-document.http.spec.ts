import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';
import { DatabaseService } from '../db/database.service';
import { PrescriptionsController } from './prescriptions.controller';
import { PrescriptionsService } from './prescriptions.service';

describe('Prescription document HTTP access', () => {
    let app: INestApplication;
    let saved: Record<string, unknown> | undefined;
    const emittedAt = Date.parse('2026-11-26T14:12:30Z') / 1000;
    const db = { query: jest.fn(), execute: jest.fn() };

    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [PrescriptionsController],
            providers: [PrescriptionsService, { provide: DatabaseService, useValue: db }],
        }).overrideGuard(JwtAuthGuard).useValue({
            canActivate(context) {
                const req = context.switchToHttp().getRequest();
                const value = /^Bearer user-(\d+)$/.exec(req.headers.authorization || '');
                if (!value) throw new UnauthorizedException();
                req.user = { id: Number(value[1]) };
                return true;
            },
        }).compile();
        app = module.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
        await app.init();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        saved = {
            prescription_id: 7, doctor_id: 101, patient_id: 201, clinic_id: 2,
            clinic_name: 'Clínica Ñandú', clinic_address: 'Calle 8 # 4-20', clinic_phone: '+573001234567',
            doctor_name: 'Samuel José Pérez Díaz', patient_name: 'María Elena Muñoz Peña',
            prescription_description: 'Indicación original\n2 × día, después de comer. <sin modificar>', emitted_at_seconds: emittedAt,
        };
        db.query.mockImplementation(async (_sql, params) => saved && params[0] === 7 ? [{ ...saved }] : []);
        db.execute.mockImplementation(async (sql, params) => {
            if (sql.startsWith('UPDATE')) saved!.prescription_description = params[0];
            if (sql.startsWith('DELETE')) saved = undefined;
            return { affectedRows: 1 };
        });
    });

    afterAll(async () => { await app.close(); });

    it.each([101, 201])('returns the persisted document only to its author or patient (%s)', async actor => {
        const response = await request(app.getHttpServer()).get('/prescriptions/7/document')
            .set('Authorization', `Bearer user-${actor}`).expect(200);
        expect(response.headers['cache-control']).toBe('private, no-store');
        expect(response.body).toEqual({
            prescription_id: 7, doctor_id: 101, patient_id: 201, clinic_id: 2,
            clinic_name: 'Clínica Ñandú', clinic_address: 'Calle 8 # 4-20', clinic_phone: '+573001234567',
            doctor_name: 'Samuel José Pérez Díaz', patient_name: 'María Elena Muñoz Peña',
            prescription_description: saved!.prescription_description, date_emitted: '2026-11-26T14:12:30.000Z',
        });
        expect(response.body).not.toHaveProperty('emitted_at_seconds');
        expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE p.prescription_id = ?'), [7]);
    });

    it.each([102, 202, 301, 302, 401])('rejects another account regardless of its clinic role (%s)', async actor => {
        const response = await request(app.getHttpServer()).get('/prescriptions/7/document')
            .set('Authorization', `Bearer user-${actor}`).expect(403);
        expect(JSON.stringify(response.body)).not.toContain('Indicación original');
        expect(response.body).not.toHaveProperty('patient_name');
    });

    it('requires authentication before looking up saved medical data', async () => {
        await request(app.getHttpServer()).get('/prescriptions/7/document').expect(401);
        expect(db.query).not.toHaveBeenCalled();
    });

    it.each(['0', '-1', '1.5', 'NaN', '1e2', '2147483648', '9007199254740993'])('rejects invalid prescription identifiers %s before querying', async id => {
        await request(app.getHttpServer()).get(`/prescriptions/${id}/document`)
            .set('Authorization', 'Bearer user-201').expect(400);
        expect(db.query).not.toHaveBeenCalled();
    });

    it.each([null, undefined, NaN, Infinity, '', 'invalid', 1e20])('refuses an export when the saved emission time is invalid (%s)', async invalid => {
        saved!.emitted_at_seconds = invalid;
        const response = await request(app.getHttpServer()).get('/prescriptions/7/document')
            .set('Authorization', 'Bearer user-201').expect(409);
        expect(response.body.message).toContain('fecha de emisión válida');
        expect(response.body).not.toHaveProperty('date_emitted');
        expect(response.body).not.toHaveProperty('prescription_description');
    });

    it('preserves a valid epoch zero instead of confusing it with a missing date', async () => {
        saved!.emitted_at_seconds = 0;
        const response = await request(app.getHttpServer()).get('/prescriptions/7/document')
            .set('Authorization', 'Bearer user-201').expect(200);
        expect(response.body.date_emitted).toBe('1970-01-01T00:00:00.000Z');
    });

    it('checks ownership before reporting invalid saved metadata', async () => {
        saved!.emitted_at_seconds = null;
        await request(app.getHttpServer()).get('/prescriptions/7/document')
            .set('Authorization', 'Bearer user-401').expect(403);
    });

    it('returns 404 for a missing prescription', async () => {
        await request(app.getHttpServer()).get('/prescriptions/8/document')
            .set('Authorization', 'Bearer user-201').expect(404);
    });

    it('refetches a saved update without changing the original emission time and rejects a deleted document', async () => {
        await request(app.getHttpServer()).get('/prescriptions/7/document').set('Authorization', 'Bearer user-201').expect(200);
        const updated = 'Nueva indicación\n10 mg & seguimiento <mañana>';
        await request(app.getHttpServer()).put('/prescriptions/7').set('Authorization', 'Bearer user-101')
            .send({ prescription_description: updated }).expect(200);
        const response = await request(app.getHttpServer()).get('/prescriptions/7/document')
            .set('Authorization', 'Bearer user-201').expect(200);
        expect(response.body.prescription_description).toBe(updated);
        expect(response.body.date_emitted).toBe('2026-11-26T14:12:30.000Z');
        await request(app.getHttpServer()).delete('/prescriptions/7').set('Authorization', 'Bearer user-101').expect(200);
        await request(app.getHttpServer()).get('/prescriptions/7/document').set('Authorization', 'Bearer user-201').expect(404);
    });

    it('keeps editing and deleting restricted to the author when the patient can export', async () => {
        await request(app.getHttpServer()).put('/prescriptions/7').set('Authorization', 'Bearer user-201')
            .send({ prescription_description: 'unauthorized' }).expect(403);
        await request(app.getHttpServer()).delete('/prescriptions/7').set('Authorization', 'Bearer user-201').expect(403);
        expect(db.execute).not.toHaveBeenCalled();
    });
});
