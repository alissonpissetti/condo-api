import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Condominium } from '../condominiums/condominium.entity';
import { Unit } from '../units/unit.entity';
import { SaasPlan } from './entities/saas-plan.entity';
import { SaasVoucher } from './entities/saas-voucher.entity';
import { SaasPlansService } from './saas-plans.service';
import { SaasVoucherService } from './saas-voucher.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SaasPlan, Condominium, Unit, SaasVoucher]),
  ],
  providers: [SaasPlansService, SaasVoucherService],
  exports: [SaasPlansService, SaasVoucherService],
})
export class SaasPlansModule {}
