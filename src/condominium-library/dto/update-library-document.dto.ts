import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateLibraryDocumentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  displayName!: string;
}
