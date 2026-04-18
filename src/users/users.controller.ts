import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Patch,
  Put,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { MeResponseDto } from './dto/me-response.dto';
import { PutMySignatureDto } from './dto/put-my-signature.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { UsersService } from './users.service';

@ApiTags('Usuário')
@ApiBearerAuth('JWT')
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me/signature')
  @ApiOperation({
    summary: 'Descarregar PNG da assinatura gravada',
    description: '404 se ainda não existir assinatura.',
  })
  async getMySignaturePng(
    @CurrentUser() userId: string,
  ): Promise<StreamableFile> {
    const buf = await this.usersService.getUserSignatureBuffer(userId);
    if (!buf?.length) {
      throw new NotFoundException('Sem assinatura gravada.');
    }
    return new StreamableFile(buf, {
      type: 'image/png',
    });
  }

  @Get('me')
  @ApiOperation({ summary: 'Dados do usuário autenticado' })
  @ApiOkResponse({ type: MeResponseDto })
  getMe(@CurrentUser() userId: string): Promise<MeResponseDto> {
    return this.usersService.getMe(userId);
  }

  @Patch('me')
  @ApiOperation({
    summary: 'Atualizar conta e ficha de pessoa',
    description:
      'Email e telefone são obrigatórios (telefone normalizado para SMS). Opcional: senha, nome, CPF e endereço da ficha `people` associada à conta.',
  })
  @ApiOkResponse({ type: MeResponseDto })
  updateMe(
    @CurrentUser() userId: string,
    @Body() dto: UpdateMeDto,
  ): Promise<MeResponseDto> {
    return this.usersService.updateProfile(userId, dto);
  }

  @Put('me/signature')
  @ApiOperation({
    summary: 'Gravar assinatura digital (PNG)',
    description:
      'Substitui a assinatura anterior. Use um desenho claro com fundo branco (ex.: canvas no cliente).',
  })
  @ApiOkResponse({ type: MeResponseDto })
  putMySignature(
    @CurrentUser() userId: string,
    @Body() dto: PutMySignatureDto,
  ): Promise<MeResponseDto> {
    return this.usersService.putMySignature(userId, dto.pngBase64);
  }

  @Delete('me/signature')
  @ApiOperation({ summary: 'Remover assinatura digital gravada' })
  @ApiOkResponse({ type: MeResponseDto })
  deleteMySignature(@CurrentUser() userId: string): Promise<MeResponseDto> {
    return this.usersService.clearMySignature(userId);
  }
}
