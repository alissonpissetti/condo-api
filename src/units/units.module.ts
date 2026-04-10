import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CondominiumsModule } from '../condominiums/condominiums.module';
import { Grouping } from '../groupings/grouping.entity';
import { Person } from '../people/person.entity';
import { Unit } from './unit.entity';
import { UnitsController } from './units.controller';
import { UnitsService } from './units.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Unit, Grouping, Person]),
    CondominiumsModule,
  ],
  controllers: [UnitsController],
  providers: [UnitsService],
})
export class UnitsModule {}
