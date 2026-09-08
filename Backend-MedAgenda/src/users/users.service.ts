import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../db/database.service';
import * as AuthHelpers from '../auth/repo/helpers';
import * as UserReads from './repo/reads';
import * as UserWrites from './repo/writes';
import { ChangePasswordDto, CreateUserDto, UpdateProfileDto } from './dto/users.dto';

@Injectable()
export class UsersService {
    constructor(private readonly db: DatabaseService){}

    async createUser(dto: CreateUserDto): Promise<void> {
        if(await UserReads.existsByEmail(this.db,dto.user_email_address)) throw new ConflictException('User already exists');
        dto.password = await AuthHelpers.hashPassword(dto.password);
        if(dto.second_name === undefined) dto.second_name = null;
        await UserWrites.insertUser(this.db, dto);
    }

    async getUserProfile(userId: number): Promise<UserReads.UserProfile> {
        const user = await UserReads.getUserById(this.db, userId);
        if (!user) {
            throw new NotFoundException('User not found');
        }
        return user;
    }

    async updateUserProfile(userId: number, dto: UpdateProfileDto): Promise<UserReads.UserProfile> {
        const user = await UserReads.getUserById(this.db, userId);
        if (!user) {
            throw new NotFoundException('User not found');
        }

        await UserWrites.updateUserProfile(this.db, userId, dto);

        const updatedUser = await UserReads.getUserById(this.db, userId);
        return updatedUser!;
    }

    async changePassword(userId: number, dto: ChangePasswordDto): Promise<void> {
        // Validar que las contraseñas coincidan
        if (dto.new_password !== dto.confirm_password) {
            throw new BadRequestException('New password and confirmation do not match');
        }

        // Obtener el hash actual
        const currentPasswordHash = await UserReads.getPasswordHashById(this.db, userId);
        if (!currentPasswordHash) {
            throw new NotFoundException('User not found');
        }

        // Verificar que la contraseña actual sea correcta
        const isCurrentPasswordValid = await AuthHelpers.comparePasswords(dto.current_password, currentPasswordHash);
        if (!isCurrentPasswordValid) {
            throw new BadRequestException('Current password is incorrect');
        }

        // Hashear la nueva contraseña
        const newPasswordHash = await AuthHelpers.hashPassword(dto.new_password);

        // Actualizar la contraseña
        await UserWrites.updateUserPassword(this.db, userId, newPasswordHash);
    }

}
