import { Db } from '../../db/types/types'

export type Country = {
    country_id: number,
    country_name: string
}

export type State = {
    state_id: number,
    state_name: string,
    country_id: number
}

export type City = {
    city_id: number,
    state_id: number,
    city_name: string
}

export type CitySearchResult = {
    city_id: number,
    city_name: string,
    state_name: string,
    country_name: string
}

export type StateSearchResult = {
    state_id: number,
    state_name: string,
    country_name: string
}

export type CountrySearchResult = {
    country_id: number,
    country_name: string
}

export async function getCountries(db: Db): Promise<Country[]> {
    return await db.query<Country>('SELECT * FROM countries');
}

export async function getCountryById(db: Db, country_id: number): Promise<Country | null> {
    const result = await db.query<Country>('SELECT * FROM countries WHERE country_id = ?', [country_id]);
    return result.length > 0 ? result[0] : null;
}

export async function getStateByCountryId(db: Db, country_id: number): Promise<State[]> {
    return await db.query<State>('SELECT * FROM states WHERE country_id = ?', [country_id]);
}

export async function getStateById(db: Db, state_id: number): Promise<State | null> {
    const result = await db.query<State>('SELECT * FROM states WHERE state_id = ?', [state_id]);
    return result.length > 0 ? result[0] : null;
}

export async function getCitiesByStateId(db: Db, state_id: number): Promise<City[]> {
    return await db.query<City>('SELECT * FROM cities WHERE state_id = ?', [state_id]);
}

export async function getCityById(db: Db, city_id: number): Promise<City | null> {
    const result = await db.query<City>('SELECT * FROM cities WHERE city_id = ?', [city_id]);
    return result.length > 0 ? result[0] : null;
}

export async function searchCities(db: Db, searchTerm: string): Promise<CitySearchResult[]> {
    return await db.query<CitySearchResult>(
        `SELECT
            c.city_id,
            c.city_name,
            s.state_name,
            co.country_name
        FROM cities c
        INNER JOIN states s ON c.state_id = s.state_id
        INNER JOIN countries co ON s.country_id = co.country_id
        WHERE LOWER(c.city_name) LIKE LOWER(?)
        ORDER BY c.city_name
        LIMIT 10`,
        [`%${searchTerm}%`]
    );
}

export async function searchStates(db: Db, searchTerm: string): Promise<StateSearchResult[]> {
    return await db.query<StateSearchResult>(
        `SELECT
            s.state_id,
            s.state_name,
            co.country_name
        FROM states s
        INNER JOIN countries co ON s.country_id = co.country_id
        WHERE LOWER(s.state_name) LIKE LOWER(?)
        ORDER BY s.state_name
        LIMIT 10`,
        [`%${searchTerm}%`]
    );
}

export async function searchCountries(db: Db, searchTerm: string): Promise<CountrySearchResult[]> {
    return await db.query<CountrySearchResult>(
        `SELECT
            country_id,
            country_name
        FROM countries
        WHERE LOWER(country_name) LIKE LOWER(?)
        ORDER BY country_name
        LIMIT 10`,
        [`%${searchTerm}%`]
    );
}