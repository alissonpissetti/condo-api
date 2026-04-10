import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  AuthLoginResponseDto,
  AuthRegisterResponseDto,
  SmsLoginRequestAcceptedDto,
} from './dto/auth-responses.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SmsLoginRequestDto } from './dto/sms-login-request.dto';
import { SmsLoginVerifyDto } from './dto/sms-login-verify.dto';

@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Registar novo utilizador' })
  @ApiCreatedResponse({
    description: 'Conta criada (sem JWT; use login para obter token)',
    type: AuthRegisterResponseDto,
  })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Iniciar sessão (JWT)' })
  @ApiOkResponse({
    description: 'Token JWT',
    type: AuthLoginResponseDto,
  })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('sms/request')
  @ApiOperation({
    summary: 'Pedir código de login por SMS (celular registado)',
    description:
      'Envia um código de 6 dígitos por SMS via Comtele. A resposta é sempre genérica (não indica se o número existe). Requer COMTELE_AUTH_KEY em produção.',
  })
  @ApiOkResponse({
    description: 'Pedido aceite (SMS enviado se o número existir e SMS estiver ativo)',
    type: SmsLoginRequestAcceptedDto,
  })
  requestSms(@Body() dto: SmsLoginRequestDto) {
    return this.authService.requestSmsLogin(dto);
  }

  @Post('sms/verify')
  @ApiOperation({
    summary: 'Confirmar código SMS e obter JWT',
    description: 'Igual ao login por email/senha: devolve access_token.',
  })
  @ApiOkResponse({
    description: 'Token JWT',
    type: AuthLoginResponseDto,
  })
  verifySms(@Body() dto: SmsLoginVerifyDto) {
    return this.authService.verifySmsLogin(dto);
  }
}
