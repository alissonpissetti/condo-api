import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { FinanceStatementService } from './finance-statement.service';

@ApiTags('Financeiro — extrato')
@ApiBearerAuth('JWT')
@Controller('condominiums/:condominiumId/financial-statement')
@UseGuards(JwtAuthGuard)
export class FinanceStatementController {
  constructor(private readonly statementService: FinanceStatementService) {}

  @Get()
  @ApiOperation({
    summary: 'Extrato no período (saldos por unidade + lista de transações)',
  })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  @ApiQuery({ name: 'from', example: '2026-04-01' })
  @ApiQuery({ name: 'to', example: '2026-04-30' })
  @ApiQuery({ name: 'fundId', required: false })
  getStatement(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('fundId') fundId?: string,
  ) {
    return this.statementService.statement(
      condominiumId,
      userId,
      from,
      to,
      fundId,
    );
  }
}
