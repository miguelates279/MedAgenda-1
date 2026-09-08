import { Body, Controller, Get, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { City, CitySearchResult, Country, CountrySearchResult, State, StateSearchResult } from './repo/reads';
import { CreateCityDto, CreateCountryDto, CreateStateDto, GetCitiesDto, GetStatesDto } from './dto/location.dto';
import { LocationService } from './location.service';
import { CityEntity, CountryEntity, StateEntity } from '../swagger/entities';

@ApiTags('Location')
@Controller('location')
export class LocationController {
    constructor(private readonly locationService: LocationService){}

    @ApiOperation({ summary: 'Retrieve all countries.' })
    @ApiOkResponse({ description: 'List of countries.', type: CountryEntity, isArray: true })
    @Get('getCountries')
    async getCountries(): Promise<Country[]> {
        return await this.locationService.getCountries();
    }

    @ApiOperation({ summary: 'Retrieve states belonging to a country.' })
    @ApiOkResponse({ description: 'List of states for the provided country.', type: StateEntity, isArray: true })
    @Get('getStates')
    async getStates(@Query('country_id', ParseIntPipe) country_id: number): Promise<State[]> {
        return await this.locationService.getStates(country_id)
    }

    @ApiOperation({ summary: 'Retrieve cities belonging to a state.' })
    @ApiOkResponse({ description: 'List of cities for the provided state.', type: CityEntity, isArray: true })
    @Get('getCities')
    async getCities(@Query('state_id', ParseIntPipe) state_id: number): Promise<City[]> {
        return await this.locationService.getCities(state_id);
    }

    @ApiOperation({ summary: 'Search cities by name (partial match).' })
    @ApiQuery({ name: 'search', type: String, description: 'Search term for city name', required: true })
    @ApiOkResponse({
        description: 'List of cities matching the search term with state and country info.',
        schema: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    city_id: { type: 'number' },
                    city_name: { type: 'string' },
                    state_name: { type: 'string' },
                    country_name: { type: 'string' }
                }
            }
        }
    })
    @Get('searchCities')
    async searchCities(@Query('search') search: string): Promise<CitySearchResult[]> {
        if (!search || search.trim() === '') {
            return [];
        }
        return await this.locationService.searchCities(search);
    }

    @ApiOperation({ summary: 'Search states by name (partial match).' })
    @ApiQuery({ name: 'search', type: String, description: 'Search term for state name', required: true })
    @ApiOkResponse({
        description: 'List of states matching the search term with country info.',
        schema: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    state_id: { type: 'number' },
                    state_name: { type: 'string' },
                    country_name: { type: 'string' }
                }
            }
        }
    })
    @Get('searchStates')
    async searchStates(@Query('search') search: string): Promise<StateSearchResult[]> {
        if (!search || search.trim() === '') {
            return [];
        }
        return await this.locationService.searchStates(search);
    }

    @ApiOperation({ summary: 'Search countries by name (partial match).' })
    @ApiQuery({ name: 'search', type: String, description: 'Search term for country name', required: true })
    @ApiOkResponse({
        description: 'List of countries matching the search term.',
        schema: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    country_id: { type: 'number' },
                    country_name: { type: 'string' }
                }
            }
        }
    })
    @Get('searchCountries')
    async searchCountries(@Query('search') search: string): Promise<CountrySearchResult[]> {
        if (!search || search.trim() === '') {
            return [];
        }
        return await this.locationService.searchCountries(search);
    }

    @ApiOperation({ summary: 'Create a new country.' })
    @ApiBody({ type: CreateCountryDto })
    @ApiOkResponse({
        description: 'Country created successfully.',
        type: CountryEntity
    })
    @Post('createCountry')
    async createCountry(@Body() dto: CreateCountryDto): Promise<Country> {
        return await this.locationService.createCountry(dto);
    }

    @ApiOperation({ summary: 'Create a new state/department.' })
    @ApiBody({ type: CreateStateDto })
    @ApiOkResponse({
        description: 'State created successfully.',
        type: StateEntity
    })
    @Post('createState')
    async createState(@Body() dto: CreateStateDto): Promise<State> {
        return await this.locationService.createState(dto);
    }

    @ApiOperation({ summary: 'Create a new city.' })
    @ApiBody({ type: CreateCityDto })
    @ApiOkResponse({
        description: 'City created successfully.',
        type: CityEntity
    })
    @Post('createCity')
    async createCity(@Body() dto: CreateCityDto): Promise<City> {
        return await this.locationService.createCity(dto);
    }

}
