import { plainToInstance } from 'class-transformer';
import { UpdateClinicDto } from './dto/clinic-management.dto';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ClinicManagementService } from './clinic-management.service';
import { DatabaseService } from '../db/database.service';
import { Roles } from '../auth/role_guard/roles.enum';
import * as reads from './repo/reads';
import * as writes from './repo/writes';
import * as managementReads from './repo/management-reads';
import * as managementWrites from './repo/management-writes';
import * as adminReads from '../admin/repo/reads';
import * as adminWrites from '../admin/repo/writes';

describe('Clinic management authorization and transaction rules', () => {
    let db: { query: jest.Mock; execute: jest.Mock; inTx: jest.Mock };
    let service: ClinicManagementService;
    let clinic: managementReads.ManagedClinicRow;
    let member: adminReads.ClinicUser;
    let role: Roles;
    const update = { clinic_id: 2, email: 'doctor@example.test', isDoctor: true, isAdmin: false, specialty_id: 5 };

    beforeEach(() => {
        clinic = { clinic_id: 2, clinic_owner: 10, clinic_name: 'Centro', is_open: 1, clinic_phone_number: '+573001234567',
            clinic_city_id: 1, clinic_address: 'Calle 1', clinic_description: null, clinic_opening_time: '08:00', clinic_close_time: '18:00',
            clinic_average_appointment_time: '30', clinic_break_time: '12:00', clinic_break_duration: '60' };
        member = { user_id: 20, clinic_id: 2, email: update.email, user_email_address: update.email, first_name: 'Ana', second_name: null,
            first_last_name: 'Ruiz', second_last_name: 'Gómez', phone_number: '3000000000', role_within_clinic: 'Doctor', is_member: true,
            isDoctor: true, isAdmin: false, specialty_id: 5, specialty_name: 'General', specialties: [{ specialty_id: 5, specialty_name: 'General' }] };
        role = Roles.Owner;
        db = { query: jest.fn(async () => []), execute: jest.fn(), inTx: jest.fn(async fn => fn(db)) };
        service = new ClinicManagementService(db as unknown as DatabaseService);
        jest.spyOn(managementReads, 'getManagedClinic').mockImplementation(async () => clinic);
        jest.spyOn(reads, 'getRoleByIds').mockImplementation(async () => ({ role_within_clinic: role }));
        jest.spyOn(managementReads, 'getClinicSpecialtyIds').mockResolvedValue([5, 6]);
        jest.spyOn(managementReads, 'getAssignedClinicSpecialties').mockResolvedValue([5]);
        jest.spyOn(managementReads, 'hasUnknownAppointmentDurations').mockResolvedValue(false);
        jest.spyOn(managementReads, 'hasPendingDoctorAppointments').mockResolvedValue(false);
        jest.spyOn(managementReads, 'hasClinicalRecords').mockResolvedValue(false);
        jest.spyOn(managementWrites, 'updateManagedClinic').mockResolvedValue();
        jest.spyOn(managementWrites, 'freezeLegacyDurations').mockResolvedValue();
        jest.spyOn(managementWrites, 'replaceClinicSpecialties').mockResolvedValue();
        jest.spyOn(managementWrites, 'replaceDoctorClinicSpecialties').mockResolvedValue();
        jest.spyOn(adminReads, 'searchUserByEmail').mockImplementation(async () => member);
        jest.spyOn(adminReads, 'getClinicUsers').mockImplementation(async () => [member]);
        jest.spyOn(adminWrites, 'addUserToClinic').mockResolvedValue();
        jest.spyOn(adminWrites, 'removeAllSpecialtiesFromDoctor').mockResolvedValue();
        jest.spyOn(writes, 'insertClinic').mockResolvedValue(2);
        jest.spyOn(writes, 'deleteClinic').mockResolvedValue(true);
    });
    afterEach(() => jest.restoreAllMocks());

    it('normalizes management metadata without deriving a clinic from the actor', async () => {
        expect(await service.getManagement(2, 10)).toMatchObject({ clinic_id: 2, city_id: 1, is_open: true, clinic_average_appointment_time: 30, clinic_break_duration: 60, role_within_clinic: 'Owner', specialty_ids: [5, 6] });
        expect(managementReads.getManagedClinic).toHaveBeenCalledWith(db, 2, false);
        await expect(service.getManagement(NaN, 10)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('requires the real clinic owner instead of trusting a fabricated Owner membership', async () => {
        await expect(service.getManagement(2, 99)).rejects.toBeInstanceOf(ForbiddenException);
        expect(adminReads.getClinicUsers).not.toHaveBeenCalled();
    });

    it.each([Roles.Doctor, Roles.Employee])('rejects the %s role before exposing clinic members', async forbidden => {
        role = forbidden;
        await expect(service.getMembers(2, 10)).rejects.toBeInstanceOf(ForbiddenException);
        expect(adminReads.getClinicUsers).not.toHaveBeenCalled();
    });

    it('freezes legacy durations before updating a clinic while holding its exclusive lock', async () => {
        await service.updateClinic(2, 10, { clinic_average_appointment_time: 45 });
        expect(managementReads.getManagedClinic).toHaveBeenCalledWith(db, 2, true);
        expect(managementWrites.freezeLegacyDurations).toHaveBeenCalledWith(db, 2, 30);
        expect((managementWrites.freezeLegacyDurations as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan((managementWrites.updateManagedClinic as jest.Mock).mock.invocationCallOrder[0]);
    });

    it('preserves existing rules when transformed DTO properties are undefined and rejects an empty patch', async () => {
        await service.updateClinic(2, 10, plainToInstance(UpdateClinicDto, { clinic_average_appointment_time: 45 }));
        expect(managementWrites.updateManagedClinic).toHaveBeenCalledWith(db, 2, { clinic_average_appointment_time: 45 });
        await expect(service.updateClinic(2, 10, plainToInstance(UpdateClinicDto, {}))).rejects.toBeInstanceOf(BadRequestException);
        expect(managementWrites.updateManagedClinic).toHaveBeenCalledTimes(1);
    });

    it('rejects inconsistent breaks before any persistent mutation', async () => {
        await expect(service.updateClinic(2, 10, { clinic_break_time: '17:45', clinic_break_duration: 60 })).rejects.toBeInstanceOf(BadRequestException);
        expect(managementWrites.freezeLegacyDurations).not.toHaveBeenCalled();
        expect(managementWrites.updateManagedClinic).not.toHaveBeenCalled();
    });

    it('does not reinterpret appointments with unknown legacy duration using a new clinic duration', async () => {
        clinic.clinic_average_appointment_time = null;
        (managementReads.hasUnknownAppointmentDurations as jest.Mock).mockResolvedValue(true);
        await expect(service.updateClinic(2, 10, { clinic_average_appointment_time: 45 })).rejects.toBeInstanceOf(ConflictException);
        expect(managementWrites.freezeLegacyDurations).not.toHaveBeenCalled();
        expect(managementWrites.updateManagedClinic).not.toHaveBeenCalled();
    });

    it('allows closing a clinic with its existing bookings and preserves their records', async () => {
        await service.updateClinic(2, 10, { is_open: false });
        expect(managementWrites.updateManagedClinic).toHaveBeenCalledWith(db, 2, { is_open: false });
        expect(db.execute).not.toHaveBeenCalled();
    });

    it('blocks removing an offered specialty still assigned to a doctor', async () => {
        db.query.mockResolvedValue([{ specialty_id: 6 }]);
        await expect(service.updateClinic(2, 10, { specialty_ids: [6] })).rejects.toBeInstanceOf(ConflictException);
        expect(managementWrites.replaceClinicSpecialties).not.toHaveBeenCalled();
    });

    it('creates a closed clinic when old clients omit schedule settings', async () => {
        db.query.mockResolvedValue([{ city_id: 1 }]);
        await service.createClinic({ clinic_name: 'Centro', clinic_phone_number: '+573001234567', clinic_address: 'Calle 1', clinic_city_id: 1 }, 10);
        expect(managementWrites.updateManagedClinic).toHaveBeenCalledWith(db, 2, expect.objectContaining({ is_open: false }));
    });

    it.each([
        { actor: 10, target: 10, currentRole: 'Owner', actorRole: Roles.Owner, nextAdmin: false },
        { actor: 30, target: 30, currentRole: 'Admin', actorRole: Roles.Admin, nextAdmin: false },
        { actor: 30, target: 20, currentRole: 'Admin', actorRole: Roles.Admin, nextAdmin: false },
        { actor: 30, target: 20, currentRole: 'Doctor', actorRole: Roles.Admin, nextAdmin: true },
    ])('protects ownership, self-membership and the administrative hierarchy: %j', async entry => {
        role = entry.actorRole;
        member.user_id = entry.target;
        member.role_within_clinic = entry.currentRole as adminReads.ClinicUser['role_within_clinic'];
        await expect(service.updateMember(entry.actor, { ...update, isAdmin: entry.nextAdmin })).rejects.toBeInstanceOf(ForbiddenException);
        expect(adminWrites.addUserToClinic).not.toHaveBeenCalled();
        expect(managementWrites.replaceDoctorClinicSpecialties).not.toHaveBeenCalled();
    });

    it('requires a specialty actually offered by the selected clinic', async () => {
        await expect(service.updateMember(10, { ...update, specialty_id: 999 })).rejects.toBeInstanceOf(BadRequestException);
        expect(adminWrites.addUserToClinic).not.toHaveBeenCalled();
    });

    it('changes only clinic-specific specialties while keeping global credentials untouched', async () => {
        await service.updateMember(10, update);
        expect(adminWrites.addUserToClinic).toHaveBeenCalledWith(db, 20, 2, 'Doctor');
        expect(managementWrites.replaceDoctorClinicSpecialties).toHaveBeenCalledWith(db, 2, 20, [5]);
        expect(adminWrites.removeAllSpecialtiesFromDoctor).not.toHaveBeenCalled();
        expect(db.query.mock.calls[0][0]).toContain('FOR UPDATE');
    });

    it('blocks demotion and removal while a doctor has pending appointments', async () => {
        (managementReads.hasPendingDoctorAppointments as jest.Mock).mockResolvedValue(true);
        await expect(service.updateMember(10, { ...update, isDoctor: false })).rejects.toBeInstanceOf(ConflictException);
        await expect(service.removeMember(2, 20, 10)).rejects.toBeInstanceOf(ConflictException);
        expect(adminWrites.addUserToClinic).not.toHaveBeenCalled();
        expect(managementWrites.replaceDoctorClinicSpecialties).not.toHaveBeenCalled();
        expect(db.execute).not.toHaveBeenCalled();
    });

    it('keeps legacy doctor additions without global specialties compatible and clinic-scoped', async () => {
        member.is_member = false;
        member.role_within_clinic = null;
        db.query.mockImplementation(async (sql: string) => sql.includes('FROM users') ? [{ user_email_address: update.email }] : []);
        await service.addLegacyMember({ clinic_id: 2, user_id: 20, role_within_clinic: Roles.Doctor }, 10);
        expect(adminWrites.addUserToClinic).toHaveBeenCalledWith(db, 20, 2, 'Doctor');
        expect(managementWrites.replaceDoctorClinicSpecialties).toHaveBeenCalledWith(db, 2, 20, []);
        expect(adminWrites.removeAllSpecialtiesFromDoctor).not.toHaveBeenCalled();
    });

    it('rejects duplicate legacy additions before overwriting existing clinic assignments', async () => {
        db.query.mockResolvedValue([{ user_email_address: update.email }]);
        await expect(service.addLegacyMember({ clinic_id: 2, user_id: 20, role_within_clinic: Roles.Doctor }, 10)).rejects.toBeInstanceOf(ConflictException);
        expect(adminWrites.addUserToClinic).not.toHaveBeenCalled();
        expect(managementWrites.replaceDoctorClinicSpecialties).not.toHaveBeenCalled();
    });

    it('lets the real owner become a provider without changing ownership, membership or global credentials', async () => {
        await service.updateOwnerProvider(2, 10, { isDoctor: true, specialty_id: 5 });
        expect(db.query).toHaveBeenCalledWith('SELECT user_id FROM users WHERE user_id=? FOR UPDATE', [10]);
        expect(managementReads.getManagedClinic).toHaveBeenCalledWith(db, 2, true);
        expect(managementWrites.replaceDoctorClinicSpecialties).toHaveBeenCalledWith(db, 2, 10, [5]);
        expect(adminWrites.addUserToClinic).not.toHaveBeenCalled();
        expect(adminWrites.removeAllSpecialtiesFromDoctor).not.toHaveBeenCalled();
        expect(managementWrites.updateManagedClinic).not.toHaveBeenCalled();
        expect(clinic.clinic_owner).toBe(10);
    });

    it.each([undefined, 999])('requires an offered owner specialty when enabling care: %j', async specialty => {
        await expect(service.updateOwnerProvider(2, 10, { isDoctor: true, specialty_id: specialty })).rejects.toBeInstanceOf(BadRequestException);
        expect(managementWrites.replaceDoctorClinicSpecialties).not.toHaveBeenCalled();
    });

    it('does not let an administrator configure the real owner provider', async () => {
        role = Roles.Admin;
        await expect(service.updateOwnerProvider(2, 30, { isDoctor: true, specialty_id: 5 })).rejects.toBeInstanceOf(ForbiddenException);
        expect(managementWrites.replaceDoctorClinicSpecialties).not.toHaveBeenCalled();
    });

    it('does not treat a fabricated Owner membership as actual clinic ownership', async () => {
        await expect(service.updateOwnerProvider(2, 99, { isDoctor: true, specialty_id: 5 })).rejects.toBeInstanceOf(ForbiddenException);
        expect(managementWrites.replaceDoctorClinicSpecialties).not.toHaveBeenCalled();
    });

    it('blocks owner provider deactivation with pending appointments', async () => {
        (managementReads.hasPendingDoctorAppointments as jest.Mock).mockResolvedValue(true);
        await expect(service.updateOwnerProvider(2, 10, { isDoctor: false })).rejects.toBeInstanceOf(ConflictException);
        expect(managementReads.hasPendingDoctorAppointments).toHaveBeenCalledWith(db, 2, 10, expect.any(Number));
        expect(managementWrites.replaceDoctorClinicSpecialties).not.toHaveBeenCalled();
    });

    it('deactivates only the owner provider in this clinic when no appointments are pending', async () => {
        await service.updateOwnerProvider(2, 10, { isDoctor: false });
        expect(managementWrites.replaceDoctorClinicSpecialties).toHaveBeenCalledWith(db, 2, 10, []);
        expect(adminWrites.addUserToClinic).not.toHaveBeenCalled();
        expect(adminWrites.removeAllSpecialtiesFromDoctor).not.toHaveBeenCalled();
    });

    it('preserves clinical history instead of deleting a clinic with references', async () => {
        (managementReads.hasClinicalRecords as jest.Mock).mockResolvedValue(true);
        await expect(service.deleteClinic(2, 10)).rejects.toBeInstanceOf(ConflictException);
        expect(writes.deleteClinic).not.toHaveBeenCalled();
        expect(db.execute).not.toHaveBeenCalled();
    });

    it('refuses deletion by an administrator even if the clinic is empty', async () => {
        role = Roles.Admin;
        await expect(service.deleteClinic(2, 30)).rejects.toBeInstanceOf(ForbiddenException);
        expect(writes.deleteClinic).not.toHaveBeenCalled();
    });
});
