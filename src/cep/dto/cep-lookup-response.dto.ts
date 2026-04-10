import { ApiProperty } from '@nestjs/swagger';

export class CepLookupResponseDto {
  @ApiProperty({ example: '01310100' })
  zip: string;

  @ApiProperty()
  street: string;

  @ApiProperty({ example: '' })
  number: string;

  @ApiProperty({ example: '' })
  complement: string;

  @ApiProperty()
  neighborhood: string;

  @ApiProperty()
  city: string;

  @ApiProperty({ example: 'SP' })
  state: string;
}
