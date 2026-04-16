import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateSaasChargeDto } from './dto/create-saas-charge.dto';
import { CreateSaasPlanDto } from './dto/create-saas-plan.dto';
import { CreateSaasVoucherDto } from './dto/create-saas-voucher.dto';
import { PageQueryDto } from './dto/page-query.dto';
import { PatchSaasBillingDto } from './dto/patch-saas-billing.dto';
import { PatchSaasPlanDto } from './dto/patch-saas-plan.dto';
import { PatchCondominiumVoucherDto } from './dto/patch-condominium-voucher.dto';
import { PatchSaasVoucherDto } from './dto/patch-saas-voucher.dto';
import { PlatformAdminGuard } from './platform-admin.guard';
import { PlatformBillingAsaasService } from './platform-billing-asaas.service';
import { PlatformService } from './platform.service';
import { SaasPlansService } from './saas-plans.service';
import { SaasVoucherService } from './saas-voucher.service';

@ApiTags('Plataforma (SaaS)')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('platform')
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly billingAsaas: PlatformBillingAsaasService,
    private readonly saasPlans: SaasPlansService,
    private readonly vouchers: SaasVoucherService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Confirma sessão de administrador da plataforma' })
  @ApiOkResponse({
    schema: {
      example: { email: 'admin@exemplo.com', platformAdmin: true },
    },
  })
  getMe(@Req() req: Request & { user: { userId: string } }) {
    return this.platform.getMe(req.user.userId);
  }

  @Get('users')
  @ApiOperation({ summary: 'Listagem paginada de utilizadores (titulares)' })
  listUsers(@Query() q: PageQueryDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    return this.platform.listUsers(page, limit);
  }

  @Get('condominiums')
  @ApiOperation({ summary: 'Listagem paginada de condomínios com titular' })
  listCondominiums(@Query() q: PageQueryDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    return this.platform.listCondominiums(page, limit);
  }

  @Get('plans')
  @ApiOperation({ summary: 'Listar planos SaaS (preço por unidade)' })
  listPlans() {
    return this.saasPlans.listPlans();
  }

  @Post('plans')
  @ApiOperation({ summary: 'Criar plano' })
  createPlan(@Body() body: CreateSaasPlanDto) {
    return this.saasPlans.createPlan(body);
  }

  @Patch('plans/:planId')
  @ApiOperation({ summary: 'Atualizar plano' })
  patchPlan(
    @Param('planId', ParseIntPipe) planId: number,
    @Body() body: PatchSaasPlanDto,
  ) {
    return this.saasPlans.patchPlan(planId, body);
  }

  @Post('plans/:planId/set-default')
  @ApiOperation({
    summary: 'Definir plano padrão para novos registos',
  })
  setDefaultPlan(@Param('planId', ParseIntPipe) planId: number) {
    return this.saasPlans.setDefaultPlan(planId);
  }

  @Delete('plans/:planId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Remover plano (apenas se não estiver atribuído a condomínios nem referenciado noutros registos)',
  })
  async deletePlan(
    @Param('planId', ParseIntPipe) planId: number,
  ): Promise<void> {
    await this.saasPlans.deletePlan(planId);
  }

  @Get('condominiums/:id/plan-pricing')
  @ApiOperation({
    summary:
      'Pré-visualizar mensalidade (plano × unidades, vouchers pelo mês YYYY-MM)',
  })
  getCondominiumPlanPricing(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('referenceMonth') referenceMonth?: string,
  ) {
    return this.saasPlans.computeCondominiumPlanPricing(id, referenceMonth);
  }

  @Get('vouchers')
  @ApiOperation({ summary: 'Listar vouchers (catálogo: nome + código)' })
  listVouchers() {
    return this.vouchers.listVouchersForPlatform();
  }

  @Post('vouchers')
  @ApiOperation({ summary: 'Criar voucher no catálogo' })
  createVoucher(@Body() body: CreateSaasVoucherDto) {
    return this.vouchers.createVoucher(body);
  }

  @Patch('vouchers/:voucherId')
  @ApiOperation({ summary: 'Atualizar voucher do catálogo' })
  patchVoucher(
    @Param('voucherId', ParseUUIDPipe) voucherId: string,
    @Body() body: PatchSaasVoucherDto,
  ) {
    return this.vouchers.patchVoucher(voucherId, body);
  }

  @Get('condominiums/:id/voucher')
  @ApiOperation({ summary: 'Voucher associado ao condomínio (por código)' })
  getCondominiumVoucher(@Param('id', ParseUUIDPipe) id: string) {
    return this.vouchers.getCondominiumVoucherAssignment(id);
  }

  @Patch('condominiums/:id/voucher')
  @ApiOperation({
    summary: 'Associar voucher ao condomínio pelo código (ou null para remover)',
  })
  patchCondominiumVoucher(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PatchCondominiumVoucherDto,
  ) {
    const had = Object.prototype.hasOwnProperty.call(body, 'code');
    return this.vouchers.patchCondominiumVoucherCode(id, body.code, had);
  }

  @Get('condominiums/:id/billing')
  @ApiOperation({ summary: 'Perfil de faturação SaaS do condomínio' })
  getBilling(@Param('id', ParseUUIDPipe) id: string) {
    return this.platform.getBilling(id);
  }

  @Patch('condominiums/:id/billing')
  @ApiOperation({ summary: 'Atualizar perfil de faturação SaaS' })
  patchBilling(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PatchSaasBillingDto,
  ) {
    return this.platform.patchBilling(id, body);
  }

  @Get('condominiums/:id/billing/charges')
  @ApiOperation({ summary: 'Listar cobranças mensais SaaS' })
  listCharges(@Param('id', ParseUUIDPipe) id: string) {
    return this.platform.listCharges(id);
  }

  @Get('dashboard/summary')
  @ApiOperation({
    summary: 'Resumo para painel (totais de condomínios e cobranças pendentes do mês)',
  })
  dashboardSummary() {
    return this.billingAsaas.dashboardSummary();
  }

  @Post('condominiums/:id/billing/charges')
  @ApiOperation({
    summary: 'Gerar cobrança do mês (Asaas + registo local)',
  })
  createCharge(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateSaasChargeDto,
  ) {
    return this.billingAsaas.createMonthlyCharge(id, body);
  }

  @Post('billing/charges/bulk')
  @ApiOperation({
    summary:
      'Gerar cobrança do mês para todos os condomínios (Asaas + registo local)',
  })
  bulkCreateCharges(@Body() body: CreateSaasChargeDto) {
    return this.billingAsaas.bulkCreateMonthlyCharges(body);
  }

  @Post('billing/asaas/sync-pending')
  @ApiOperation({
    summary:
      'Sincronizar cobranças pendentes com a Asaas (GET pagamento por ID). Util se o webhook falhou.',
  })
  syncAsaasPendingCharges() {
    return this.billingAsaas.syncPendingChargesFromAsaas();
  }
}
