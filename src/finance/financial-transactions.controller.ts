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
  findAll(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Query('fundId') fundId?: string,
  ) {
    return this.txService.findAll(condominiumId, userId, fundId);
  }

  @Post()
  @ApiOperation({ summary: 'Criar transação (rateio conforme allocation_rule)' })
  create(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Body() dto: CreateTransactionDto,
  ) {
    return this.txService.create(condominiumId, userId, dto);
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
  @ApiOperation({ summary: 'Eliminar transação' })
  remove(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
  ) {
    return this.txService.remove(condominiumId, transactionId, userId);
  }
}
