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
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { CondominiumBankAccountsService } from './condominium-bank-accounts.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { PreviewBankAccountBalanceQueryDto } from './dto/preview-bank-account-balance.query.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';

@ApiTags('Financeiro — contas bancárias')
@ApiBearerAuth('JWT')
@Controller('condominiums/:condominiumId/bank-accounts')
@UseGuards(JwtAuthGuard)
export class CondominiumBankAccountsController {
  constructor(private readonly service: CondominiumBankAccountsService) {}

  @Get('preview-balance')
  @ApiOperation({
    summary:
      'Prévia do saldo (saldo inicial + movimentos após a data de referência)',
  })
  previewBalanceGet(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Query() query: PreviewBankAccountBalanceQueryDto,
  ) {
    return this.service.previewBalance(condominiumId, userId, query);
  }

  @Post('balance-preview')
  @ApiOperation({
    summary:
      'Prévia do saldo (corpo JSON; usado pelo painel web ao cadastrar conta)',
  })
  previewBalancePost(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Body() body: PreviewBankAccountBalanceQueryDto,
  ) {
    return this.service.previewBalance(condominiumId, userId, body);
  }

  @Get()
  @ApiOperation({ summary: 'Listar contas bancárias do condomínio' })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  findAll(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
  ) {
    return this.service.findAll(condominiumId, userId);
  }

  @Post()
  @ApiOperation({ summary: 'Cadastrar conta bancária com saldo inicial' })
  create(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Body() dto: CreateBankAccountDto,
  ) {
    return this.service.create(condominiumId, userId, dto);
  }

  @Patch(':accountId')
  @ApiOperation({ summary: 'Atualizar conta bancária' })
  update(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Body() dto: UpdateBankAccountDto,
  ) {
    return this.service.update(condominiumId, accountId, userId, dto);
  }

  @Delete(':accountId')
  @ApiOperation({ summary: 'Excluir conta bancária' })
  remove(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('accountId', ParseUUIDPipe) accountId: string,
  ) {
    return this.service.remove(condominiumId, accountId, userId);
  }
}
