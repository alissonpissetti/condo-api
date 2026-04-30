import {
  BadGatewayException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';

/**
 * Convites ao condomínio por WhatsApp (Twilio).
 * @see https://www.twilio.com/docs/whatsapp/quickstart
 *
 * Modelo de negócio: mensagens iniciadas pelo negócio exigem template aprovado
 * (`contentSid` + `contentVariables`). O sandbox inclui modelos de exemplo;
 * em produção, crie o seu no Content API e ajuste `TWILIO_WHATSAPP_TEMPLATE_MODE`
 * (placeholders "1"…"3", modo "two" com "1" e "2", ou modo "four" com "1"…"4").
 */
@Injectable()
export class TwilioWhatsappService {
  private readonly logger = new Logger(TwilioWhatsappService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return !!(
      this.getAccountSid() &&
      this.getAuthToken() &&
      this.getWhatsappFrom()
    );
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

  private getContentSid(): string | undefined {
    return this.config.get<string>('TWILIO_WHATSAPP_CONTENT_SID')?.trim();
  }

  /**
   * `three` (default): "1" = quem convida, "2" = condomínio + unidade, "3" = link
   * `two`: "1" = resumo, "2" = link
   * `four`: "1" = quem convida, "2" = unidade, "3" = nome do condomínio, "4" = link
   */
  private getTemplateMode(): 'two' | 'three' | 'four' {
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
    const to = `whatsapp:+${digits}`;

    const who = params.inviterName?.trim() || 'A gestão do condomínio';
    const c = params.condominiumName;
    const u = params.unitIdentifier;
    const line2 = `«${c}» — unidade ${u}`;

    const contentSid = this.getContentSid();
    const client = twilio(accountSid, authToken);

    if (contentSid) {
      const mode = this.getTemplateMode();
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
        await client.messages.create({
          from,
          to,
          contentSid,
          contentVariables: JSON.stringify(contentVariables),
        });
      } catch (err) {
        this.logger.error('Twilio WhatsApp (content)', err);
        throw new BadGatewayException(
          'Não foi possível enviar a mensagem pelo WhatsApp (Twilio). Verifique o template e as variáveis.',
        );
      }
      return;
    }

    const body = params.existingAccount
      ? `${who} enviou um convite para a unidade "${u}" no condomínio «${c}». Confirme: ${params.inviteLink}`
      : `${who} enviou um convite para a unidade "${u}" no condomínio «${c}». Cadastre-se: ${params.inviteLink}`;

    if (this.allowBodyFallback()) {
      try {
        await client.messages.create({
          from,
          to,
          body,
        });
      } catch (err) {
        this.logger.error('Twilio WhatsApp (body)', err);
        throw new BadGatewayException(
          'Não foi possível enviar a mensagem pelo WhatsApp (Twilio).',
        );
      }
      return;
    }

    this.logger.warn(
      `[WhatsApp: defina TWILIO_WHATSAPP_CONTENT_SID ou TWILIO_WHATSAPP_ALLOW_BODY=true para testes] para ${to}\n${body}`,
    );
  }
}
