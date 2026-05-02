import {
  BadGatewayException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';
import { toWhatsAppE164BrDigits } from '../lib/phone-br';

/**
 * WhatsApp via Twilio (templates Content API / `contentSid` + `contentVariables`).
 *
 * Ações e variáveis de ambiente:
 * - **Convite ao condomínio**: `TWILIO_WHATSAPP_CONTENT_SID_INVITE` (ou legado `TWILIO_WHATSAPP_CONTENT_SID`)
 * - **Código «esqueci minha senha»**: `TWILIO_WHATSAPP_CONTENT_SID_PASSWORD_RESET` (placeholder `1` = código de 6 dígitos)
 * - **Código de login (celular)**: `TWILIO_WHATSAPP_CONTENT_SID_LOGIN` (placeholder `1` = código de 6 dígitos)
 * - **Slip mensal taxas condominiais** (PDF): `TWILIO_WHATSAPP_CONTENT_SID_FEE_SLIP` + `TWILIO_WHATSAPP_FEE_SLIP_TEMPLATE_MODE`
 *   (omissão `two_financial_pdf`: `1` nome do responsável financeiro, `2` URL do PDF; ver `four`, `two_summary_url`, `one_url`).
 *
 * @see https://www.twilio.com/docs/whatsapp/quickstart
 */
@Injectable()
export class TwilioWhatsappService {
  private readonly logger = new Logger(TwilioWhatsappService.name);

  constructor(private readonly config: ConfigService) {}

  /** Conta + token + número remetente WhatsApp. */
  isBaseConfigured(): boolean {
    return !!(
      this.getAccountSid() &&
      this.getAuthToken() &&
      this.getWhatsappFrom()
    );
  }

  /**
   * Compatível com o uso anterior: base Twilio OK (o envio de convite ainda exige
   * template de convite ou `TWILIO_WHATSAPP_ALLOW_BODY`).
   */
  isConfigured(): boolean {
    return this.isBaseConfigured();
  }

  /** Template de convite definido (ou fallback de corpo permitido). */
  canSendCondominiumInvite(): boolean {
    if (!this.isBaseConfigured()) return false;
    return !!(this.getInviteContentSid() || this.allowBodyFallback());
  }

  /** Template Twilio aprovado para código de redefinição de senha (variável `1` = código). */
  canSendPasswordResetWhatsapp(): boolean {
    return !!(this.isBaseConfigured() && this.getPasswordResetContentSid());
  }

  /** Template Twilio aprovado para código de login por celular (variável `1` = código). */
  canSendPhoneLoginWhatsapp(): boolean {
    return !!(this.isBaseConfigured() && this.getPhoneLoginContentSid());
  }

  private getAccountSid(): string | undefined {
    return this.config.get<string>('TWILIO_ACCOUNT_SID')?.trim();
  }

  private getAuthToken(): string | undefined {
    return this.config.get<string>('TWILIO_AUTH_TOKEN')?.trim();
  }

  /** ex.: whatsapp:+14155238886 */
  private getWhatsappFrom(): string | undefined {
    return this.config.get<string>('TWILIO_WHATSAPP_FROM')?.trim();
  }

  /**
   * Content SID do template de **convite** ao condomínio.
   * `TWILIO_WHATSAPP_CONTENT_SID_INVITE` tem prioridade; `TWILIO_WHATSAPP_CONTENT_SID` mantém compatibilidade.
   */
  private getInviteContentSid(): string | undefined {
    return (
      this.config.get<string>('TWILIO_WHATSAPP_CONTENT_SID_INVITE')?.trim() ||
      this.config.get<string>('TWILIO_WHATSAPP_CONTENT_SID')?.trim()
    );
  }

  /** Content SID do template **esqueci minha senha** (WhatsApp). */
  private getPasswordResetContentSid(): string | undefined {
    return this.config
      .get<string>('TWILIO_WHATSAPP_CONTENT_SID_PASSWORD_RESET')
      ?.trim();
  }

  /** Content SID do template **login por celular** (WhatsApp). */
  private getPhoneLoginContentSid(): string | undefined {
    return this.config.get<string>('TWILIO_WHATSAPP_CONTENT_SID_LOGIN')?.trim();
  }

  /** Content SID do template **slip / taxa mensal** (WhatsApp). Quando vazio, usa body + mediaUrl. */
  private getFeeSlipContentSid(): string | undefined {
    return this.config
      .get<string>('TWILIO_WHATSAPP_CONTENT_SID_FEE_SLIP')
      ?.trim();
  }

  /**
   * Mapeamento dos placeholders do template de slip (independente de `TWILIO_WHATSAPP_TEMPLATE_MODE` do convite).
   * - `two_financial_pdf` (omissão): `"1"` nome do responsável financeiro, `"2"` URL HTTPS do PDF (token).
   * - `four`: `"1"` condomínio, `"2"` unidade, `"3"` competência (AAAA-MM), `"4"` URL do PDF.
   * - `two_summary_url`: `"1"` resumo (condomínio — unidade — Taxa …), `"2"` URL do PDF.
   * - `one_url`: `"1"` = só URL do PDF.
   */
  private getFeeSlipContentTemplateMode():
    | 'two_financial_pdf'
    | 'four'
    | 'two_summary_url'
    | 'one_url' {
    const m = this.config
      .get<string>('TWILIO_WHATSAPP_FEE_SLIP_TEMPLATE_MODE')
      ?.trim();
    if (m === 'four' || m === 'two_summary_url' || m === 'one_url') {
      return m;
    }
    return 'two_financial_pdf';
  }

  private buildFeeSlipContentVariables(
    mode: 'two_financial_pdf' | 'four' | 'two_summary_url' | 'one_url',
    params: {
      financialResponsibleDisplayName: string;
      condominiumName: string;
      unitLabel: string;
      competenceYm: string;
      mediaUrl: string;
    },
  ): Record<string, string> {
    const c = params.condominiumName.trim() || 'Condomínio';
    const u = params.unitLabel.trim() || 'Unidade';
    const ym = params.competenceYm.trim();
    const url = params.mediaUrl;
    const fin = params.financialResponsibleDisplayName.trim() || 'Morador';
    if (mode === 'one_url') {
      return { '1': url };
    }
    if (mode === 'two_financial_pdf') {
      return { '1': fin, '2': url };
    }
    if (mode === 'two_summary_url') {
      return {
        '1': `${c} — ${u} — Taxa ${ym}.`,
        '2': url,
      };
    }
    return {
      '1': c,
      '2': u,
      '3': ym,
      '4': url,
    };
  }

  /**
   * `three` (default): "1" = quem convida, "2" = condomínio + unidade, "3" = link
   * `two`: "1" = resumo, "2" = link
   * `four`: "1" = quem convida, "2" = unidade, "3" = nome do condomínio, "4" = link
   */
  private getInviteTemplateMode(): 'two' | 'three' | 'four' {
    const m = this.config.get<string>('TWILIO_WHATSAPP_TEMPLATE_MODE')?.trim();
    if (m === 'two' || m === 'four') return m;
    return 'three';
  }

  private allowBodyFallback(): boolean {
    return (
      this.config.get<string>('TWILIO_WHATSAPP_ALLOW_BODY')?.toLowerCase() ===
      'true'
    );
  }

  /**
   * @param phoneE164 55 + DDD + celular (ex.: 5561999998888), com ou sem +
   */
  async sendCondominiumInvite(
    phoneE164: string,
    params: {
      inviterName: string;
      condominiumName: string;
      unitIdentifier: string;
      inviteLink: string;
      existingAccount: boolean;
    },
  ): Promise<void> {
    const accountSid = this.getAccountSid();
    const authToken = this.getAuthToken();
    const from = this.getWhatsappFrom();
    if (!accountSid || !authToken || !from) {
      this.logger.warn(
        '[Twilio WhatsApp] Defina TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN e TWILIO_WHATSAPP_FROM.',
      );
      return;
    }

    const digits = phoneE164.replace(/\D/g, '');
    const toDigits = toWhatsAppE164BrDigits(digits);
    const to = `whatsapp:+${toDigits}`;

    const who = params.inviterName?.trim() || 'A gestão do condomínio';
    const c = params.condominiumName;
    const u = params.unitIdentifier;
    const line2 = `«${c}» — unidade ${u}`;

    const contentSid = this.getInviteContentSid();
    const client = twilio(accountSid, authToken);

    if (contentSid) {
      const mode = this.getInviteTemplateMode();
      const contentVariables: Record<string, string> =
        mode === 'two'
          ? {
              '1': params.existingAccount
                ? `${who} convidou você a confirmar a responsabilidade: ${line2}.`
                : `${who} convidou você a se cadastrar: ${line2}.`,
              '2': params.inviteLink,
            }
          : mode === 'four'
            ? {
                '1': who,
                '2': u,
                '3': c,
                '4': params.inviteLink,
              }
            : {
                '1': who,
                '2': line2,
                '3': params.inviteLink,
              };
      try {
        const msg = await client.messages.create({
          from,
          to,
          contentSid,
          contentVariables: JSON.stringify(contentVariables),
        });
        this.logger.log(
          `WhatsApp (Twilio) convite enfileirado: status=${msg.status} …${msg.sid?.slice(-6)}`,
        );
      } catch (err) {
        this.logger.error('Twilio WhatsApp convite (content)', err);
        throw new BadGatewayException(
          'Não foi possível enviar a mensagem pelo WhatsApp (Twilio). Verifique o template de convite e as variáveis.',
        );
      }
      return;
    }

    const body = params.existingAccount
      ? `${who} enviou um convite para a unidade "${u}" no condomínio «${c}». Confirme: ${params.inviteLink}`
      : `${who} enviou um convite para a unidade "${u}" no condomínio «${c}». Cadastre-se: ${params.inviteLink}`;

    if (this.allowBodyFallback()) {
      try {
        const msg = await client.messages.create({
          from,
          to,
          body,
        });
        this.logger.log(
          `WhatsApp (Twilio) convite (body) enfileirado: status=${msg.status} …${msg.sid?.slice(-6)}`,
        );
      } catch (err) {
        this.logger.error('Twilio WhatsApp convite (body)', err);
        throw new BadGatewayException(
          'Não foi possível enviar a mensagem pelo WhatsApp (Twilio).',
        );
      }
      return;
    }

    this.logger.warn(
      `[WhatsApp convite: defina TWILIO_WHATSAPP_CONTENT_SID_INVITE (ou TWILIO_WHATSAPP_CONTENT_SID) ou TWILIO_WHATSAPP_ALLOW_BODY=true] para ${to}\n${body}`,
    );
  }

  /**
   * Código de redefinição de senha por WhatsApp (template aprovado na Twilio).
   * O template deve expor pelo menos a variável **`1`** = código numérico (6 dígitos).
   */
  async sendPasswordResetCode(
    phoneE164: string,
    params: { code: string },
  ): Promise<void> {
    const accountSid = this.getAccountSid();
    const authToken = this.getAuthToken();
    const from = this.getWhatsappFrom();
    const contentSid = this.getPasswordResetContentSid();
    if (!accountSid || !authToken || !from || !contentSid) {
      this.logger.warn(
        '[Twilio WhatsApp] Redefinição de senha: defina TWILIO_WHATSAPP_CONTENT_SID_PASSWORD_RESET e credenciais Twilio.',
      );
      throw new BadGatewayException(
        'Envio de código por WhatsApp (Twilio) não configurado.',
      );
    }

    const digits = phoneE164.replace(/\D/g, '');
    const toDigits = toWhatsAppE164BrDigits(digits);
    const to = `whatsapp:+${toDigits}`;
    const client = twilio(accountSid, authToken);
    const contentVariables = JSON.stringify({ '1': params.code });

    try {
      const msg = await client.messages.create({
        from,
        to,
        contentSid,
        contentVariables,
      });
      this.logger.log(
        `WhatsApp (Twilio) pwd reset enfileirado: status=${msg.status} …${msg.sid?.slice(-6)}`,
      );
    } catch (err) {
      this.logger.error('Twilio WhatsApp password-reset (content)', err);
      throw new BadGatewayException(
        'Não foi possível enviar o código pelo WhatsApp (Twilio). Verifique o template de redefinição de senha.',
      );
    }
  }

  /**
   * Código de login por celular via WhatsApp (template aprovado na Twilio).
   * O template deve expor pelo menos a variável **`1`** = código numérico (6 dígitos).
   */
  async sendPhoneLoginCode(
    phoneE164: string,
    params: { code: string },
  ): Promise<void> {
    const accountSid = this.getAccountSid();
    const authToken = this.getAuthToken();
    const from = this.getWhatsappFrom();
    const contentSid = this.getPhoneLoginContentSid();
    if (!accountSid || !authToken || !from || !contentSid) {
      this.logger.warn(
        '[Twilio WhatsApp] Login: defina TWILIO_WHATSAPP_CONTENT_SID_LOGIN e credenciais Twilio.',
      );
      throw new BadGatewayException(
        'Envio de código por WhatsApp (Twilio) não configurado.',
      );
    }

    const digits = phoneE164.replace(/\D/g, '');
    const toDigits = toWhatsAppE164BrDigits(digits);
    const to = `whatsapp:+${toDigits}`;
    const client = twilio(accountSid, authToken);
    const contentVariables = JSON.stringify({ '1': params.code });

    try {
      const msg = await client.messages.create({
        from,
        to,
        contentSid,
        contentVariables,
      });
      this.logger.log(
        `WhatsApp (Twilio) login enfileirado: status=${msg.status} …${msg.sid?.slice(-6)}`,
      );
    } catch (err) {
      this.logger.error('Twilio WhatsApp login (content)', err);
      throw new BadGatewayException(
        'Não foi possível enviar o código pelo WhatsApp (Twilio). Verifique o template de login.',
      );
    }
  }

  /** Conta Twilio + remetente WhatsApp (mensagem livre / anexo conforme política Meta). */
  canSendArbitraryWhatsapp(): boolean {
    return this.isBaseConfigured();
  }

  /**
   * Slip da taxa em PDF: Twilio obtém o ficheiro em `mediaUrl` (HTTPS público).
   * Fora da janela de 24h pode exigir modelo aprovado na Meta.
   */
  async sendFeeSlipWithMediaUrl(
    phoneE164: string,
    params: { body: string; mediaUrl: string },
  ): Promise<void> {
    const accountSid = this.getAccountSid();
    const authToken = this.getAuthToken();
    const from = this.getWhatsappFrom();
    if (!accountSid || !authToken || !from) {
      throw new BadGatewayException(
        'WhatsApp (Twilio) não configurado: defina TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN e TWILIO_WHATSAPP_FROM.',
      );
    }
    const digits = phoneE164.replace(/\D/g, '');
    const toDigits = toWhatsAppE164BrDigits(digits);
    const to = `whatsapp:+${toDigits}`;
    const client = twilio(accountSid, authToken);
    try {
      const msg = await client.messages.create({
        from,
        to,
        body: params.body,
        mediaUrl: [params.mediaUrl],
      });
      this.logger.log(
        `WhatsApp (Twilio) slip taxa: status=${msg.status} …${msg.sid?.slice(-6)}`,
      );
    } catch (err) {
      this.logger.error('Twilio WhatsApp slip (media)', err);
      throw new BadGatewayException(
        'Não foi possível enviar o slip pelo WhatsApp. Verifique Twilio, URL pública do PDF (PUBLIC_BASE_URL) e políticas de conteúdo na Meta.',
      );
    }
  }

  /**
   * Slip mensal: com `TWILIO_WHATSAPP_CONTENT_SID_FEE_SLIP` usa o template Content API
   * (variáveis conforme `TWILIO_WHATSAPP_FEE_SLIP_TEMPLATE_MODE`); senão envia `body` + `mediaUrl`.
   */
  async sendFeeSlipWhatsapp(
    phoneE164: string,
    params: {
      /** Placeholder `1` no modo `two_financial_pdf` (template de taxas). */
      financialResponsibleDisplayName: string;
      condominiumName: string;
      unitLabel: string;
      competenceYm: string;
      mediaUrl: string;
      /** Só usado quando não há Content SID de slip (envio legado com anexo). */
      fallbackBody: string;
    },
  ): Promise<void> {
    const contentSid = this.getFeeSlipContentSid();
    if (!contentSid) {
      await this.sendFeeSlipWithMediaUrl(phoneE164, {
        body: params.fallbackBody,
        mediaUrl: params.mediaUrl,
      });
      return;
    }

    const accountSid = this.getAccountSid();
    const authToken = this.getAuthToken();
    const from = this.getWhatsappFrom();
    if (!accountSid || !authToken || !from) {
      throw new BadGatewayException(
        'WhatsApp (Twilio) não configurado: defina TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN e TWILIO_WHATSAPP_FROM.',
      );
    }
    const digits = phoneE164.replace(/\D/g, '');
    const toDigits = toWhatsAppE164BrDigits(digits);
    const to = `whatsapp:+${toDigits}`;
    const client = twilio(accountSid, authToken);
    const mode = this.getFeeSlipContentTemplateMode();
    const contentVariables = JSON.stringify(
      this.buildFeeSlipContentVariables(mode, {
        financialResponsibleDisplayName: params.financialResponsibleDisplayName,
        condominiumName: params.condominiumName,
        unitLabel: params.unitLabel,
        competenceYm: params.competenceYm,
        mediaUrl: params.mediaUrl,
      }),
    );
    try {
      const msg = await client.messages.create({
        from,
        to,
        contentSid,
        contentVariables,
      });
      this.logger.log(
        `WhatsApp (Twilio) slip taxa (template): status=${msg.status} …${msg.sid?.slice(-6)}`,
      );
    } catch (err) {
      this.logger.error('Twilio WhatsApp slip (content template)', err);
      throw new BadGatewayException(
        'Não foi possível enviar o slip pelo WhatsApp (template de taxas). Verifique TWILIO_WHATSAPP_CONTENT_SID_FEE_SLIP, TWILIO_WHATSAPP_FEE_SLIP_TEMPLATE_MODE e os placeholders no Content Editor da Twilio.',
      );
    }
  }
}
