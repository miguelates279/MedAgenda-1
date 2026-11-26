import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { DatabaseService } from '../db/database.service';

import { Db } from '../db/types/types';

import { MINIMUM_APPOINTMENT_ADVANCE_MINUTES, parseClinicSchedulingPolicy } from '../appointments/appointment-scheduling';

import * as ClinicReads from './repo/reads';

import * as ClinicWrites from './repo/writes';

import * as ManagementReads from './repo/management-reads';

import * as ManagementWrites from './repo/management-writes';

import * as AdminReads from '../admin/repo/reads';

import * as AdminWrites from '../admin/repo/writes';

import { OwnerProviderDto, UpdateClinicDto } from './dto/clinic-management.dto';

import { CreateClinicDto, AddMemberToClinicDto } from './dto/clinics.dto';

import { UpdateUserRoleDto } from '../admin/dto/admin.dto';



@Injectable()

export class ClinicManagementService {

    constructor(private readonly db: DatabaseService) {}



    private requireClinicId(clinicId: number): void {

        if (!Number.isSafeInteger(clinicId) || clinicId <= 0) throw new BadRequestException('Selecciona una clínica válida.');

    }



    private async manager(db: Db, clinicId: number, actorId: number, locked = false) {

        this.requireClinicId(clinicId);

        const clinic = await ManagementReads.getManagedClinic(db, clinicId, locked);

        if (!clinic) throw new NotFoundException('Clínica no encontrada.');

        const role = await ClinicReads.getRoleByIds(db, clinicId, actorId);

        if (!role || !['Owner', 'Admin'].includes(role.role_within_clinic) || (role.role_within_clinic === 'Owner' && clinic.clinic_owner !== actorId)) throw new ForbiddenException('No tienes permiso para administrar esta clínica.');

        return { clinic, role: role.role_within_clinic as 'Owner' | 'Admin' };

    }



    async getManagement(clinicId: number, actorId: number, db: Db = this.db) {

        const { clinic, role } = await this.manager(db, clinicId, actorId);

        return { ...clinic, is_open: Boolean(Number(clinic.is_open)), city_id: clinic.clinic_city_id,

            clinic_average_appointment_time: clinic.clinic_average_appointment_time === null ? null : Number(clinic.clinic_average_appointment_time),

            clinic_break_duration: clinic.clinic_break_duration === null ? null : Number(clinic.clinic_break_duration),

            specialty_ids: await ManagementReads.getClinicSpecialtyIds(db, clinicId), role_within_clinic: role };

    }



    private async validateReferences(db: Db, dto: UpdateClinicDto): Promise<void> {

        if (dto.clinic_city_id !== undefined && !(await db.query('SELECT city_id FROM cities WHERE city_id=?', [dto.clinic_city_id])).length) {

            throw new BadRequestException('La ciudad seleccionada no existe.');

        }

        if (dto.specialty_ids?.length) {

            const found = await db.query<{ specialty_id: number }>(`SELECT specialty_id FROM specialties WHERE specialty_id IN (${dto.specialty_ids.map(() => '?').join(',')})`, dto.specialty_ids);

            if (found.length !== dto.specialty_ids.length) throw new BadRequestException('Una de las especialidades seleccionadas no existe.');

        }

    }



    private validateRules(clinic: Partial<ManagementReads.ManagedClinicRow>, dto: UpdateClinicDto): void {

        const scheduleKeys = ['clinic_opening_time', 'clinic_close_time', 'clinic_average_appointment_time', 'clinic_break_time', 'clinic_break_duration'] as const;

        if (!scheduleKeys.some(key => dto[key] !== undefined) && dto.is_open !== true) return;

        const supplied = Object.fromEntries(Object.entries(dto).filter(([, value]) => value !== undefined));

        const merged = { ...clinic, ...supplied, minimum_advance_minutes: MINIMUM_APPOINTMENT_ADVANCE_MINUTES };

        parseClinicSchedulingPolicy(merged as ClinicReads.ClinicScheduleRules);

    }



    async createClinic(dto: CreateClinicDto, actorId: number): Promise<{ clinic_id: number }> {

        return this.db.inTx(async tx => {

            await this.validateReferences(tx, dto);

            const suppliedRules = dto.clinic_opening_time !== undefined || dto.clinic_close_time !== undefined || dto.clinic_average_appointment_time !== undefined;

            const values = { ...dto, is_open: dto.is_open ?? suppliedRules };

            this.validateRules({}, values);

            const clinicId = await ClinicWrites.insertClinic(tx, dto, actorId);

            await ManagementWrites.updateManagedClinic(tx, clinicId, values);

            if (dto.specialty_ids !== undefined) await ManagementWrites.replaceClinicSpecialties(tx, clinicId, dto.specialty_ids);

            return { clinic_id: clinicId };

        });

    }



    async updateClinic(clinicId: number, actorId: number, dto: UpdateClinicDto) {

        const patch = Object.fromEntries(Object.entries(dto).filter(([, value]) => value !== undefined)) as UpdateClinicDto;

        if (!Object.keys(patch).length) throw new BadRequestException('No hay cambios para guardar.');

        await this.db.inTx(async tx => {

            const { clinic } = await this.manager(tx, clinicId, actorId, true);

            await this.validateReferences(tx, patch);

            this.validateRules(clinic, patch);

            if (patch.specialty_ids !== undefined) {

                const assigned = await ManagementReads.getAssignedClinicSpecialties(tx, clinicId);

                if (assigned.some(id => !patch.specialty_ids!.includes(id))) throw new ConflictException('Una especialidad sigue asignada a un médico. Cambia o retira esa asignación antes de quitarla.');

            }

            const oldDuration = clinic.clinic_average_appointment_time;

            if (/^[0-9]*[1-9][0-9]*$/.test(String(oldDuration)) && Number(oldDuration) <= 1440) {

                await ManagementWrites.freezeLegacyDurations(tx, clinicId, Number(oldDuration));

            }

            if (patch.clinic_average_appointment_time !== undefined && await ManagementReads.hasUnknownAppointmentDurations(tx, clinicId)) {

                throw new ConflictException('Hay citas antiguas sin duración verificable. Deben revisarse antes de cambiar la duración de la clínica.');

            }

            await ManagementWrites.updateManagedClinic(tx, clinicId, patch);

            if (patch.specialty_ids !== undefined) await ManagementWrites.replaceClinicSpecialties(tx, clinicId, patch.specialty_ids);

        });

        return this.getManagement(clinicId, actorId);

    }



    async updateOwnerProvider(clinicId: number, actorId: number, dto: OwnerProviderDto): Promise<{ message: string }> {
        this.requireClinicId(clinicId);
        await this.db.inTx(async tx => {
            await tx.query('SELECT user_id FROM users WHERE user_id=? FOR UPDATE', [actorId]);
            const { clinic } = await this.manager(tx, clinicId, actorId, true);
            if (clinic.clinic_owner !== actorId) throw new ForbiddenException('Solo el propietario puede configurar su propia atención médica.');
            if (dto.isDoctor) {
                const offered = await ManagementReads.getClinicSpecialtyIds(tx, clinicId);
                if (!dto.specialty_id || !offered.includes(dto.specialty_id)) throw new BadRequestException('Selecciona una especialidad ofrecida por esta clínica.');
            } else if (await ManagementReads.hasPendingDoctorAppointments(tx, clinicId, actorId, Date.now())) {
                throw new ConflictException('Tienes citas pendientes por atender. Gestiona tu agenda antes de desactivar la atención médica.');
            }
            await ManagementWrites.replaceDoctorClinicSpecialties(tx, clinicId, actorId, dto.isDoctor ? [dto.specialty_id!] : []);
        });
        return { message: 'Tu atención médica en esta clínica se actualizó correctamente.' };
    }

    async deleteClinic(clinicId: number, actorId: number): Promise<void> {

        await this.db.inTx(async tx => {

            const { role } = await this.manager(tx, clinicId, actorId, true);

            if (role !== 'Owner') throw new ForbiddenException('Solo el propietario puede eliminar la clínica.');

            if (await ManagementReads.hasClinicalRecords(tx, clinicId)) throw new ConflictException('La clínica tiene historial clínico y no puede eliminarse. Puedes cerrarla para detener nuevas reservas.');

            await tx.execute('DELETE FROM clinic_doctor_specialties WHERE clinic_id=?', [clinicId]);

            await tx.execute('DELETE FROM clinic_specialties WHERE clinic_id=?', [clinicId]);

            await tx.execute('DELETE FROM clinic_members WHERE clinic_id=?', [clinicId]);

            if (!await ClinicWrites.deleteClinic(tx, clinicId, actorId)) throw new NotFoundException('Clínica no encontrada.');

        });

    }



    async getMembers(clinicId: number, actorId: number): Promise<AdminReads.ClinicUser[]> {

        await this.manager(this.db, clinicId, actorId);

        return AdminReads.getClinicUsers(this.db, clinicId);

    }



    async searchMember(clinicId: number, actorId: number, email: string): Promise<AdminReads.ClinicUser> {

        await this.manager(this.db, clinicId, actorId);

        const member = await AdminReads.searchUserByEmail(this.db, email.trim().toLowerCase(), clinicId);

        if (!member) throw new NotFoundException('No se encontró una cuenta con ese correo.');

        return member;

    }



    private protectMember(actorId: number, targetId: number, ownerId: number, actorRole: 'Owner' | 'Admin', currentRole: string | null, nextRole?: string): void {

        if (targetId === ownerId) throw new ForbiddenException('No puedes cambiar ni retirar al propietario de la clínica.');

        if (targetId === actorId) throw new ForbiddenException('No puedes cambiar tu propia membresía desde esta pantalla.');

        if (actorRole === 'Admin' && (currentRole === 'Admin' || nextRole === 'Admin')) throw new ForbiddenException('Solo el propietario puede administrar otros administradores.');

    }



    async updateMember(actorId: number, dto: UpdateUserRoleDto): Promise<{ message: string }> {

        this.requireClinicId(dto.clinic_id);

        await this.manager(this.db, dto.clinic_id, actorId);

        const target = await AdminReads.searchUserByEmail(this.db, dto.email.trim().toLowerCase(), dto.clinic_id);

        if (!target) throw new NotFoundException('No se encontró una cuenta con ese correo.');

        await this.db.inTx(async tx => {

            await tx.query('SELECT user_id FROM users WHERE user_id=? FOR UPDATE', [target.user_id]);

            const { clinic, role: actorRole } = await this.manager(tx, dto.clinic_id, actorId, true);

            const current = await AdminReads.searchUserByEmail(tx, dto.email.trim().toLowerCase(), dto.clinic_id);

            if (!current) throw new NotFoundException('Usuario no encontrado.');

            const nextRole = dto.isAdmin ? 'Admin' : dto.isDoctor ? 'Doctor' : 'Employee';

            this.protectMember(actorId, current.user_id, clinic.clinic_owner, actorRole, current.role_within_clinic, nextRole);

            if (dto.isDoctor) {

                const offered = await ManagementReads.getClinicSpecialtyIds(tx, dto.clinic_id);

                if (!dto.specialty_id || !offered.includes(dto.specialty_id)) throw new BadRequestException('Selecciona una especialidad ofrecida por esta clínica.');

            }

            if (!dto.isDoctor && await ManagementReads.hasPendingDoctorAppointments(tx, dto.clinic_id, target.user_id, Date.now())) {

                throw new ConflictException('El médico tiene citas pendientes. Gestiona su agenda antes de cambiar su función.');

            }

            await AdminWrites.addUserToClinic(tx, target.user_id, dto.clinic_id, nextRole);

            await ManagementWrites.replaceDoctorClinicSpecialties(tx, dto.clinic_id, target.user_id, dto.isDoctor ? [dto.specialty_id!] : []);

        });

        return { message: 'La membresía se actualizó correctamente.' };

    }



    async removeMember(clinicId: number, targetId: number, actorId: number): Promise<{ message: string }> {

        await this.manager(this.db, clinicId, actorId);

        await this.db.inTx(async tx => {

            await tx.query('SELECT user_id FROM users WHERE user_id=? FOR UPDATE', [targetId]);

            const { clinic, role } = await this.manager(tx, clinicId, actorId, true);

            const current = (await AdminReads.getClinicUsers(tx, clinicId)).find(user => user.user_id === targetId);

            if (!current) throw new NotFoundException('El usuario no pertenece a esta clínica.');

            this.protectMember(actorId, targetId, clinic.clinic_owner, role, current.role_within_clinic);

            if (await ManagementReads.hasPendingDoctorAppointments(tx, clinicId, targetId, Date.now())) throw new ConflictException('El médico tiene citas pendientes. Gestiona su agenda antes de retirarlo.');

            await ManagementWrites.replaceDoctorClinicSpecialties(tx, clinicId, targetId, []);

            await tx.execute('DELETE FROM clinic_members WHERE clinic_id=? AND user_id=?', [clinicId, targetId]);

        });

        return { message: 'El miembro fue retirado de esta clínica.' };

    }



    async addLegacyMember(dto: AddMemberToClinicDto, actorId: number): Promise<void> {

        await this.manager(this.db, dto.clinic_id, actorId);

        if (!['Admin', 'Doctor', 'Employee'].includes(dto.role_within_clinic)) throw new ForbiddenException('No puedes asignar el rol de propietario.');

        await this.db.inTx(async tx => {

            const target = (await tx.query<{ user_email_address: string }>('SELECT user_email_address FROM users WHERE user_id=? FOR UPDATE', [dto.user_id]))[0];

            if (!target) throw new NotFoundException('Usuario no encontrado.');

            const { clinic, role } = await this.manager(tx, dto.clinic_id, actorId, true);

            const current = await AdminReads.searchUserByEmail(tx, target.user_email_address, dto.clinic_id);

            this.protectMember(actorId, dto.user_id, clinic.clinic_owner, role, current?.role_within_clinic ?? null, dto.role_within_clinic);

            if (current?.is_member) throw new ConflictException('El usuario ya pertenece a esta clínica.');

            const specialties = dto.role_within_clinic === 'Employee' ? [] :

                (await tx.query<{ specialty_id: number }>('SELECT specialty_id FROM doctor_specialties WHERE doctor_id=? ORDER BY specialty_id', [dto.user_id])).map(row => Number(row.specialty_id));

            if (specialties.length) {

                const offered = await ManagementReads.getClinicSpecialtyIds(tx, dto.clinic_id);

                await ManagementWrites.replaceClinicSpecialties(tx, dto.clinic_id, [...new Set([...offered, ...specialties])]);

            }

            await AdminWrites.addUserToClinic(tx, dto.user_id, dto.clinic_id, dto.role_within_clinic as 'Admin' | 'Doctor' | 'Employee');

            await ManagementWrites.replaceDoctorClinicSpecialties(tx, dto.clinic_id, dto.user_id, specialties);

            if (dto.role_description !== undefined) await tx.execute('UPDATE clinic_members SET role_description=? WHERE clinic_id=? AND user_id=?', [dto.role_description, dto.clinic_id, dto.user_id]);

        });

    }



    async addClinicSpecialties(clinicId: number, actorId: number, specialtyIds: number[]): Promise<void> {

        await this.db.inTx(async tx => {

            await this.manager(tx, clinicId, actorId, true);

            const current = await ManagementReads.getClinicSpecialtyIds(tx, clinicId);

            const next = [...new Set([...current, ...specialtyIds])];

            await this.validateReferences(tx, { specialty_ids: next });

            await ManagementWrites.replaceClinicSpecialties(tx, clinicId, next);

        });

    }

}
