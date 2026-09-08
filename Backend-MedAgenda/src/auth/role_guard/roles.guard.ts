import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable } from "rxjs";
import { DatabaseService } from '../../db/database.service';
import { Roles } from "./roles.enum";
import * as ClinicReads from '../../clinics/repo/reads';
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly db: DatabaseService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const roles = this.reflector.getAllAndOverride<Roles[]>('roles', [
        context.getHandler(),
        context.getClass(),
        ]);
        if (!roles?.length) return true;

        const req = context.switchToHttp().getRequest();
        const user = req.user;

        const clinicId = 
            Number(req.body?.clinic_id) ||
            Number(req.params?.clinic_id) ||
            Number(req.query?.clinic_id);
        
        if(!clinicId) throw new ForbiddenException('Clinic ID must be included in the request');

        const userRole = await ClinicReads.getRoleByIds(this.db, clinicId, user.id);
        if(!userRole || !roles.includes(userRole.role_within_clinic as Roles)) {
            throw new UnauthorizedException(`You don't have permission to access this functionality.`);
        }
        return true;
    }

}