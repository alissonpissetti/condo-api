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

export type SaasSubscriptionChargeMail = {
  to: string;
  condominiumName: string;
  referenceMonth: string;
  dueDate: string;
  amountCents: number;
  currency: string;
  invoiceUrl: string | null;
  bankSlipUrl: string | null;
  pixQrPayload: string | null;
};

export type CondominiumMemberInviteMail = {
  to: string;
  inviteLink: string;
  condominiumName: string;
  unitIdentifier: string;
  /** Conta já existente: texto do e-mail pede confirmação pelo link, sem cadastro. */
  existingAccount?: boolean;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendUnitPersonInvite(params: UnitPersonInviteMail): Promise<void> {
    const subject = `Convite — ${params.condominiumName} · unidade ${params.unitIdentifier}`;
    const text = `Você foi convidado(a) como ${params.roleDescription} nesta unidade.\n\nCondomínio: ${params.condominiumName}\nUnidade: ${params.unitIdentifier}\n\nPara concluir o cadastro e associar a sua conta, acesse:\n${params.inviteLink}\n\nSe não esperava este e-mail, ignore.`;

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

  async sendCondominiumMemberInvite(
    params: CondominiumMemberInviteMail,
  ): Promise<void> {
    const subject = `Convite — ${params.condominiumName} · unidade ${params.unitIdentifier}`;
    const text = params.existingAccount
      ? `Você foi convidado(a) a ser responsável pela unidade ${params.unitIdentifier} no condomínio «${params.condominiumName}».\n\nComo já tem conta neste e-mail, abra o link para confirmar a associação à unidade (não é necessário criar nova conta):\n${params.inviteLink}\n\nSe não esperava este e-mail, ignore.`
      : `Você foi convidado(a) como responsável pela unidade ${params.unitIdentifier} no condomínio «${params.condominiumName}».\n\nPara criar a sua conta e confirmar a associação à unidade, abra:\n${params.inviteLink}\n\nSe não esperava este e-mail, ignore.`;

    const host = this.config.get<string>('SMTP_HOST')?.trim();
    if (!host) {
      this.logger.warn(
        `[e-mail não configurado — defina SMTP_HOST] Convite membro para ${params.to}\n${text}`,
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

  async sendSaasSubscriptionCharge(
    params: SaasSubscriptionChargeMail,
  ): Promise<void> {
    const amount = (params.amountCents / 100).toFixed(2);
    const cur = params.currency?.toUpperCase() ?? 'BRL';
    const links: string[] = [];
    if (params.invoiceUrl) {
      links.push(`Fatura / pagamento: ${params.invoiceUrl}`);
    }
    if (params.bankSlipUrl) {
      links.push(`Boleto: ${params.bankSlipUrl}`);
    }
    if (params.pixQrPayload) {
      links.push(
        `PIX (copia e cola):\n${params.pixQrPayload}`,
      );
    }
    const linksBlock =
      links.length > 0 ? `\n\n${links.join('\n')}\n` : '\n';

    const subject = `Mensalidade da plataforma — ${params.condominiumName} (venc. ${params.dueDate})`;
    const text = `Olá,\n\nFoi gerada a mensalidade SaaS do condomínio «${params.condominiumName}».\n\nMês de referência: ${params.referenceMonth}\nValor: ${amount} ${cur}\nData de vencimento: ${params.dueDate}\n${linksBlock}\nVocê pode pagar até a data de vencimento. Em caso de dúvida, entre em contato com o suporte.\n\nSe não esperava este e-mail, ignore.`;

    const host = this.config.get<string>('SMTP_HOST')?.trim();
    if (!host) {
      this.logger.warn(
        `[e-mail não configurado — defina SMTP_HOST] Mensalidade SaaS para ${params.to}\n${text}`,
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

  async sendPasswordResetCode(to: string, code: string): Promise<void> {
    const subject = 'Código para redefinir sua senha — Meu Condomínio';
    const text = `Seu código para redefinir a senha: ${code}\n\nNão compartilhe. Válido por 10 minutos.\n\nSe você não pediu esta alteração, ignore este e-mail.`;

    const host = this.config.get<string>('SMTP_HOST')?.trim();
    if (!host) {
      this.logger.warn(
        `[e-mail não configurado — defina SMTP_HOST] Código para ${to}\n${text}`,
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
      to,
      subject,
      text,
    });
  }
}
