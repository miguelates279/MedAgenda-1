import { BadRequestException, Injectable } from '@nestjs/common';
import * as LocationReads from './repo/reads'
import * as LocationWrites from './repo/writes'
import { DatabaseService } from '../db/database.service';
import { CreateCityDto, CreateCountryDto, CreateStateDto, GetCitiesDto, GetStatesDto } from './dto/location.dto';
@Injectable()
export class LocationService {
    constructor(private readonly db: DatabaseService){}

    async getCountries(): Promise<LocationReads.Country[]> {
        return await LocationReads.getCountries(this.db);
    }

    async getStates(country_id: number): Promise<LocationReads.State[]> {
        return await LocationReads.getStateByCountryId(this.db, country_id);
    }

    async getCities(state_id: number): Promise<LocationReads.City[]> {
        return await LocationReads.getCitiesByStateId(this.db, state_id);
    }

    async searchCities(searchTerm: string): Promise<LocationReads.CitySearchResult[]> {
        return await LocationReads.searchCities(this.db, searchTerm);
    }

    async searchStates(searchTerm: string): Promise<LocationReads.StateSearchResult[]> {
        return await LocationReads.searchStates(this.db, searchTerm);
    }

    async searchCountries(searchTerm: string): Promise<LocationReads.CountrySearchResult[]> {
        return await LocationReads.searchCountries(this.db, searchTerm);
    }

    async createCountry(dto: CreateCountryDto): Promise<LocationReads.Country> {
        const country_id = await LocationWrites.insertCountry(this.db, dto);
        const country = await LocationReads.getCountryById(this.db, country_id);
        if (!country) {
            throw new BadRequestException('Failed to create country');
        }
        return country;
    }

    async createState(dto: CreateStateDto): Promise<LocationReads.State> {
        const state_id = await LocationWrites.insertState(this.db, dto);
        const state = await LocationReads.getStateById(this.db, state_id);
        if (!state) {
            throw new BadRequestException('Failed to create state');
        }
        return state;
    }

    async createCity(dto: CreateCityDto): Promise<LocationReads.City> {
        const city_id = await LocationWrites.insertCity(this.db, dto);
        const city = await LocationReads.getCityById(this.db, city_id);
        if (!city) {
            throw new BadRequestException('Failed to create city');
        }
        return city;
    }

}
