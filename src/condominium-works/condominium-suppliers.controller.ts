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
import { CondominiumSuppliersService } from './condominium-suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@ApiTags('Obras — fornecedores')
@ApiBearerAuth('JWT')
@Controller('condominiums/:condominiumId/suppliers')
@UseGuards(JwtAuthGuard)
export class CondominiumSuppliersController {
  constructor(private readonly service: CondominiumSuppliersService) {}

  @Get()
  @ApiOperation({ summary: 'Listar fornecedores do condomínio' })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  findAll(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
  ) {
    return this.service.findAll(condominiumId, userId);
  }

  @Post()
  @ApiOperation({ summary: 'Cadastrar fornecedor' })
  create(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Body() dto: CreateSupplierDto,
  ) {
    return this.service.create(condominiumId, userId, dto);
  }

  @Patch(':supplierId')
  @ApiOperation({ summary: 'Atualizar fornecedor' })
  update(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.service.update(condominiumId, supplierId, userId, dto);
  }

  @Delete(':supplierId')
  @ApiOperation({ summary: 'Excluir fornecedor' })
  remove(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
  ) {
    return this.service.remove(condominiumId, supplierId, userId);
  }
}
