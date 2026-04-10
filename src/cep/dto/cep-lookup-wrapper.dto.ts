import { ApiProperty } from '@nestjs/swagger';
import { CepLookupResponseDto } from './cep-lookup-response.dto';

export class CepLookupWrapperDto {
  @ApiProperty({ type: CepLookupResponseDto })
  data: CepLookupResponseDto;
}
