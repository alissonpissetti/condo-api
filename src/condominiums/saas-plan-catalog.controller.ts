import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SaasPlansService } from '../platform/saas-plans.service';

@ApiTags('Planos SaaS')
@Controller('saas-plans')
export class SaasPlanCatalogController {
  constructor(private readonly saasPlans: SaasPlansService) {}

  @Get('catalog')
  @ApiOperation({
    summary: 'Catálogo público de planos',
    description:
      'Lista planos activos para a página inicial e para escolha ao criar condomínio. Não requer autenticação.',
  })
  catalog() {
    return this.saasPlans.listPublicCatalog();
  }
}
