import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Condominium } from '../condominiums/condominium.entity';
import { User } from '../users/user.entity';
import { Unit } from '../units/unit.entity';
import { CondominiumSaasPlanPeriod } from './entities/condominium-saas-plan-period.entity';
import { SaasPlanChangeRequest } from './entities/saas-plan-change-request.entity';
import { SaasPlan } from './entities/saas-plan.entity';
import { SaasVoucher } from './entities/saas-voucher.entity';
import { SaasPlansService } from './saas-plans.service';
import { SaasVoucherService } from './saas-voucher.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SaasPlan,
      Condominium,
      Unit,
      SaasVoucher,
      User,
      CondominiumSaasPlanPeriod,
      SaasPlanChangeRequest,
    ]),
  ],
  providers: [SaasPlansService, SaasVoucherService],
  exports: [SaasPlansService, SaasVoucherService],
})
export class SaasPlansModule {}
