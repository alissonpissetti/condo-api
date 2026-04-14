import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlanningModule } from '../planning/planning.module';
import { Grouping } from './grouping.entity';
import { GroupingsController } from './groupings.controller';
import { GroupingsService } from './groupings.service';

@Module({
  imports: [TypeOrmModule.forFeature([Grouping]), PlanningModule],
  controllers: [GroupingsController],
  providers: [GroupingsService],
})
export class GroupingsModule {}
