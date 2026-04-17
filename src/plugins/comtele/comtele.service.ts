import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { toComteleReceivers } from '../../lib/phone-br';

/**
 * Envio SMS via Comtele — mesmo contrato do script legado (`POST .../api/v2/send`,
 * JSON `{ Sender, Receivers, Content }`, header `auth-key`).
 *
 * @see https://docs.comtele.com.br/
 */
@Injectable()
export class ComteleService {
  private readonly logger = new Logger(ComteleService.name);

  constructor(private readonly config: ConfigService) {}

  private getBaseUrl(): string {
    return (
      this.config.get<string>('COMTELE_API_BASE_URL')?.trim() ||
      'https://sms.comtele.com.br'
    );
  }

  private getAuthKey(): string | undefined {
    const k = this.config.get<string>('COMTELE_AUTH_KEY')?.trim();
    return k || undefined;
  }

  private getSenderId(): number {
    const raw = this.config.get<string>('COMTELE_SENDER_ID')?.trim() ?? '66912';
    const n = Number(raw);
    return Number.isFinite(n) ? n : 66912;
  }

  isConfigured(): boolean {
    return !!this.getAuthKey();
  }

  /**
   * @param receiversNormalized55 Telefone já normalizado com 55 (ex.: {@link normalizeBrCellphone})
   * @param content Texto do SMS
   */
  async send(receiversNormalized55: string, content: string): Promise<void> {
    const authKey = this.getAuthKey();
    if (!authKey) {
      throw new ServiceUnavailableException(
        'Envio de SMS não configurado (COMTELE_AUTH_KEY).',
      );
    }
    const base = this.getBaseUrl().replace(/\/$/, '');
    const url = `${base}/api/v2/send`;
    const receivers = toComteleReceivers(receiversNormalized55);
    const body = {
      Sender: this.getSenderId(),
      Receivers: receivers,
      Content: content,
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-type': 'application/json',
          'auth-key': authKey,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      this.logger.error('Comtele: falha de rede ao enviar SMS', err);
      throw new BadGatewayException(
        'Não foi possível contatar o serviço de SMS.',
      );
    }

    const text = await response.text().catch(() => '');
    let parsed: { Success?: boolean; Message?: string } | undefined;
    try {
      parsed = JSON.parse(text) as { Success?: boolean; Message?: string };
    } catch {
      parsed = undefined;
    }
    const apiMessage = parsed?.Message?.trim();

    if (response.ok && parsed && parsed.Success === false) {
      this.logger.error(`Comtele Success=false: ${apiMessage ?? text}`);
      throw new BadGatewayException(
        apiMessage ?? 'O serviço de SMS recusou o envio.',
      );
    }

    if (!response.ok) {
      this.logger.error(`Comtele HTTP ${response.status}: ${text}`);
      throw new BadGatewayException(
        apiMessage ??
          `O serviço de SMS recusou o envio (código HTTP ${response.status}).`,
      );
    }
  }
}
