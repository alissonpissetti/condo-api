import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CondominiumsService } from '../condominiums/condominiums.service';
import { CreateFundDto } from './dto/create-fund.dto';
import { UpdateFundDto } from './dto/update-fund.dto';
import { FinancialFund } from './entities/financial-fund.entity';

@Injectable()
export class FinancialFundsService {
  constructor(
    @InjectRepository(FinancialFund)
    private readonly fundRepo: Repository<FinancialFund>,
    private readonly condominiumsService: CondominiumsService,
  ) {}

  async findAll(
    condominiumId: string,
    userId: string,
  ): Promise<FinancialFund[]> {
    await this.condominiumsService.assertOwner(condominiumId, userId);
    return this.fundRepo.find({
      where: { condominiumId },
      order: { createdAt: 'DESC' },
    });
  }

  async create(
    condominiumId: string,
    userId: string,
    dto: CreateFundDto,
  ): Promise<FinancialFund> {
    await this.condominiumsService.assertOwner(condominiumId, userId);
    const fund = this.fundRepo.create({
      condominiumId,
      name: dto.name,
      isTemporary: dto.isTemporary ?? false,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
    });
    return this.fundRepo.save(fund);
  }

  async findOne(
    condominiumId: string,
    fundId: string,
    userId: string,
  ): Promise<FinancialFund> {
    await this.condominiumsService.assertOwner(condominiumId, userId);
    const f = await this.fundRepo.findOne({
      where: { id: fundId, condominiumId },
    });
    if (!f) {
      throw new NotFoundException('Fund not found');
    }
    return f;
  }

  async update(
    condominiumId: string,
    fundId: string,
    userId: string,
    dto: UpdateFundDto,
  ): Promise<FinancialFund> {
    const fund = await this.findOne(condominiumId, fundId, userId);
    if (dto.name !== undefined) fund.name = dto.name;
    if (dto.isTemporary !== undefined) fund.isTemporary = dto.isTemporary;
    if (dto.endsAt !== undefined) {
      fund.endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    }
    return this.fundRepo.save(fund);
  }

  async remove(
    condominiumId: string,
    fundId: string,
    userId: string,
  ): Promise<void> {
    await this.findOne(condominiumId, fundId, userId);
    await this.fundRepo.delete(fundId);
  }
}
