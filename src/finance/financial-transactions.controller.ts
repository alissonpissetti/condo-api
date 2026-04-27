import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateRecurringSeriesDto } from './dto/update-recurring-series.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { FinancialTransactionsService } from './financial-transactions.service';

@ApiTags('Financeiro — transações')
@ApiBearerAuth('JWT')
@Controller('condominiums/:condominiumId/transactions')
@UseGuards(JwtAuthGuard)
export class FinancialTransactionsController {
  constructor(private readonly txService: FinancialTransactionsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar transações' })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  @ApiQuery({ name: 'fundId', required: false })
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'Data inicial (AAAA-MM-DD), inclusive, filtro por occurred_on',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    description: 'Data final (AAAA-MM-DD), inclusive, filtro por occurred_on',
  })
  findAll(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Query('fundId') fundId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.txService.findAll(condominiumId, userId, fundId, from, to);
  }

  @Post()
  @ApiOperation({
    summary: 'Criar transação (rateio conforme allocation_rule)',
  })
  create(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Body() dto: CreateTransactionDto,
  ) {
    return this.txService.create(condominiumId, userId, dto);
  }

  @Patch('recurring-series/:seriesId')
  @ApiOperation({
    summary:
      'Atualizar todas as transações da série (título base, rateio, tipo, etc.)',
  })
  @ApiParam({ name: 'seriesId', format: 'uuid' })
  updateRecurringSeries(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('seriesId', ParseUUIDPipe) seriesId: string,
    @Body() dto: UpdateRecurringSeriesDto,
  ) {
    return this.txService.updateRecurringSeries(
      condominiumId,
      seriesId,
      userId,
      dto,
    );
  }

  @Delete('recurring-series/:seriesId')
  @ApiOperation({ summary: 'Excluir todas as transações da série recorrente' })
  @ApiParam({ name: 'seriesId', format: 'uuid' })
  removeRecurringSeries(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('seriesId', ParseUUIDPipe) seriesId: string,
  ) {
    return this.txService.removeRecurringSeries(condominiumId, seriesId, userId);
  }

  @Get(':transactionId')
  @ApiOperation({ summary: 'Obter transação com shares' })
  findOne(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
  ) {
    return this.txService.findOne(condominiumId, transactionId, userId);
  }

  @Patch(':transactionId')
  @ApiOperation({ summary: 'Atualizar transação (recalcula shares)' })
  update(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
    @Body() dto: UpdateTransactionDto,
  ) {
    return this.txService.update(condominiumId, transactionId, userId, dto);
  }

  @Delete(':transactionId')
  @ApiOperation({ summary: 'Excluir transação' })
  remove(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
  ) {
    return this.txService.remove(condominiumId, transactionId, userId);
  }
}
