import { Db } from '../../db/types/types';
import { CreateUserDto, UpdateProfileDto } from "../dto/users.dto";

export async function insertUser(db: Db, dto: CreateUserDto): Promise<void> {
    await db.execute(
        `INSERT INTO users (
            first_name, second_name, first_last_name, second_last_name,
            legal_id, user_phone_number, user_email_address, password_hash,
            birth_date, gender, address, city, state, country,
            emergency_contact_name, emergency_contact_phone
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            dto.first_name,
            dto.second_name,
            dto.first_last_name,
            dto.second_last_name,
            dto.legal_id,
            dto.user_phone_number,
            dto.user_email_address.toLowerCase(),
            dto.password,
            dto.birth_date || null,
            dto.gender || null,
            dto.address || null,
            dto.city || null,
            dto.state || null,
            dto.country || null,
            dto.emergency_contact_name || null,
            dto.emergency_contact_phone || null
        ]
    );
}

export async function updateUserProfile(db: Db, userId: number, dto: UpdateProfileDto): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    if (dto.first_name !== undefined) {
        fields.push('first_name = ?');
        values.push(dto.first_name);
    }
    if (dto.second_name !== undefined) {
        fields.push('second_name = ?');
        values.push(dto.second_name);
    }
    if (dto.first_last_name !== undefined) {
        fields.push('first_last_name = ?');
        values.push(dto.first_last_name);
    }
    if (dto.second_last_name !== undefined) {
        fields.push('second_last_name = ?');
        values.push(dto.second_last_name);
    }
    if (dto.user_phone_number !== undefined) {
        fields.push('user_phone_number = ?');
        values.push(dto.user_phone_number);
    }
    if (dto.birth_date !== undefined) {
        fields.push('birth_date = ?');
        values.push(dto.birth_date);
    }
    if (dto.gender !== undefined) {
        fields.push('gender = ?');
        values.push(dto.gender);
    }
    if (dto.address !== undefined) {
        fields.push('address = ?');
        values.push(dto.address);
    }
    if (dto.city !== undefined) {
        fields.push('city = ?');
        values.push(dto.city);
    }
    if (dto.state !== undefined) {
        fields.push('state = ?');
        values.push(dto.state);
    }
    if (dto.country !== undefined) {
        fields.push('country = ?');
        values.push(dto.country);
    }
    if (dto.emergency_contact_name !== undefined) {
        fields.push('emergency_contact_name = ?');
        values.push(dto.emergency_contact_name);
    }
    if (dto.emergency_contact_phone !== undefined) {
        fields.push('emergency_contact_phone = ?');
        values.push(dto.emergency_contact_phone);
    }

    if (fields.length === 0) {
        return; // No hay nada que actualizar
    }

    values.push(userId);
    await db.execute(
        `UPDATE users SET ${fields.join(', ')} WHERE user_id = ?`,
        values
    );
}

export async function updateUserPassword(db: Db, userId: number, passwordHash: string): Promise<void> {
    await db.execute(
        'UPDATE users SET password_hash = ? WHERE user_id = ?',
        [passwordHash, userId]
    );
}