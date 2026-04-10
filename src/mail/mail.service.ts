import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

export type UnitPersonInviteMail = {
  to: string;
  inviteLink: string;
  roleDescription: string;
  condominiumName: string;
  unitIdentifier: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendUnitPersonInvite(params: UnitPersonInviteMail): Promise<void> {
    const subject = `Convite — ${params.condominiumName} · unidade ${params.unitIdentifier}`;
    const text = `Foi convidado como ${params.roleDescription} nesta unidade.\n\nCondomínio: ${params.condominiumName}\nUnidade: ${params.unitIdentifier}\n\nPara concluir o cadastro e associar a sua conta, aceda a:\n${params.inviteLink}\n\nSe não esperava este e-mail, ignore.`;

    const host = this.config.get<string>('SMTP_HOST')?.trim();
    if (!host) {
      this.logger.warn(
        `[e-mail não configurado — defina SMTP_HOST] Convite para ${params.to}\n${text}`,
      );
      return;
    }

    const port = parseInt(this.config.get<string>('SMTP_PORT', '587'), 10);
    const secure =
      this.config.get<string>('SMTP_SECURE', 'false').toLowerCase() === 'true';
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    const from = this.config.get<string>(
      'EMAIL_FROM',
      user ?? 'noreply@localhost',
    );

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    });

    await transporter.sendMail({
      from,
      to: params.to,
      subject,
      text,
    });
  }
}
