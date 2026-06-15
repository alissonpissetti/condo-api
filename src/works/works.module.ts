import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CondominiumsModule } from '../condominiums/condominiums.module';
import { PlanningModule } from '../planning/planning.module';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { ConstructionWorksController } from './construction-works.controller';
import { ConstructionWorksService } from './construction-works.service';
import { ConstructionProjectUpdate } from './entities/construction-project-update.entity';
import { ConstructionProject } from './entities/construction-project.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ConstructionProject,
      ConstructionProjectUpdate,
      Supplier,
    ]),
    CondominiumsModule,
    PlanningModule,
  ],
  controllers: [ConstructionWorksController],
  providers: [ConstructionWorksService],
  exports: [ConstructionWorksService],
})
export class WorksModule {}
