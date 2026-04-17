import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlanningModule } from '../planning/planning.module';
import { Grouping } from '../groupings/grouping.entity';
import { Person } from '../people/person.entity';
import { Unit } from './unit.entity';
import { UnitResponsiblePerson } from './unit-responsible-person.entity';
import { UnitsController } from './units.controller';
import { UnitsService } from './units.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Unit, UnitResponsiblePerson, Grouping, Person]),
    PlanningModule,
  ],
  controllers: [UnitsController],
  providers: [UnitsService],
})
export class UnitsModule {}
