import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CondominiumsModule } from '../condominiums/condominiums.module';
import { SupplierCategory } from './entities/supplier-category.entity';
import { Supplier } from './entities/supplier.entity';
import { SupplierCategoriesController } from './supplier-categories.controller';
import { SupplierCategoriesService } from './supplier-categories.service';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SupplierCategory, Supplier]),
    CondominiumsModule,
  ],
  controllers: [SupplierCategoriesController, SuppliersController],
  providers: [SupplierCategoriesService, SuppliersService],
  exports: [SupplierCategoriesService, SuppliersService],
})
export class SuppliersModule {}
