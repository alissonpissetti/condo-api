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
  /** Nome de quem envia o convite (ex.: ficha vinculada à conta de gestão). */
  inviterName: string;
  /** Conta já existente: texto do e-mail pede confirmação pelo link, sem cadastro. */
  existingAccount?: boolean;
};

/** Texto curto (log / fallback) — mesmo sentido do e-mail; canal celular = WhatsApp (Twilio). */
export function buildCondominiumMemberInviteSms(
  p: CondominiumMemberInviteMail,
): string {
  const who = p.inviterName?.trim() || 'A gestão do condomínio';
  const l = p.inviteLink;
  if (p.existingAccount) {
    return `${who} enviou um convite p/ a unidade "${p.unitIdentifier}" no "${p.condominiumName}". Confirme: ${l}`;
  }
  return `${who} enviou um convite p/ a unidade "${p.unitIdentifier}" no "${p.condominiumName}". Cadastre-se: ${l}`;
}

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
    const who = params.inviterName?.trim() || 'A gestão do condomínio';
    const c = params.condominiumName;
    const u = params.unitIdentifier;
    const l = params.inviteLink;
    const subject = `Convite — ${c} · unidade ${u}`;
    const text = params.existingAccount
      ? `${who} enviou um convite para identificar você como responsável participante da unidade «${u}» no condomínio «${c}».\n\nJá possui cadastro: confirme a associação abrindo o link. Se não esperava este convite, ignore.\n\n${l}`
      : `${who} enviou um convite para identificar você como responsável participante da unidade «${u}» no condomínio «${c}».\n\nClique no link abaixo para se cadastrar e aceitar. Se não esperava este convite, ignore.\n\n${l}`;

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

  /** Nova resposta da equipe no chamado de suporte (link com token para acompanhar). */
  async sendSupportTicketReply(params: {
    to: string;
    ticketTitle: string;
    followUrl: string;
    replyPreview: string;
  }): Promise<void> {
    const preview =
      params.replyPreview.length > 400
        ? `${params.replyPreview.slice(0, 400)}…`
        : params.replyPreview;
    const subject = `Nova resposta no suporte — «${params.ticketTitle}»`;
    const text = `Olá,\n\nA equipe deixou uma nova resposta no seu chamado de suporte «${params.ticketTitle}».\n\n---\n${preview}\n---\n\nAcompanhe o andamento e responda quando quiser, usando o link seguro abaixo (é o mesmo do e-mail; guarde-o se precisar voltar mais tarde):\n${params.followUrl}\n\nSe você não abriu este chamado na plataforma, ignore este e-mail.\n\n— Meu Condomínio`;

    const host = this.config.get<string>('SMTP_HOST')?.trim();
    if (!host) {
      this.logger.warn(
        `[e-mail não configurado — defina SMTP_HOST] Resposta suporte para ${params.to}\n${text}`,
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

  /**
   * Cópia para o síndico (dono do condomínio): chamado à plataforma com contexto do condomínio,
   * ou solicitação dirigida à gestão do condomínio.
   */
  async sendSupportTicketOpenedSyndicCopy(params: {
    to: string;
    condominiumName: string;
    requesterName: string;
    requesterEmail: string;
    categoryLabel: string;
    ticketTitle: string;
    bodyPreview: string;
    /** true = pedido à gestão do condomínio; false = pedido à plataforma com este condomínio como contexto. */
    directedToCondominiumManagement: boolean;
  }): Promise<void> {
    const preview =
      params.bodyPreview.length > 800
        ? `${params.bodyPreview.slice(0, 800)}…`
        : params.bodyPreview;
    const subject = params.directedToCondominiumManagement
      ? `[${params.condominiumName}] Nova solicitação à gestão do condomínio`
      : `[${params.condominiumName}] Novo chamado à plataforma Meu Condomínio (contexto)`;
    const intro = params.directedToCondominiumManagement
      ? `Um usuário com acesso ao condomínio «${params.condominiumName}» registrou uma solicitação dirigida à gestão do condomínio (você como síndico(a)). O registro também fica no sistema para a equipe da plataforma acompanhar quando necessário.`
      : `Um usuário com acesso ao condomínio «${params.condominiumName}» abriu um chamado à plataforma Meu Condomínio e indicou este condomínio como contexto. Você recebe esta mensagem como síndico(a) — o atendimento principal é feito pela equipe da plataforma; este e-mail é para ciência.`;
    const text = `Olá,\n\n${intro}\n\nQuem abriu: ${params.requesterName} <${params.requesterEmail}>\nCategoria: ${params.categoryLabel}\nAssunto: ${params.ticketTitle}\n\n---\n${preview}\n---\n\nSe precisar alinhar algo com a pessoa que abriu, use o contato acima.\n\n— Meu Condomínio`;

    const host = this.config.get<string>('SMTP_HOST')?.trim();
    if (!host) {
      this.logger.warn(
        `[e-mail não configurado — defina SMTP_HOST] Cópia chamado suporte (síndico) para ${params.to}\n${text}`,
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

  /** Informativo do condomínio (HTML + texto alternativo). */
  async sendCommunicationBroadcast(params: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void> {
    const host = this.config.get<string>('SMTP_HOST')?.trim();
    if (!host) {
      this.logger.warn(
        `[e-mail não configurado — defina SMTP_HOST] Informativo para ${params.to}\n${params.text}`,
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
      subject: params.subject,
      text: params.text,
      html: params.html,
    });
  }
}
