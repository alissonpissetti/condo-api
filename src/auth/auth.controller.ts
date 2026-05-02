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
  PasswordResetRequestAcceptedDto,
  PasswordResetVerifyResponseDto,
  SmsLoginRequestAcceptedDto,
} from './dto/auth-responses.dto';
import { LoginDto } from './dto/login.dto';
import { PasswordResetCompleteDto } from './dto/password-reset-complete.dto';
import { PasswordResetRequestDto } from './dto/password-reset-request.dto';
import { PasswordResetVerifyDto } from './dto/password-reset-verify.dto';
import { RegisterDto } from './dto/register.dto';
import { SmsLoginRequestDto } from './dto/sms-login-request.dto';
import { SmsLoginVerifyDto } from './dto/sms-login-verify.dto';

@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Cadastrar novo usuário' })
  @ApiCreatedResponse({
    description: 'Conta criada (sem JWT; use login para obter token)',
    type: AuthRegisterResponseDto,
  })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Entrar (JWT)' })
  @ApiOkResponse({
    description: 'Token JWT',
    type: AuthLoginResponseDto,
  })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('sms/request')
  @ApiOperation({
    summary: 'Pedir código de login por celular (WhatsApp ou SMS)',
    description:
      'Envia um código de 6 dígitos: por WhatsApp (Twilio) quando `TWILIO_WHATSAPP_CONTENT_SID_LOGIN` está definido; caso contrário por SMS (Comtele) se `COMTELE_AUTH_KEY` estiver definido. A resposta é genérica (não indica se o número existe).',
  })
  @ApiOkResponse({
    description:
      'Pedido aceite (código enviado se o número existir e o canal estiver configurado)',
    type: SmsLoginRequestAcceptedDto,
  })
  requestSms(@Body() dto: SmsLoginRequestDto) {
    return this.authService.requestSmsLogin(dto);
  }

  @Post('sms/verify')
  @ApiOperation({
    summary: 'Confirmar código de login (WhatsApp/SMS) e obter JWT',
    description: 'Igual ao login por email/senha: devolve access_token.',
  })
  @ApiOkResponse({
    description: 'Token JWT',
    type: AuthLoginResponseDto,
  })
  verifySms(@Body() dto: SmsLoginVerifyDto) {
    return this.authService.verifySmsLogin(dto);
  }

  @Post('password-reset/request')
  @ApiOperation({
    summary: 'Pedir código para redefinir senha (e-mail, WhatsApp ou SMS)',
    description:
      'Envia código de 6 dígitos. Canais: `email`, `whatsapp` (só Twilio + template TWILIO_WHATSAPP_CONTENT_SID_PASSWORD_RESET) ou `sms` (Twilio com template ou SMS Comtele). Resposta genérica.',
  })
  @ApiOkResponse({ type: PasswordResetRequestAcceptedDto })
  requestPasswordReset(@Body() dto: PasswordResetRequestDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Post('password-reset/verify')
  @ApiOperation({
    summary: 'Confirmar código e obter token de redefinição',
    description:
      'Devolve reset_token (JWT curto) para usar em POST /auth/password-reset/complete.',
  })
  @ApiOkResponse({ type: PasswordResetVerifyResponseDto })
  verifyPasswordReset(@Body() dto: PasswordResetVerifyDto) {
    return this.authService.verifyPasswordResetCode(dto);
  }

  @Post('password-reset/complete')
  @ApiOperation({
    summary: 'Definir nova senha após verificação do código',
  })
  @ApiOkResponse({
    description: 'Senha atualizada; entre com e-mail e nova senha.',
    schema: { properties: { ok: { type: 'boolean', example: true } } },
  })
  completePasswordReset(@Body() dto: PasswordResetCompleteDto) {
    return this.authService.completePasswordReset(dto);
  }
}
