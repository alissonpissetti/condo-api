import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class ReorderWorksQueueDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description:
      'IDs das obras planejadas e em andamento, na ordem desejada de execução (primeiro = prioridade).',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  workIds!: string[];
}
