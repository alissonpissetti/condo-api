import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { MeResponseDto } from './dto/me-response.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { UsersService } from './users.service';

@ApiTags('Utilizador')
@ApiBearerAuth('JWT')
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Dados do utilizador autenticado' })
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
}
