import {
  BadGatewayException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Resposta normalizada (alinhada ao tickets-api `Address` / GET addresses/zip). */
export type CepLookupResult = {
  zip: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
};

/** Corpo típico da API hub.tagsa (mesma lógica do tickets-api). */
interface HubTagsaCepJson {
  retorno?: string;
  Endereco?: { nome?: string };
  Bairro?: { nome?: string };
  Cidade?: { nome?: string };
  Estado?: { uf?: string };
}

/**
 * Consulta CEP via hub Tagsa — mesma URL e chave que tickets-api
 * (`GET .../addresses/zip/:zip` com `BUSCA_CEP_KEY`).
 */
@Injectable()
export class CepService {
  constructor(private readonly config: ConfigService) {}

  /** `cep` deve ter 8 dígitos (sem hífen). */
  async lookupByDigits(cep: string): Promise<CepLookupResult> {
    const key = this.config.get<string>('BUSCA_CEP_KEY')?.trim();
    if (!key) {
      throw new ServiceUnavailableException(
        'Consulta de CEP não configurada (BUSCA_CEP_KEY).',
      );
    }
    const url = `https://cep.hub.tagsa.com.br/cep/${cep}/${key}`;
    let response: Response;
    try {
      response = await fetch(url);
    } catch {
      throw new BadGatewayException('Não foi possível contactar o serviço de CEP.');
    }
    if (!response.ok) {
      throw new BadGatewayException('Serviço de CEP indisponível.');
    }
    let data: HubTagsaCepJson;
    try {
      data = (await response.json()) as HubTagsaCepJson;
    } catch {
      throw new BadGatewayException('Resposta de CEP inválida.');
    }
    if (data.retorno === 'erro') {
      throw new NotFoundException('CEP não encontrado');
    }
    return {
      zip: cep,
      street: data.Endereco?.nome ?? '',
      number: '',
      complement: '',
      neighborhood: data.Bairro?.nome ?? '',
      city: data.Cidade?.nome ?? '',
      state: data.Estado?.uf ?? '',
    };
  }
}
