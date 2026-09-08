import { Db } from '../../db/types/types';
import { CreateCityDto, CreateCountryDto, CreateStateDto } from "../dto/location.dto";

export async function insertCountry(db: Db, dto: CreateCountryDto): Promise<number> {
    const result = await db.execute(
        'INSERT INTO countries(country_name) VALUES (?)',
        [dto.country_name]
    );
    return result.insertId;
}

export async function insertState(db: Db, dto: CreateStateDto): Promise<number> {
    const result = await db.execute(
        'INSERT INTO states(state_name, country_id) VALUES (?, ?)',
        [dto.state_name, dto.country_id]
    );
    return result.insertId;
}

export async function insertCity(db: Db, dto: CreateCityDto): Promise<number> {
    const result = await db.execute(
        'INSERT INTO cities(city_name, state_id) VALUES (?, ?)',
        [dto.city_name, dto.state_id]
    );
    return result.insertId;
}
