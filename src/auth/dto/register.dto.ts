import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'owner@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password12', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  /** Celular BR com DDD (obrigatório; usado para login por SMS). */
  @ApiProperty({ example: '61999998888' })
  @IsString()
  @MinLength(10)
  @MaxLength(32)
  phone: string;
}
