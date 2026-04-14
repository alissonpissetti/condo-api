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
import { MailService } from '../mail/mail.service';
import { ComteleService } from '../plugins/comtele/comtele.service';
import { UsersService } from '../users/users.service';
import { LoginSmsChallenge } from './login-sms-challenge.entity';
import { PasswordResetChallenge } from './password-reset-challenge.entity';
import { LoginDto } from './dto/login.dto';
import { PasswordResetCompleteDto } from './dto/password-reset-complete.dto';
import { PasswordResetRequestDto } from './dto/password-reset-request.dto';
import { PasswordResetVerifyDto } from './dto/password-reset-verify.dto';
import { RegisterDto } from './dto/register.dto';
import { SmsLoginRequestDto } from './dto/sms-login-request.dto';
import { SmsLoginVerifyDto } from './dto/sms-login-verify.dto';

const PASSWORD_RESET_JWT_PURPOSE = 1;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly comtele: ComteleService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    @InjectRepository(LoginSmsChallenge)
    private readonly challengesRepo: Repository<LoginSmsChallenge>,
    @InjectRepository(PasswordResetChallenge)
    private readonly pwdResetRepo: Repository<PasswordResetChallenge>,
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
      message: 'Se existir conta para este número, enviamos um código por SMS.',
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

  async verifySmsLogin(
    dto: SmsLoginVerifyDto,
  ): Promise<{ access_token: string }> {
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

  private readonly pwdResetGeneric = {
    ok: true as const,
    message:
      'Se existir conta para estes dados, enviamos um código por email ou SMS.',
  };

  async requestPasswordReset(dto: PasswordResetRequestDto): Promise<{
    ok: true;
    message: string;
  }> {
    const isDev = this.config.get<string>('NODE_ENV') !== 'production';
    let destination: string;
    if (dto.channel === 'email') {
      const email = dto.email?.trim().toLowerCase();
      if (!email) {
        throw new BadRequestException('Indique o email.');
      }
      destination = email;
    } else {
      const phone = normalizeBrCellphone(dto.phone ?? '');
      if (!phone) {
        throw new BadRequestException('Número de telefone inválido.');
      }
      destination = phone;
    }

    const user =
      dto.channel === 'email'
        ? await this.usersService.findByEmail(destination)
        : await this.usersService.findByPhone(destination);
    if (!user) {
      return this.pwdResetGeneric;
    }

    await this.pwdResetRepo.delete({ channel: dto.channel, destination });
    const code = randomInt(100000, 1000000).toString();
    const codeHash = await bcrypt.hash(code, 8);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.pwdResetRepo.save(
      this.pwdResetRepo.create({
        id: randomUUID(),
        channel: dto.channel,
        destination,
        codeHash,
        expiresAt,
      }),
    );

    if (dto.channel === 'email') {
      const smtpHost = this.config.get<string>('SMTP_HOST')?.trim();
      if (!smtpHost && !isDev) {
        await this.pwdResetRepo.delete({ channel: dto.channel, destination });
        throw new ServiceUnavailableException(
          'Recuperação por email indisponível neste ambiente.',
        );
      }
      try {
        await this.mail.sendPasswordResetCode(destination, code);
      } catch (err) {
        await this.pwdResetRepo.delete({ channel: dto.channel, destination });
        throw err;
      }
      return this.pwdResetGeneric;
    }

    const smsBody = `Código para redefinir senha: ${code}. Não o partilhe. Válido por 10 minutos.`;
    const configured = this.comtele.isConfigured();
    if (!configured) {
      if (isDev) {
        this.logger.warn(
          `[DEV] SMS não configurado (COMTELE_AUTH_KEY). Código pwd reset ${destination}: ${code}`,
        );
      } else {
        await this.pwdResetRepo.delete({ channel: dto.channel, destination });
        throw new ServiceUnavailableException(
          'Recuperação por SMS indisponível neste ambiente.',
        );
      }
      return this.pwdResetGeneric;
    }
    try {
      await this.comtele.send(destination, smsBody);
    } catch (err) {
      await this.pwdResetRepo.delete({ channel: dto.channel, destination });
      throw err;
    }
    return this.pwdResetGeneric;
  }

  async verifyPasswordResetCode(
    dto: PasswordResetVerifyDto,
  ): Promise<{ reset_token: string }> {
    let destination: string;
    if (dto.channel === 'email') {
      const email = dto.email?.trim().toLowerCase();
      if (!email) {
        throw new BadRequestException('Indique o email.');
      }
      destination = email;
    } else {
      const phone = normalizeBrCellphone(dto.phone ?? '');
      if (!phone) {
        throw new BadRequestException('Número de telefone inválido.');
      }
      destination = phone;
    }

    const user =
      dto.channel === 'email'
        ? await this.usersService.findByEmail(destination)
        : await this.usersService.findByPhone(destination);
    if (!user) {
      throw new UnauthorizedException('Código inválido ou expirado.');
    }

    const row = await this.pwdResetRepo.findOne({
      where: { channel: dto.channel, destination },
      order: { createdAt: 'DESC' },
    });
    if (!row || row.expiresAt.getTime() <= Date.now()) {
      await this.pwdResetRepo.delete({ channel: dto.channel, destination });
      throw new UnauthorizedException('Código inválido ou expirado.');
    }
    const match = await bcrypt.compare(dto.code, row.codeHash);
    if (!match) {
      throw new UnauthorizedException('Código inválido ou expirado.');
    }
    await this.pwdResetRepo.delete({ channel: dto.channel, destination });

    const reset_token = await this.jwtService.signAsync(
      {
        sub: user.id,
        pr: PASSWORD_RESET_JWT_PURPOSE,
      },
      { expiresIn: '15m' },
    );
    return { reset_token };
  }

  async completePasswordReset(
    dto: PasswordResetCompleteDto,
  ): Promise<{ ok: true }> {
    let payload: { sub?: string; pr?: number };
    try {
      payload = await this.jwtService.verifyAsync<{
        sub?: string;
        pr?: number;
      }>(dto.reset_token);
    } catch {
      throw new UnauthorizedException(
        'Sessão de recuperação inválida ou expirada.',
      );
    }
    if (
      typeof payload.sub !== 'string' ||
      payload.pr !== PASSWORD_RESET_JWT_PURPOSE
    ) {
      throw new UnauthorizedException(
        'Sessão de recuperação inválida ou expirada.',
      );
    }
    await this.usersService.setPassword(payload.sub, dto.newPassword);
    return { ok: true };
  }
}
