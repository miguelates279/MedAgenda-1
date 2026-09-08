import { Body, Controller, Get, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';
import { AdminService } from './admin.service';
import { UpdateUserRoleDto } from './dto/admin.dto';

@ApiTags('admin')
@Controller('admin')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('bearer')
export class AdminController {
    constructor(private readonly adminService: AdminService) {}

    @Get('my-clinics')
    @ApiOperation({ summary: 'Get all clinics where the user is Admin or Owner' })
    @ApiResponse({
        status: 200,
        description: 'List of clinics where user has admin privileges',
        schema: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    clinic_id: { type: 'number' },
                    clinic_name: { type: 'string' },
                    role_within_clinic: { type: 'string', enum: ['Admin', 'Owner'] },
                    role_description: { type: 'string', nullable: true }
                }
            }
        }
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async getMyClinics(@Req() req) {
        return await this.adminService.getAdminClinics(req.user.id);
    }

    @Get('clinic-users')
    @ApiOperation({ summary: 'Get all users from the admin\'s clinic(s)' })
    @ApiQuery({ name: 'clinic_id', type: Number, required: false, description: 'Filter by specific clinic ID' })
    @ApiResponse({
        status: 200,
        description: 'List of all users in the clinic(s)',
        schema: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    user_id: { type: 'number' },
                    email: { type: 'string' },
                    first_name: { type: 'string' },
                    second_name: { type: 'string', nullable: true },
                    first_last_name: { type: 'string' },
                    second_last_name: { type: 'string' },
                    phone_number: { type: 'string' },
                    isDoctor: { type: 'boolean' },
                    isAdmin: { type: 'boolean' },
                    specialty_id: { type: 'number', nullable: true },
                    specialty_name: { type: 'string', nullable: true }
                }
            }
        }
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'User is not an admin of the specified clinic' })
    async getClinicUsers(@Req() req, @Query('clinic_id') clinicId?: number) {
        return await this.adminService.getClinicUsers(req.user.id, clinicId ? Number(clinicId) : undefined);
    }

    @Get('search-user')
    @ApiOperation({ summary: 'Search for a user by email' })
    @ApiQuery({ name: 'email', type: String, description: 'Email address to search for' })
    @ApiResponse({
        status: 200,
        description: 'User found',
        schema: {
            type: 'object',
            properties: {
                user_id: { type: 'number' },
                email: { type: 'string' },
                first_name: { type: 'string' },
                second_name: { type: 'string', nullable: true },
                first_last_name: { type: 'string' },
                second_last_name: { type: 'string' },
                phone_number: { type: 'string' },
                isDoctor: { type: 'boolean' },
                isAdmin: { type: 'boolean' },
                specialty_id: { type: 'number', nullable: true },
                specialty_name: { type: 'string', nullable: true }
            }
        }
    })
    @ApiResponse({ status: 400, description: 'Email parameter is required' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'User is not an admin' })
    @ApiResponse({ status: 404, description: 'User not found' })
    async searchUser(@Req() req, @Query('email') email: string) {
        if (!email) {
            return { error: 'Email parameter is required' };
        }
        return await this.adminService.searchUserByEmail(req.user.id, email);
    }

    @Put('update-user-role')
    @ApiOperation({ summary: 'Update a user\'s role within the clinic' })
    @ApiResponse({
        status: 200,
        description: 'Role updated successfully',
        schema: {
            type: 'object',
            properties: {
                message: { type: 'string' }
            }
        }
    })
    @ApiResponse({ status: 400, description: 'Bad request (e.g., specialty_id required when isDoctor is true)' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'User is not an admin' })
    @ApiResponse({ status: 404, description: 'User not found' })
    async updateUserRole(@Req() req, @Body() dto: UpdateUserRoleDto) {
        return await this.adminService.updateUserRole(req.user.id, dto);
    }

    @Get('specialties')
    @ApiOperation({ summary: 'Get all available medical specialties' })
    @ApiResponse({
        status: 200,
        description: 'List of all specialties',
        schema: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    specialty_id: { type: 'number' },
                    specialty_name: { type: 'string' },
                    specialty_description: { type: 'string', nullable: true }
                }
            }
        }
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async getSpecialties() {
        return await this.adminService.getAllSpecialties();
    }
}
