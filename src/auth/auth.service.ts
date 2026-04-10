import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomInt, randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { normalizeBrCellphone } from '../lib/phone-br';
import { ComteleService } from '../plugins/comtele/comtele.service';
import { UsersService } from '../users/users.service';
import { LoginSmsChallenge } from './login-sms-challenge.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SmsLoginRequestDto } from './dto/sms-login-request.dto';
import { SmsLoginVerifyDto } from './dto/sms-login-verify.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly comtele: ComteleService,
    private readonly config: ConfigService,
    @InjectRepository(LoginSmsChallenge)
    private readonly challengesRepo: Repository<LoginSmsChallenge>,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const phoneNorm = normalizeBrCellphone(dto.phone);
    if (!phoneNorm) {
      throw new BadRequestException('Número de telefone inválido.');
    }
    const phoneTaken = await this.usersService.findByPhone(phoneNorm);
    if (phoneTaken) {
      throw new ConflictException('Phone already registered');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.create({
      email: dto.email,
      passwordHash,
      phone: phoneNorm,
    });
    return {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const access_token = await this.jwtService.signAsync({
      sub: user.id,
    });
    return { access_token };
  }

  /**
   * Envia SMS com código de 6 dígitos (se o número estiver registado e SMS configurado).
   * Resposta genérica para não revelar se o telefone existe.
   */
  async requestSmsLogin(dto: SmsLoginRequestDto): Promise<{
    ok: true;
    message: string;
  }> {
    const generic = {
      ok: true as const,
      message:
        'Se existir conta para este número, enviamos um código por SMS.',
    };
    const phone = normalizeBrCellphone(dto.phone);
    if (!phone) {
      throw new BadRequestException('Número de telefone inválido.');
    }
    const user = await this.usersService.findByPhone(phone);
    if (!user) {
      return generic;
    }
    await this.challengesRepo.delete({ phone });
    const code = randomInt(100000, 1000000).toString();
    const codeHash = await bcrypt.hash(code, 8);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.challengesRepo.save(
      this.challengesRepo.create({
        id: randomUUID(),
        phone,
        codeHash,
        expiresAt,
      }),
    );
    const smsBody = `O seu código de acesso: ${code}. Não o partilhe. Válido por 10 minutos.`;
    const configured = this.comtele.isConfigured();
    const isDev = this.config.get<string>('NODE_ENV') !== 'production';
    if (!configured) {
      if (isDev) {
        this.logger.warn(
          `[DEV] SMS não configurado (COMTELE_AUTH_KEY). Código para ${phone}: ${code}`,
        );
      } else {
        await this.challengesRepo.delete({ phone });
        throw new ServiceUnavailableException(
          'Login por SMS indisponível neste ambiente.',
        );
      }
      return generic;
    }
    try {
      await this.comtele.send(phone, smsBody);
    } catch (err) {
      await this.challengesRepo.delete({ phone });
      throw err;
    }
    return generic;
  }

  async verifySmsLogin(dto: SmsLoginVerifyDto): Promise<{ access_token: string }> {
    const phone = normalizeBrCellphone(dto.phone);
    if (!phone) {
      throw new BadRequestException('Número de telefone inválido.');
    }
    const user = await this.usersService.findByPhone(phone);
    if (!user) {
      throw new UnauthorizedException('Código inválido ou expirado.');
    }
    const row = await this.challengesRepo.findOne({
      where: { phone },
      order: { createdAt: 'DESC' },
    });
    if (!row || row.expiresAt.getTime() <= Date.now()) {
      await this.challengesRepo.delete({ phone });
      throw new UnauthorizedException('Código inválido ou expirado.');
    }
    const match = await bcrypt.compare(dto.code, row.codeHash);
    if (!match) {
      throw new UnauthorizedException('Código inválido ou expirado.');
    }
    await this.challengesRepo.delete({ phone });
    const access_token = await this.jwtService.signAsync({
      sub: user.id,
    });
    return { access_token };
  }
}
