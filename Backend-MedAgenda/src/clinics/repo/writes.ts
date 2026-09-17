import { Db } from '../../db/types/types';
import { AddMemberToClinicDto, AddSpecialtiesToClinicDto, CreateClinicDto, CreateSpecialtyDto } from "../dto/clinics.dto";


export async function insertClinic(db: Db, dto: CreateClinicDto, user_id: number): Promise<number> {
    var desc;
    if(dto.clinic_description != undefined) desc = dto.clinic_description;
    else desc = null;
    const result = await db.execute(
        'INSERT INTO clinics(clinic_name, clinic_phone_number, clinic_city_id, clinic_address, clinic_owner, clinic_description) VALUES (?, ?, ?, ?, ?, ?)',
        [dto.clinic_name, dto.clinic_phone_number, dto.clinic_city_id, dto.clinic_address, user_id, desc]
    );
    return result.insertId;
}

export async function insertMembership(db: Db, dto: AddMemberToClinicDto): Promise<void> {
    var role_desc;
    if(dto.role_description === undefined) role_desc = null;
    else role_desc = dto.role_description;
    await db.execute(
        'INSERT INTO clinic_members(clinic_id, user_id, role_within_clinic, role_description) VALUES (?, ?, ?, ?)',
        [dto.clinic_id,dto.user_id,dto.role_within_clinic,role_desc]
    );
}

export async function insertClinicSpecialties(db: Db, dto: AddSpecialtiesToClinicDto): Promise<void> {
    for(const id of dto.specialty_ids) {
        await db.execute(
            'INSERT INTO clinic_specialties(clinic_id, specialty_id) VALUES (?, ?)',
            [dto.clinic_id, id]);
    }
}

export async function insertSpecialty(db: Db, dto: CreateSpecialtyDto): Promise<number> {
    const description = dto.specialty_description ?? null;
    const result = await db.execute(
        'INSERT INTO specialties(specialty_name, specialty_description) VALUES (?, ?)',
        [dto.specialty_name, description]
    );
    return result.insertId;
}

export async function deleteClinic(db: Db, clinic_id: number, owner_id: number): Promise<boolean> {
    const result = await db.execute(
        'DELETE FROM clinics WHERE clinic_id = ? AND clinic_owner = ?',
        [clinic_id, owner_id]
    );
    return result.affectedRows > 0;
}