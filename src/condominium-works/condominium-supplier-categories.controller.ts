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
import { CondominiumSupplierCategoriesService } from './condominium-supplier-categories.service';
import { CreateSupplierCategoryDto } from './dto/create-supplier-category.dto';
import { UpdateSupplierCategoryDto } from './dto/update-supplier-category.dto';

@ApiTags('Obras — categorias de fornecedor')
@ApiBearerAuth('JWT')
@Controller('condominiums/:condominiumId/supplier-categories')
@UseGuards(JwtAuthGuard)
export class CondominiumSupplierCategoriesController {
  constructor(private readonly service: CondominiumSupplierCategoriesService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar categorias padrão e do condomínio',
  })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  findAll(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
  ) {
    return this.service.findAll(condominiumId, userId);
  }

  @Post()
  @ApiOperation({ summary: 'Cadastrar categoria do condomínio' })
  create(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Body() dto: CreateSupplierCategoryDto,
  ) {
    return this.service.create(condominiumId, userId, dto);
  }

  @Patch(':categoryId')
  @ApiOperation({ summary: 'Atualizar categoria do condomínio' })
  update(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Body() dto: UpdateSupplierCategoryDto,
  ) {
    return this.service.update(condominiumId, categoryId, userId, dto);
  }

  @Delete(':categoryId')
  @ApiOperation({ summary: 'Excluir categoria do condomínio' })
  remove(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
  ) {
    return this.service.remove(condominiumId, categoryId, userId);
  }
}
