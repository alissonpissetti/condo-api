import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { PatchCondominiumVoucherDto } from '../platform/dto/patch-condominium-voucher.dto';
import { SaasPlansService } from '../platform/saas-plans.service';
import { SaasVoucherService } from '../platform/saas-voucher.service';
import { CreateCondominiumDto } from './dto/create-condominium.dto';
import { UpdateCondominiumDto } from './dto/update-condominium.dto';
import { CondominiumsService } from './condominiums.service';

@ApiTags('Condomínios')
@ApiBearerAuth('JWT')
@Controller('condominiums')
@UseGuards(JwtAuthGuard)
export class CondominiumsController {
  constructor(
    private readonly condominiumsService: CondominiumsService,
    private readonly saasPlans: SaasPlansService,
    private readonly saasVouchers: SaasVoucherService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Criar condomínio',
    description:
      'Cria o condomínio e um agrupamento padrão "Geral" em transação.',
  })
  create(@CurrentUser() userId: string, @Body() dto: CreateCondominiumDto) {
    return this.condominiumsService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar condomínios do usuário autenticado' })
  findAll(@CurrentUser() userId: string) {
    return this.condominiumsService.findAllForOwner(userId);
  }

  @Get(':id/saas-billing-preview')
  @ApiOperation({
    summary:
      'Pré-visualizar mensalidade SaaS (titular): plano, unidades, voucher no mês',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'ID do condomínio' })
  async saasBillingPreview(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('referenceMonth') referenceMonth?: string,
  ) {
    await this.condominiumsService.findOneForOwner(id, userId);
    return this.saasPlans.computeCondominiumPlanPricing(id, referenceMonth);
  }

  @Get(':id/voucher')
  @ApiOperation({ summary: 'Voucher SaaS associado ao condomínio (titular)' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'ID do condomínio' })
  async getSaasVoucher(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.condominiumsService.findOneForOwner(id, userId);
    return this.saasVouchers.getCondominiumVoucherAssignment(id);
  }

  @Patch(':id/voucher')
  @ApiOperation({
    summary:
      'Associar voucher pelo código ou remover (titular). Envie { "code": null } para limpar.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'ID do condomínio' })
  async patchSaasVoucher(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PatchCondominiumVoucherDto,
  ) {
    await this.condominiumsService.findOneForOwner(id, userId);
    const had = Object.prototype.hasOwnProperty.call(body, 'code');
    return this.saasVouchers.patchCondominiumVoucherCode(id, body.code, had);
  }

  @Post(':id/management-logo')
  @ApiOperation({
    summary: 'Enviar logo da gestão (PNG/JPG/WebP) para PDFs de transparência',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }),
  )
  uploadManagementLogo(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Envie uma imagem.');
    }
    return this.condominiumsService.uploadManagementLogo(
      id,
      userId,
      file.buffer,
      file.mimetype,
    );
  }

  @Delete(':id/management-logo')
  @ApiOperation({ summary: 'Remover logo da gestão' })
  @ApiParam({ name: 'id', format: 'uuid' })
  deleteManagementLogo(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.condominiumsService.deleteManagementLogo(id, userId);
  }

  @Get(':id/management-logo')
  @ApiOperation({
    summary: 'Descarregar logo da gestão (pré-visualização autenticada)',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  async getManagementLogoFile(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: false }) res: Response,
  ) {
    const { buffer, contentType } =
      await this.condominiumsService.readManagementLogoForOwner(id, userId);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(buffer);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obter um condomínio (titular, gestão ou morador com unidade)',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'ID do condomínio' })
  findOne(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.condominiumsService.findOneAccessible(id, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar condomínio' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'ID do condomínio' })
  update(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCondominiumDto,
  ) {
    return this.condominiumsService.update(id, userId, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Excluir condomínio (e agrupamentos/unidades)',
    description:
      'Só o titular que criou o condomínio (campo owner) pode executar esta ação. Demais usuários recebem 403.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'ID do condomínio' })
  remove(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.condominiumsService.remove(id, userId);
  }
}
