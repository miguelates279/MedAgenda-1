import { Db } from '../../db/types/types';

export interface UserProfile {
    user_id: number;
    first_name: string;
    second_name: string | null;
    first_last_name: string;
    second_last_name: string;
    legal_id: string;
    user_phone_number: string;
    user_email_address: string;
    birth_date: string | null;
    gender: 'M' | 'F' | 'O' | null;
    address: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
}

export async function existsByEmail(db: Db, email: string): Promise<boolean> {
    const q = await db.query('SELECT 1 FROM users WHERE user_email_address = ?',[email]);
    return q.length > 0;

}

export async function deriveIdFromEmail(db: Db, email: string): Promise<number> {
    const q = await db.query<{ user_id: number }>('SELECT user_id FROM users WHERE user_email_address = ?', [email]);
    return q[0].user_id;
}

export async function getUserById(db: Db, userId: number): Promise<UserProfile | null> {
    const q = await db.query<UserProfile>(
        `SELECT
            user_id,
            first_name,
            second_name,
            first_last_name,
            second_last_name,
            legal_id,
            user_phone_number,
            user_email_address,
            birth_date,
            gender,
            address,
            city,
            state,
            country,
            emergency_contact_name,
            emergency_contact_phone
        FROM users
        WHERE user_id = ?`,
        [userId]
    );
    return q.length > 0 ? q[0] : null;
}

export async function getPasswordHashById(db: Db, userId: number): Promise<string | null> {
    const q = await db.query<{ password_hash: string }>(
        'SELECT password_hash FROM users WHERE user_id = ?',
        [userId]
    );
    return q.length > 0 ? q[0].password_hash : null;
}