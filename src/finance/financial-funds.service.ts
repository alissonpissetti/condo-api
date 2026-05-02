import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CondominiumsService } from '../condominiums/condominiums.service';
import { isAllocationRule } from './allocation.types';
import { AllocationResolverService } from './allocation-resolver.service';
import { CreateFundDto } from './dto/create-fund.dto';
import { UpdateFundDto } from './dto/update-fund.dto';
import { FinancialFund } from './entities/financial-fund.entity';
import { addMonthsYm } from './fund-month.util';
import { FundBalanceService } from './fund-balance.service';

@Injectable()
export class FinancialFundsService {
  constructor(
    @InjectRepository(FinancialFund)
    private readonly fundRepo: Repository<FinancialFund>,
    private readonly condominiumsService: CondominiumsService,
    private readonly allocationResolver: AllocationResolverService,
    private readonly fundBalance: FundBalanceService,
  ) {}

  async findAll(
    condominiumId: string,
    userId: string,
  ): Promise<
    Array<
      Omit<FinancialFund, 'condominium'> & {
        accumulatedBalanceCents: string;
      }
    >
  > {
    await this.condominiumsService.findOneForManagement(condominiumId, userId);
    const funds = await this.fundRepo.find({
      where: { condominiumId },
      order: { createdAt: 'DESC' },
    });
    const balances =
      await this.fundBalance.totalBalanceCentsByFundId(condominiumId);
    /** Objeto explícito: `{ ...entidade }` pode omitir campos do TypeORM no JSON. */
    return funds.map((f) => ({
      id: f.id,
      condominiumId: f.condominiumId,
      name: f.name,
      isPermanent: f.isPermanent,
      allocationRule: f.allocationRule,
      permanentMonthlyDebitCents: f.permanentMonthlyDebitCents,
      termTotalPerUnitCents: f.termTotalPerUnitCents,
      termInstallmentCount: f.termInstallmentCount,
      termMonthlyPerUnitCents: f.termMonthlyPerUnitCents,
      periodStartYm: f.periodStartYm,
      periodEndYm: f.periodEndYm,
      createdAt: f.createdAt,
      accumulatedBalanceCents: (balances.get(f.id) ?? 0n).toString(),
    }));
  }

  async create(
    condominiumId: string,
    userId: string,
    dto: CreateFundDto,
  ): Promise<FinancialFund> {
    await this.condominiumsService.findOneForManagement(condominiumId, userId);
    const isPermanent = dto.isPermanent === true;
    const payload = await this.buildFundPayload(condominiumId, {
      isPermanent,
      allocationRule: dto.allocationRule,
      permanentMonthlyDebitCents: dto.permanentMonthlyDebitCents ?? null,
      termTotalPerUnitCents: dto.termTotalPerUnitCents ?? null,
      termInstallmentCount: dto.termInstallmentCount ?? null,
      termFirstMonthYm: dto.termFirstMonthYm?.trim() ?? null,
    });
    const fund = this.fundRepo.create({
      condominiumId,
      name: dto.name,
      ...payload,
    });
    return this.fundRepo.save(fund);
  }

  async findOne(
    condominiumId: string,
    fundId: string,
    userId: string,
  ): Promise<FinancialFund> {
    await this.condominiumsService.findOneForManagement(condominiumId, userId);
    return this.findOneInCondominium(condominiumId, fundId);
  }

  /** Sem verificação de dono — apenas uso interno ao módulo financeiro. */
  async findOneInCondominium(
    condominiumId: string,
    fundId: string,
  ): Promise<FinancialFund> {
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
    if (dto.name !== undefined) {
      fund.name = dto.name;
    }

    const touchedFinancial =
      dto.isPermanent !== undefined ||
      dto.allocationRule !== undefined ||
      dto.permanentMonthlyDebitCents !== undefined ||
      dto.termTotalPerUnitCents !== undefined ||
      dto.termInstallmentCount !== undefined ||
      dto.termFirstMonthYm !== undefined;

    if (touchedFinancial) {
      const isPermanent = dto.isPermanent ?? fund.isPermanent;
      const allocationRule =
        dto.allocationRule ?? fund.allocationRule ?? undefined;
      if (!allocationRule) {
        throw new BadRequestException('Regra de rateio em falta.');
      }
      const permCents =
        dto.permanentMonthlyDebitCents ??
        (fund.permanentMonthlyDebitCents != null
          ? Number(fund.permanentMonthlyDebitCents)
          : null);
      const termTotal =
        dto.termTotalPerUnitCents ??
        (fund.termTotalPerUnitCents != null
          ? Number(fund.termTotalPerUnitCents)
          : null);
      const termCount =
        dto.termInstallmentCount ?? fund.termInstallmentCount ?? null;
      const termStart =
        dto.termFirstMonthYm?.trim() ?? fund.periodStartYm ?? null;

      const payload = await this.buildFundPayload(condominiumId, {
        isPermanent,
        allocationRule,
        permanentMonthlyDebitCents: permCents,
        termTotalPerUnitCents: termTotal,
        termInstallmentCount: termCount,
        termFirstMonthYm: termStart,
      });
      Object.assign(fund, payload);
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

  private async buildFundPayload(
    condominiumId: string,
    input: {
      isPermanent: boolean;
      allocationRule: unknown;
      permanentMonthlyDebitCents: number | null;
      termTotalPerUnitCents: number | null;
      termInstallmentCount: number | null;
      termFirstMonthYm: string | null;
    },
  ): Promise<
    Pick<
      FinancialFund,
      | 'isPermanent'
      | 'allocationRule'
      | 'permanentMonthlyDebitCents'
      | 'termTotalPerUnitCents'
      | 'termInstallmentCount'
      | 'termMonthlyPerUnitCents'
      | 'periodStartYm'
      | 'periodEndYm'
    >
  > {
    if (!isAllocationRule(input.allocationRule)) {
      throw new BadRequestException('Regra de rateio inválida.');
    }
    if (input.allocationRule.kind === 'none') {
      throw new BadRequestException(
        'Fundo deve ter rateio entre unidades (não use «sem repartição»).',
      );
    }
    const unitIds = await this.allocationResolver.resolveUnitIds(
      condominiumId,
      input.allocationRule,
    );
    if (unitIds.length === 0) {
      throw new BadRequestException(
        'O rateio selecionado não inclui nenhuma unidade.',
      );
    }

    if (input.isPermanent) {
      const cents = input.permanentMonthlyDebitCents;
      if (cents == null || !Number.isFinite(cents) || cents < 1) {
        throw new BadRequestException(
          'Indique o débito mensal em centavos (valor inteiro ≥ 1).',
        );
      }
      return {
        isPermanent: true,
        allocationRule: input.allocationRule,
        permanentMonthlyDebitCents: String(Math.trunc(cents)),
        termTotalPerUnitCents: null,
        termInstallmentCount: null,
        termMonthlyPerUnitCents: null,
        periodStartYm: null,
        periodEndYm: null,
      };
    }

    const total = input.termTotalPerUnitCents;
    const n = input.termInstallmentCount;
    const start = input.termFirstMonthYm;
    if (total == null || !Number.isFinite(total) || total < 1) {
      throw new BadRequestException(
        'Indique o total por unidade a arrecadar (centavos, ≥ 1).',
      );
    }
    if (n == null || !Number.isFinite(n) || n < 1) {
      throw new BadRequestException(
        'Indique em quantas mensalidades parcelar (≥ 1).',
      );
    }
    if (!start) {
      throw new BadRequestException(
        'Indique o mês/ano da primeira mensalidade (AAAA-MM).',
      );
    }
    const monthly = Math.floor(total / n);
    if (monthly < 1) {
      throw new BadRequestException(
        'O valor total por unidade é baixo demais para o número de parcelas.',
      );
    }
    const endYm = addMonthsYm(start, n - 1);
    return {
      isPermanent: false,
      allocationRule: input.allocationRule,
      permanentMonthlyDebitCents: null,
      termTotalPerUnitCents: String(Math.trunc(total)),
      termInstallmentCount: Math.trunc(n),
      termMonthlyPerUnitCents: String(monthly),
      periodStartYm: start,
      periodEndYm: endYm,
    };
  }
}
