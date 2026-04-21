import { ApiProperty } from '@nestjs/swagger';

export class PublicCommunicationAttachmentDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  originalFilename!: string;

  @ApiProperty()
  sizeBytes!: number;

  /** URL absoluta para descarregar o ficheiro com o mesmo `token` de leitura. */
  @ApiProperty({ nullable: true })
  fileUrl!: string | null;
}

export class PublicCommunicationViewDto {
  @ApiProperty()
  condominiumName!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true })
  bodyHtml!: string | null;

  @ApiProperty({ nullable: true })
  sentAt!: string | null;

  @ApiProperty({ type: [PublicCommunicationAttachmentDto] })
  attachments!: PublicCommunicationAttachmentDto[];
}
