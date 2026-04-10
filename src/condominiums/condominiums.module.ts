import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Grouping } from '../groupings/grouping.entity';
import { Condominium } from './condominium.entity';
import { CondominiumsController } from './condominiums.controller';
import { CondominiumsService } from './condominiums.service';

@Module({
  imports: [TypeOrmModule.forFeature([Condominium, Grouping])],
  controllers: [CondominiumsController],
  providers: [CondominiumsService],
  exports: [CondominiumsService],
})
export class CondominiumsModule {}
