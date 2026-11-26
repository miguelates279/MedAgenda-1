import { Body, Controller, Delete, Get, Param, ParseIntPipe, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';
import { AdminService } from './admin.service';
import { ClinicUsersQueryDto, SearchClinicUserQueryDto, UpdateUserRoleDto } from './dto/admin.dto';

@ApiTags('admin')
@Controller('admin')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('bearer')
export class AdminController {
    constructor(private readonly adminService: AdminService) {}

    @Get('my-clinics')
    @ApiOperation({ summary: 'List clinics managed by the authenticated owner or administrator.' })
    getMyClinics(@Req() req) {
        return this.adminService.getAdminClinics(req.user.id);
    }

    @Get('clinic-users')
    @ApiOperation({ summary: 'List members and clinic-specific specialties for one managed clinic.' })
    getClinicUsers(@Req() req, @Query() query: ClinicUsersQueryDto) {
        return this.adminService.getClinicUsers(req.user.id, query.clinic_id);
    }

    @Get('search-user')
    @ApiOperation({ summary: 'Find an exact email and its relationship to the selected clinic.' })
    searchUser(@Req() req, @Query() query: SearchClinicUserQueryDto) {
        return this.adminService.searchUserByEmail(req.user.id, query.email, query.clinic_id);
    }

    @Put('update-user-role')
    @ApiOperation({ summary: 'Add or update a member in the selected managed clinic.' })
    updateUserRole(@Req() req, @Body() dto: UpdateUserRoleDto) {
        return this.adminService.updateUserRole(req.user.id, dto);
    }

    @Delete('clinics/:clinic_id/members/:user_id')
    @ApiOperation({ summary: 'Remove a member while preserving appointments and other clinics.' })
    removeMember(@Param('clinic_id', ParseIntPipe) clinicId: number, @Param('user_id', ParseIntPipe) userId: number, @Req() req) {
        return this.adminService.removeMember(clinicId, userId, req.user.id);
    }

    @Get('specialties')
    @ApiOperation({ summary: 'List available medical specialties.' })
    getSpecialties() {
        return this.adminService.getAllSpecialties();
    }
}
