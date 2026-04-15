import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Grouping } from '../groupings/grouping.entity';
import { SaasPlansModule } from '../platform/saas-plans.module';
import { CondominiumParticipant } from '../planning/entities/condominium-participant.entity';
import { Condominium } from './condominium.entity';
import { CondominiumsController } from './condominiums.controller';
import { CondominiumsService } from './condominiums.service';
import { SaasPlanCatalogController } from './saas-plan-catalog.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Condominium, Grouping, CondominiumParticipant]),
    SaasPlansModule,
  ],
  controllers: [CondominiumsController, SaasPlanCatalogController],
  providers: [CondominiumsService],
  exports: [CondominiumsService],
})
export class CondominiumsModule {}
