import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';

/**
 * Promove usuários a `platform_admin` conforme `PLATFORM_ADMIN_EMAILS`
 * (lista separada por vírgulas), no arranque da aplicação.
 */
@Injectable()
export class PlatformAdminBootstrapService implements OnApplicationBootstrap {
  private readonly log = new Logger(PlatformAdminBootstrapService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const raw = process.env.PLATFORM_ADMIN_EMAILS?.trim();
    if (!raw) {
      return;
    }
    const emails = [
      ...new Set(
        raw
          .split(',')
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean),
      ),
    ];
    for (const email of emails) {
      const res = await this.usersRepo.update({ email }, { platformAdmin: true });
      if (!res.affected) {
        this.log.warn(
          `PLATFORM_ADMIN_EMAILS: não existe usuário com e-mail "${email}".`,
        );
      }
    }
  }
}
