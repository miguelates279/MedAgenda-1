import { Body, Controller, Get, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { ChangePasswordDto, CreateUserDto, UpdateProfileDto } from './dto/users.dto';
import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';

@ApiTags('Users')
@Controller('users')
export class UsersController {
    constructor(private readonly userService: UsersService){}

    @ApiOperation({ summary: 'Register a new user account.' })
    @ApiBody({ type: CreateUserDto })
    @ApiCreatedResponse({ description: 'User successfully registered.' })
    @Post('register')
    async register(@Body() dto: CreateUserDto): Promise<void> {
        return await this.userService.createUser(dto);
    }

    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('bearer')
    @Get('profile')
    @ApiOperation({ summary: 'Get the profile of the authenticated user.' })
    @ApiOkResponse({ description: 'User profile retrieved successfully.' })
    @ApiUnauthorizedResponse({ description: 'Invalid or missing authentication token.' })
    @ApiNotFoundResponse({ description: 'User not found.' })
    async getProfile(@Req() req): Promise<any> {
        return await this.userService.getUserProfile(req.user.id);
    }

    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('bearer')
    @Put('profile')
    @ApiOperation({ summary: 'Update the profile of the authenticated user.' })
    @ApiBody({ type: UpdateProfileDto })
    @ApiOkResponse({ description: 'User profile updated successfully.' })
    @ApiBadRequestResponse({ description: 'Invalid data provided.' })
    @ApiUnauthorizedResponse({ description: 'Invalid or missing authentication token.' })
    @ApiNotFoundResponse({ description: 'User not found.' })
    async updateProfile(@Body() dto: UpdateProfileDto, @Req() req): Promise<any> {
        return await this.userService.updateUserProfile(req.user.id, dto);
    }

    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('bearer')
    @Put('change-password')
    @ApiOperation({ summary: 'Change the password of the authenticated user.' })
    @ApiBody({ type: ChangePasswordDto })
    @ApiOkResponse({ description: 'Password changed successfully.' })
    @ApiBadRequestResponse({ description: 'Invalid data or current password incorrect.' })
    @ApiUnauthorizedResponse({ description: 'Invalid or missing authentication token.' })
    @ApiNotFoundResponse({ description: 'User not found.' })
    async changePassword(@Body() dto: ChangePasswordDto, @Req() req): Promise<{ message: string }> {
        await this.userService.changePassword(req.user.id, dto);
        return { message: 'Password changed successfully' };
    }

}
