import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly users: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ user?: { userId: string } }>();
    const userId = req.user?.userId;
    if (!userId) {
      throw new ForbiddenException('Acesso reservado a administradores da plataforma.');
    }
    const user = await this.users.findById(userId);
    if (!user?.platformAdmin) {
      throw new ForbiddenException('Acesso reservado a administradores da plataforma.');
    }
    return true;
  }
}
