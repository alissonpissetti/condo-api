import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AsaasClientService {
  private readonly log = new Logger(AsaasClientService.name);
  /** Host da API (sem `/v3`); ver https://docs.asaas.com/docs/authentication-2 */
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly apiKeyEnvName: string;
  private readonly userAgent: string;

  constructor(config: ConfigService) {
    const isProduction =
      config.get<string>('ASAAS_ENV')?.toLowerCase() === 'production';
    const defaultProdUrl = 'https://api.asaas.com';
    const defaultSandboxUrl = 'https://api-sandbox.asaas.com';
    const rawUrl = isProduction
      ? config.get<string>('ASAAS_URL')?.trim()
      : config.get<string>('ASAAS_URL_SANDBOX')?.trim();
    const host = (rawUrl || (isProduction ? defaultProdUrl : defaultSandboxUrl))
      .replace(/\/+$/, '')
      .replace(/\/v3$/i, '');
    this.baseUrl = host;
    this.apiKeyEnvName = isProduction
      ? 'ASAAS_API_KEY'
      : 'ASAAS_API_KEY_SANDBOX';
    this.apiKey =
      (isProduction
        ? config.get<string>('ASAAS_API_KEY')
        : config.get<string>('ASAAS_API_KEY_SANDBOX')
      )?.trim() ?? '';
    this.userAgent =
      config.get<string>('ASAAS_USER_AGENT')?.trim() || 'condo-api';
  }

  assertConfigured(): void {
    if (!this.apiKey) {
      throw new BadRequestException(
        `Integração Asaas não configurada (${this.apiKeyEnvName}).`,
      );
    }
  }

  private headers(): Record<string, string> {
    this.assertConfigured();
    return {
      'Content-Type': 'application/json',
      'User-Agent': this.userAgent,
      access_token: this.apiKey,
    };
  }

  private url(path: string): string {
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${this.baseUrl}/v3${p}`;
  }

  /**
   * Evita crash quando a resposta é HTML (URL errada, WAF, página de erro).
   */
  private async readJsonBody(
    res: Response,
    context: string,
  ): Promise<Record<string, unknown>> {
    const text = await res.text();
    const trimmed = text.trim();
    const looksHtml =
      trimmed.startsWith('<') ||
      /^<!DOCTYPE\s+html/i.test(trimmed) ||
      /^<html[\s>]/i.test(trimmed);
    if (looksHtml) {
      this.log.error(
        `Asaas ${context}: HTTP ${res.status} — corpo HTML (primeiros 120 chars): ${trimmed.slice(0, 120).replace(/\s+/g, ' ')}`,
      );
      throw new BadRequestException(
        'A Asaas devolveu uma página HTML em vez de JSON. Confirme no .env: ' +
          'sandbox → ASAAS_URL_SANDBOX=https://api-sandbox.asaas.com; ' +
          'produção → ASAAS_ENV=production e ASAAS_URL=https://api.asaas.com. ' +
          'Evite www.asaas.com ou sandbox.asaas.com na API.',
      );
    }
    if (!trimmed) {
      throw new BadRequestException(
        `Resposta vazia da Asaas (${context}, HTTP ${res.status}).`,
      );
    }
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return { _raw: parsed } as Record<string, unknown>;
    } catch {
      this.log.warn(
        `Asaas ${context}: HTTP ${res.status}, não é JSON: ${trimmed.slice(0, 200)}`,
      );
      throw new BadRequestException(
        `Resposta inválida da Asaas (${context}). HTTP ${res.status}.`,
      );
    }
  }

  async findCustomersByEmail(email: string): Promise<{
    totalCount: number;
    data: Array<{ id: string }>;
  }> {
    const q = encodeURIComponent(email.trim().toLowerCase());
    const res = await fetch(this.url(`/customers?email=${q}`), {
      method: 'GET',
      headers: this.headers(),
    });
    const json = await this.readJsonBody(res, 'GET customers');
    if (!res.ok) {
      this.log.warn(`Asaas GET customers: ${res.status} ${JSON.stringify(json)}`);
      throw new BadRequestException(this.asaasErrorMessage(json));
    }
    return {
      totalCount: Number(json.totalCount ?? 0),
      data: (json.data as Array<{ id: string }> | undefined) ?? [],
    };
  }

  async createCustomer(body: {
    name: string;
    email: string;
    cpfCnpj: string;
  }): Promise<{ id: string }> {
    const res = await fetch(this.url('/customers'), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        name: body.name,
        email: body.email.trim().toLowerCase(),
        cpfCnpj: body.cpfCnpj.replace(/\D/g, ''),
        notificationDisabled: true,
      }),
    });
    const json = await this.readJsonBody(res, 'POST customers');
    if (!res.ok) {
      this.log.warn(`Asaas POST customer: ${res.status} ${JSON.stringify(json)}`);
      throw new BadRequestException(this.asaasErrorMessage(json));
    }
    const id = json.id != null ? String(json.id) : '';
    if (!id) {
      throw new ServiceUnavailableException('Resposta Asaas inválida (customer).');
    }
    return { id };
  }

  async createPayment(body: {
    customer: string;
    billingType: string;
    value: number;
    dueDate: string;
    externalReference: string;
    description: string;
  }): Promise<Record<string, unknown>> {
    const res = await fetch(this.url('/payments'), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    const json = await this.readJsonBody(res, 'POST payments');
    if (!res.ok) {
      this.log.warn(`Asaas POST payment: ${res.status} ${JSON.stringify(json)}`);
      throw new BadRequestException(this.asaasErrorMessage(json));
    }
    return json;
  }

  async getPayment(paymentId: string): Promise<Record<string, unknown>> {
    const res = await fetch(this.url(`/payments/${encodeURIComponent(paymentId)}`), {
      method: 'GET',
      headers: this.headers(),
    });
    const json = await this.readJsonBody(res, 'GET payments');
    if (!res.ok) {
      throw new BadRequestException(this.asaasErrorMessage(json));
    }
    return json;
  }

  extractPaymentId(payload: Record<string, unknown>): string | null {
    const id =
      (payload?.id as string) ??
      (payload?.object as { id?: string } | undefined)?.id;
    if (id == null || String(id).trim() === '') {
      return null;
    }
    return String(id);
  }

  private asaasErrorMessage(json: Record<string, unknown>): string {
    const errors = json.errors;
    if (Array.isArray(errors)) {
      const parts = errors.map((e: { description?: string }) =>
        e?.description != null ? String(e.description) : '',
      );
      const msg = parts.filter(Boolean).join(' ');
      if (msg) {
        return msg;
      }
    }
    if (json.message != null) {
      return String(json.message);
    }
    return 'Erro na API Asaas.';
  }
}
