import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import {
  CondominiumFeesService,
  type CondominiumFeeChargeView,
} from './condominium-fees.service';
import { CompetenceYmDto } from './dto/competence-ym.dto';
import { SettleFeeChargeDto } from './dto/settle-fee-charge.dto';

@ApiTags('Financeiro — taxas condominiais')
@ApiBearerAuth('JWT')
@Controller('condominiums/:condominiumId/condominium-fees')
@UseGuards(JwtAuthGuard)
export class CondominiumFeesController {
  constructor(private readonly feesService: CondominiumFeesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar cobranças da competência' })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  @ApiQuery({ name: 'competenceYm', example: '2026-03' })
  list(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Query('competenceYm') competenceYm: string,
  ): Promise<CondominiumFeeChargeView[]> {
    return this.feesService.listCharges(
      condominiumId,
      userId,
      competenceYm ?? '',
    );
  }

  @Post('close-month')
  @ApiOperation({
    summary: 'Fechar mês (acrual de fundos + cobranças), igual ao cron',
  })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  closeMonth(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Body() body: CompetenceYmDto,
  ): Promise<CondominiumFeeChargeView[]> {
    return this.feesService.closeMonth(
      condominiumId,
      userId,
      body.competenceYm,
    );
  }

  @Post('regenerate-month')
  @ApiOperation({
    summary:
      'Regenerar cobranças (apaga linhas não pagas e recalcula). Bloqueado se existir cobrança paga.',
  })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  regenerateMonth(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Body() body: CompetenceYmDto,
  ): Promise<CondominiumFeeChargeView[]> {
    return this.feesService.regenerateMonth(
      condominiumId,
      userId,
      body.competenceYm,
    );
  }

  @Post(':chargeId/settle')
  @ApiOperation({ summary: 'Quitar com transação de receita rateada' })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  @ApiParam({ name: 'chargeId', format: 'uuid' })
  settle(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('chargeId', ParseUUIDPipe) chargeId: string,
    @Body() body: SettleFeeChargeDto,
  ): Promise<CondominiumFeeChargeView> {
    return this.feesService.settle(
      condominiumId,
      userId,
      chargeId,
      body.incomeTransactionId,
    );
  }
}
