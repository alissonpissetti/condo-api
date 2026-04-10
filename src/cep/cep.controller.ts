import {
  BadRequestException,
  Controller,
  Get,
  Param,
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CepLookupResult, CepService } from './cep.service';
import { CepLookupWrapperDto } from './dto/cep-lookup-wrapper.dto';

@ApiTags('CEP')
@Controller('cep')
export class CepController {
  constructor(private readonly cepService: CepService) {}

  @Get(':cep')
  @ApiOperation({
    summary: 'Consultar CEP (hub Tagsa)',
    description:
      'Mesma integração que tickets-api `GET /addresses/zip/:zip`. Requer BUSCA_CEP_KEY.',
  })
  @ApiParam({
    name: 'cep',
    description: '8 dígitos, com ou sem hífen',
    example: '01310100',
  })
  @ApiOkResponse({ type: CepLookupWrapperDto })
  @ApiNotFoundResponse({ description: 'CEP não encontrado' })
  @ApiServiceUnavailableResponse({ description: 'Chave não configurada' })
  async lookup(@Param('cep') cepRaw: string): Promise<{ data: CepLookupResult }> {
    const digits = cepRaw.replace(/\D/g, '');
    if (digits.length !== 8) {
      throw new BadRequestException('CEP deve ter 8 dígitos.');
    }
    const data = await this.cepService.lookupByDigits(digits);
    return { data };
  }
}
