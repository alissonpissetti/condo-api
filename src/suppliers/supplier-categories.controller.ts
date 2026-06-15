import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { CreateSupplierCategoryDto } from './dto/create-supplier-category.dto';
import { SupplierCategoriesService } from './supplier-categories.service';

@ApiTags('Fornecedores — categorias')
@ApiBearerAuth('JWT')
@Controller('condominiums/:condominiumId/supplier-categories')
@UseGuards(JwtAuthGuard)
export class SupplierCategoriesController {
  constructor(private readonly categoriesService: SupplierCategoriesService) {}

  @Get()
  @ApiOperation({
    summary:
      'Listar categorias (globais da plataforma + categorias criadas pelo usuário)',
  })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  list(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
  ) {
    return this.categoriesService.listForCondominium(condominiumId, userId);
  }

  @Post()
  @ApiOperation({ summary: 'Criar categoria personalizada (visível nos seus condomínios)' })
  create(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Body() dto: CreateSupplierCategoryDto,
  ) {
    return this.categoriesService.createForCondominium(
      condominiumId,
      userId,
      dto,
    );
  }
}
