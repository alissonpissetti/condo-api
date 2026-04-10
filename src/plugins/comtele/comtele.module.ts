import { Module } from '@nestjs/common';
import { ComteleService } from './comtele.service';

@Module({
  providers: [ComteleService],
  exports: [ComteleService],
})
export class ComteleModule {}
