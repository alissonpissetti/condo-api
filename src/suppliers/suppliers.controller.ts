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
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SuppliersService } from './suppliers.service';

@ApiTags('Fornecedores')
@ApiBearerAuth('JWT')
@Controller('condominiums/:condominiumId/suppliers')
@UseGuards(JwtAuthGuard)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  @ApiOperation({ summary: 'Listar fornecedores do condomínio' })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  findAll(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.suppliersService.findAll(condominiumId, userId, categoryId);
  }

  @Post()
  @ApiOperation({ summary: 'Cadastrar fornecedor' })
  create(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Body() dto: CreateSupplierDto,
  ) {
    return this.suppliersService.create(condominiumId, userId, dto);
  }

  @Get(':supplierId')
  @ApiOperation({ summary: 'Obter fornecedor' })
  findOne(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
  ) {
    return this.suppliersService.findOne(condominiumId, supplierId, userId);
  }

  @Patch(':supplierId')
  @ApiOperation({ summary: 'Atualizar fornecedor' })
  update(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.suppliersService.update(condominiumId, supplierId, userId, dto);
  }

  @Delete(':supplierId')
  @ApiOperation({ summary: 'Excluir fornecedor' })
  remove(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
  ) {
    return this.suppliersService.remove(condominiumId, supplierId, userId);
  }
}
