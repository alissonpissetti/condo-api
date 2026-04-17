import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { CreateFundDto } from './dto/create-fund.dto';
import { UpdateFundDto } from './dto/update-fund.dto';
import { FinancialFundsService } from './financial-funds.service';

@ApiTags('Financeiro — fundos')
@ApiBearerAuth('JWT')
@Controller('condominiums/:condominiumId/funds')
@UseGuards(JwtAuthGuard)
export class FinancialFundsController {
  constructor(private readonly fundsService: FinancialFundsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar fundos do condomínio' })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  findAll(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
  ) {
    return this.fundsService.findAll(condominiumId, userId);
  }

  @Post()
  @ApiOperation({ summary: 'Criar fundo' })
  create(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Body() dto: CreateFundDto,
  ) {
    return this.fundsService.create(condominiumId, userId, dto);
  }

  @Get(':fundId')
  @ApiOperation({ summary: 'Obter fundo' })
  findOne(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('fundId', ParseUUIDPipe) fundId: string,
  ) {
    return this.fundsService.findOne(condominiumId, fundId, userId);
  }

  @Patch(':fundId')
  @ApiOperation({ summary: 'Atualizar fundo' })
  update(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('fundId', ParseUUIDPipe) fundId: string,
    @Body() dto: UpdateFundDto,
  ) {
    return this.fundsService.update(condominiumId, fundId, userId, dto);
  }

  @Delete(':fundId')
  @ApiOperation({ summary: 'Excluir fundo' })
  remove(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('fundId', ParseUUIDPipe) fundId: string,
  ) {
    return this.fundsService.remove(condominiumId, fundId, userId);
  }
}
