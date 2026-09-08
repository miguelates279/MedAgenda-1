import { Body, Controller, Get, ParseArrayPipe, ParseIntPipe, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AppointmentSlot } from '../appointments/repo/reads';
import { Public } from '../auth/jwt/public.decorator';
import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';
import { Roles } from '../auth/role_guard/roles.enum';
import { roles } from '../auth/role_guard/roles.decorator';
import { PublicDoctor } from '../doctors/repo';
import { Clinic, ClinicScheduleRules, Specialty } from './repo';
import { AddMemberToClinicDto, AddSpecialtiesToClinicDto, CreateClinicDto, CreateSpecialtyDto, GetClinicDoctorAppointmentsDto, GetClinicDto } from './dto/clinics.dto';
import { ClinicsService } from './clinics.service';
import { AppointmentSlotEntity, ClinicEntity, PublicDoctorEntity, SpecialtyEntity } from '../swagger/entities';

@UseGuards(JwtAuthGuard)
@ApiTags('Clinics')
@Controller('clinics')
export class ClinicsController {
  constructor(private readonly clinicService: ClinicsService){}

  @Public()
  @ApiOperation({ summary: 'List all medical specialties available.' })
  @ApiOkResponse({ description: 'Specialties retrieved successfully.', type: SpecialtyEntity, isArray: true })
  @Get('getAllSpecialties')
  async getAllSpecialties(): Promise<Specialty[]> {
    return this.clinicService.getAllSpecialties();
  }

  @Public()
  @ApiOperation({ summary: 'List all clinics.' })
  @ApiOkResponse({ description: 'Clinics retrieved successfully.', type: ClinicEntity, isArray: true })
  @Get('getAllClinics')
  async getAllClinics(): Promise<Clinic[]> {
    return this.clinicService.getAllClinics();
  }

  @Public()
  @ApiOperation({ summary: 'List clinics offering at least one of the provided specialties.' })
  @ApiQuery({
    name: 'specialty_ids',
    description: 'Comma-separated list of specialty identifiers.',
    example: '1,2,3',
    required: true,
    type: String,
  })
  @ApiOkResponse({ description: 'Clinics with specialties retrieved successfully.', type: ClinicEntity, isArray: true })
  @Get('getAllClinicsWithSpecialty')
  async getAllClinicsWithSpecialty(
    @Query('specialty_ids', new ParseArrayPipe({ items: Number, separator: ',' })) specialty_ids: number[],
  ): Promise<Clinic[]> {
    return this.clinicService.getAllClinicsWithSpecialties({ specialty_ids });
  }

  @Public()
  @ApiOperation({ summary: 'List all clinics located in a specific city.' })
  @ApiQuery({ name: 'city_id', required: true, type: Number, example: 9 })
  @ApiOkResponse({ description: 'Clinics in the city retrieved successfully.', type: ClinicEntity, isArray: true })
  @Get('getAllClinicsInCity')
  async getAllClinicsInCity(
    @Query('city_id', ParseIntPipe) city_id: number
  ): Promise<Clinic[]> {
    return this.clinicService.getAllClinicsInCity(city_id);
  }

  @Public()
  @ApiOperation({ summary: 'List clinics in a city that match any of the provided specialties.' })
  @ApiQuery({
    name: 'specialty_ids',
    description: 'Comma-separated list of specialty identifiers.',
    example: '2,4',
    required: true,
    type: String,
  })
  @ApiQuery({ name: 'city_id', required: true, type: Number, example: 9 })
  @ApiOkResponse({ description: 'Clinics with specialties in city retrieved successfully.', type: ClinicEntity, isArray: true })
  @Get('getAllClinicsWithSpecialtiesInCity')
  async getAllClinicsWithSpecialtiesInCity(
    @Query('specialty_ids') specialty_ids_raw: string[] | string,
    @Query('city_id', ParseIntPipe) city_id: number,
  ): Promise<Clinic[]> {
    const list = Array.isArray(specialty_ids_raw) ? specialty_ids_raw : (specialty_ids_raw ?? '').split(',');
    const specialty_ids = list.map(n => Number(n)).filter(n => Number.isFinite(n));
    return this.clinicService.getAllClinicsWithSpecialtiesInCity({ specialty_ids, city_id });
  }

  @Public()
  @ApiOperation({ summary: 'List clinics in a country that match any of the provided specialties.' })
  @ApiQuery({
    name: 'specialty_ids',
    description: 'Comma-separated list of specialty identifiers.',
    example: '2,4',
    required: true,
    type: String,
  })
  @ApiQuery({ name: 'country_id', required: true, type: Number, example: 1 })
  @ApiOkResponse({ description: 'Clinics with specialties in country retrieved successfully.', type: ClinicEntity, isArray: true })
  @Get('getAllClinicsWithSpecialtiesInCountry')
  async getAllClinicsWithSpecialtiesInCountry(
    @Query('specialty_ids') specialty_ids_raw: string[] | string,
    @Query('country_id', ParseIntPipe) country_id: number,
  ): Promise<Clinic[]> {
    const list = Array.isArray(specialty_ids_raw) ? specialty_ids_raw : (specialty_ids_raw ?? '').split(',');
    const specialty_ids = list.map(n => Number(n)).filter(n => Number.isFinite(n));
    return this.clinicService.getAllClinicsWithSpecialtiesInCountry({ specialty_ids, country_id });
  }

  @Public()
  @ApiOperation({ summary: 'List all clinics within a state.' })
  @ApiQuery({ name: 'state_id', required: true, type: Number, example: 3 })
  @ApiOkResponse({ description: 'Clinics in the state retrieved successfully.', type: ClinicEntity, isArray: true })
  @Get('getAllClinicsInState')
  async getAllClinicsInState(
    @Query('state_id', ParseIntPipe) state_id: number
  ): Promise<Clinic[]> {
    return this.clinicService.getAllClinicsInState(state_id);
  }

  @Public()
  @ApiOperation({ summary: 'List all clinics within a country.' })
  @ApiQuery({ name: 'country_id', required: true, type: Number, example: 1 })
  @ApiOkResponse({ description: 'Clinics in the country retrieved successfully.', type: ClinicEntity, isArray: true })
  @Get('getAllClinicsInCountry')
  async getAllClinicsInCountry(
    @Query('country_id', ParseIntPipe) country_id: number
  ): Promise<Clinic[]> {
    return this.clinicService.getAllClinicsInCountry(country_id);
  }

  @Public()
  @ApiOperation({ summary: 'Fetch details of a specific clinic.' })
  @ApiOkResponse({ description: 'Clinic details retrieved successfully.', type: ClinicEntity })
  @Get('getClinicDetails')
  async getClinicDetails(@Query() dto: GetClinicDto): Promise<Clinic> {
    return await this.clinicService.getClinicDetails(dto);
  }

  @Public()
  @ApiOperation({ summary: 'List doctors working at a specific clinic with their specialties.' })
  @ApiOkResponse({ description: 'Clinic doctors retrieved successfully.', type: PublicDoctorEntity, isArray: true })
  @Get('getClinicDoctors')
  async getClinicDoctors(@Query() dto: GetClinicDto): Promise<PublicDoctor[]> {
    return await this.clinicService.getAllClinicDoctors(dto);
  }

  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'List booked appointment slots for a doctor in a clinic on a specific day.' })
  @ApiOkResponse({ description: 'Booked slots retrieved successfully.', type: AppointmentSlotEntity, isArray: true })
  @Get('getClinicDoctorAppointmentsForDay')
  async getClinicDoctorAppointmentsForDay(@Query() dto: GetClinicDoctorAppointmentsDto): Promise<AppointmentSlot[]> {
    return await this.clinicService.getClinicDoctorAppointmentsForDay(dto);
  }

  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Create a new clinic.' })
  @ApiBody({ type: CreateClinicDto })
  @ApiOkResponse({
    description: 'Clinic created successfully.',
    schema: {
      type: 'object',
      properties: {
        clinic_id: { type: 'number', description: 'ID of the newly created clinic' }
      }
    }
  })
  @Post('createClinic')
  async createClinic(@Body() dto: CreateClinicDto, @Req() req): Promise<{ clinic_id: number }> {
    if (!req.user) {
      throw new UnauthorizedException('Usuario no autenticado');
    }
    return this.clinicService.createClinic(dto, req.user.id);
  }

  @roles(Roles.Owner, Roles.Admin)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Add a member to a clinic with a specific role.' })
  @ApiBody({ type: AddMemberToClinicDto })
  @ApiOkResponse({ description: 'Member added to clinic.' })
  @Post('addMemberToClinic')
  async addMemberToClinic(@Body() dto: AddMemberToClinicDto, @Req() req): Promise<void> {
    return this.clinicService.addMemberToClinic(dto, req.user.id);
  }

  @roles(Roles.Owner, Roles.Admin)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Associate specialties with a clinic.' })
  @ApiBody({ type: AddSpecialtiesToClinicDto })
  @ApiOkResponse({ description: 'Specialties linked to clinic.' })
  @Post('addSpecialtiesToClinic')
  async addSpecialtiesToClinic(@Body() dto: AddSpecialtiesToClinicDto): Promise<void> {
    return this.clinicService.addSpecialtiesToClinic(dto);
  }

  @ApiOperation({ summary: 'Create a new medical specialty.' })
  @ApiBody({ type: CreateSpecialtyDto })
  @ApiOkResponse({
    description: 'Specialty created successfully.',
    type: SpecialtyEntity
  })
  @ApiBearerAuth('bearer')
  @Post('createSpecialty')
  async createSpecialty(@Body() dto: CreateSpecialtyDto): Promise<Specialty> {
    return this.clinicService.createSpecialty(dto);
  }

  @Public()
  @ApiOperation({ summary:  `Gets a clinic's schedule rules (opening time, close time, etc...)` })
  @ApiBody({ type: GetClinicDto })
  @ApiOkResponse({ description: `Specified clinic's schedule rules`})
  @Get('getClinicScheduleRules')
  async getClinicScheduleRules(@Query() dto: GetClinicDto): Promise<ClinicScheduleRules> {
    return await this.clinicService.getClinicScheduleRules(dto);
  }

}
