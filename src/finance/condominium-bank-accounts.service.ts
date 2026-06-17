import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CondominiumsService } from '../condominiums/condominiums.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import {
  type BankAccountBalancePreview,
  PreviewBankAccountBalanceQueryDto,
} from './dto/preview-bank-account-balance.query.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';
import {
  formatDateOnlyYmdUtc,
  parseDateOnlyFromApi,
  todayLocalCalendarAsUtcNoon,
  ymdBefore,
} from './date-only.util';
import { CondominiumBankAccount } from './entities/condominium-bank-account.entity';
import { FundBalanceService } from './fund-balance.service';

export type BankAccountView = {
  id: string;
  condominiumId: string;
  name: string;
  bankName: string | null;
  initialBalanceCents: string;
  /** Data de referência do saldo inicial (AAAA-MM-DD). */
  initialBalanceOn: string;
  isActive: boolean;
  /** Saldo inicial + movimentos e taxas quitadas sem receita vinculada (até hoje). */
  currentBalanceCents: string;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class CondominiumBankAccountsService {
  constructor(
    @InjectRepository(CondominiumBankAccount)
    private readonly repo: Repository<CondominiumBankAccount>,
    private readonly condominiumsService: CondominiumsService,
    private readonly fundBalance: FundBalanceService,
  ) {}

  async previewBalance(
    condominiumId: string,
    userId: string,
    query: PreviewBankAccountBalanceQueryDto,
  ): Promise<BankAccountBalancePreview> {
    await this.condominiumsService.findOneForManagement(condominiumId, userId);

    const bankAccountId = query.bankAccountId?.trim() || null;
    if (bankAccountId) {
      await this.findOneInCondominium(condominiumId, bankAccountId);
    }

    const initialBalanceCents = this.parseInitialCents(query.initialBalanceCents);
    const initialBalanceOn = query.initialBalanceOn.trim().slice(0, 10);
    const asOf =
      query.asOf?.trim().slice(0, 10) ||
      formatDateOnlyYmdUtc(todayLocalCalendarAsUtcNoon());

    const { balance, movementsDelta, transactionCount } =
      await this.fundBalance.bankAccountBalanceWithSeed(
        condominiumId,
        bankAccountId,
        asOf,
        {
          initialBalanceCents,
          initialBalanceOnYmd: initialBalanceOn,
        },
      );

    return {
      asOf,
      initialBalanceOn,
      initialBalanceCents: initialBalanceCents.toString(),
      movementsDeltaCents: movementsDelta.toString(),
      projectedBalanceCents: balance.toString(),
      transactionCount,
    };
  }

  async findAll(
    condominiumId: string,
    userId: string,
  ): Promise<BankAccountView[]> {
    await this.condominiumsService.findOneForManagement(condominiumId, userId);
    const rows = await this.repo.find({
      where: { condominiumId },
      order: { name: 'ASC', createdAt: 'ASC' },
    });
    const asOf = formatDateOnlyYmdUtc(todayLocalCalendarAsUtcNoon());
    const views: BankAccountView[] = [];
    for (const r of rows) {
      const current = await this.fundBalance.bankAccountBalanceAsOf(
        condominiumId,
        r.id,
        asOf,
      );
      views.push(this.toView(r, current));
    }
    return views;
  }

  async create(
    condominiumId: string,
    userId: string,
    dto: CreateBankAccountDto,
  ): Promise<BankAccountView> {
    await this.condominiumsService.findOneForManagement(condominiumId, userId);
    const cents = this.parseInitialCents(dto.initialBalanceCents);
    const saved = await this.repo.save(
      this.repo.create({
        condominiumId,
        name: dto.name.trim(),
        bankName: dto.bankName?.trim() || null,
        initialBalanceCents: cents.toString(),
        initialBalanceOn: parseDateOnlyFromApi(dto.initialBalanceOn),
        isActive: true,
      }),
    );
    const current = await this.fundBalance.bankAccountBalanceAsOf(
      condominiumId,
      saved.id,
      formatDateOnlyYmdUtc(todayLocalCalendarAsUtcNoon()),
    );
    return this.toView(saved, current);
  }

  async update(
    condominiumId: string,
    accountId: string,
    userId: string,
    dto: UpdateBankAccountDto,
  ): Promise<BankAccountView> {
    await this.condominiumsService.findOneForManagement(condominiumId, userId);
    const row = await this.findOneInCondo(condominiumId, accountId);
    if (dto.name !== undefined) {
      const n = dto.name.trim();
      if (!n) {
        throw new BadRequestException('Nome da conta é obrigatório.');
      }
      row.name = n;
    }
    if (dto.bankName !== undefined) {
      row.bankName = dto.bankName?.trim() || null;
    }
    if (dto.initialBalanceCents !== undefined) {
      row.initialBalanceCents = this.parseInitialCents(
        dto.initialBalanceCents,
      ).toString();
    }
    if (dto.initialBalanceOn !== undefined) {
      row.initialBalanceOn = parseDateOnlyFromApi(dto.initialBalanceOn);
    }
    if (dto.isActive !== undefined) {
      row.isActive = dto.isActive;
    }
    const saved = await this.repo.save(row);
    const current = await this.fundBalance.bankAccountBalanceAsOf(
      condominiumId,
      saved.id,
      formatDateOnlyYmdUtc(todayLocalCalendarAsUtcNoon()),
    );
    return this.toView(saved, current);
  }

  async remove(
    condominiumId: string,
    accountId: string,
    userId: string,
  ): Promise<void> {
    await this.condominiumsService.findOneForManagement(condominiumId, userId);
    const row = await this.findOneInCondo(condominiumId, accountId);
    await this.repo.remove(row);
  }

  async findOneInCondominium(
    condominiumId: string,
    accountId: string,
  ): Promise<CondominiumBankAccount> {
    const row = await this.repo.findOne({
      where: { id: accountId, condominiumId },
    });
    if (!row) {
      throw new NotFoundException('Conta bancária não encontrada.');
    }
    return row;
  }

  async assertActiveInCondominium(
    condominiumId: string,
    accountId: string,
  ): Promise<CondominiumBankAccount> {
    const row = await this.findOneInCondominium(condominiumId, accountId);
    if (!row.isActive) {
      throw new BadRequestException('Conta bancária inativa.');
    }
    return row;
  }

  /** Primeira conta activa (lançamentos automáticos / legado). */
  async resolvePrimaryAccountId(condominiumId: string): Promise<string> {
    const row = await this.repo.findOne({
      where: { condominiumId, isActive: true },
      order: { createdAt: 'ASC' },
    });
    if (!row) {
      throw new BadRequestException(
        'Cadastre uma conta bancária antes de registrar movimentos.',
      );
    }
    return row.id;
  }

  /**
   * Soma dos saldos iniciais das contas ativas cuja data de referência já vigorava
   * em `inclusiveEndYmd` (extrato / abertura de período).
   */
  async activeInitialBalanceTotalCents(
    condominiumId: string,
    inclusiveEndYmd?: string,
  ): Promise<bigint> {
    const asOf =
      inclusiveEndYmd?.trim().slice(0, 10) ||
      formatDateOnlyYmdUtc(todayLocalCalendarAsUtcNoon());
    const rows = await this.repo.find({
      where: { condominiumId, isActive: true },
      select: { initialBalanceCents: true, initialBalanceOn: true },
    });
    let sum = 0n;
    for (const r of rows) {
      const seedYmd = formatDateOnlyYmdUtc(r.initialBalanceOn);
      if (asOf >= seedYmd) {
        sum += BigInt(String(r.initialBalanceCents));
      }
    }
    return sum;
  }

  /**
   * Soma dos valores de referência (saldo inicial cadastrado) para o detalhe do extrato
   * no início do período — inclui contas cuja data de referência cai dentro do intervalo.
   */
  async referenceSeedTotalForPeriodStart(
    condominiumId: string,
    periodFromYmd: string,
    periodToYmd: string,
  ): Promise<bigint> {
    const fromYmd = periodFromYmd.trim().slice(0, 10);
    const toYmd = periodToYmd.trim().slice(0, 10);
    const openingAsOfYmd = ymdBefore(fromYmd);
    const rows = await this.repo.find({
      where: { condominiumId, isActive: true },
      select: { initialBalanceCents: true, initialBalanceOn: true },
    });
    let sum = 0n;
    for (const r of rows) {
      const seedYmd = formatDateOnlyYmdUtc(r.initialBalanceOn);
      if (seedYmd > toYmd) {
        continue;
      }
      if (openingAsOfYmd >= seedYmd) {
        sum += BigInt(String(r.initialBalanceCents));
      } else if (seedYmd <= toYmd && seedYmd >= fromYmd) {
        sum += BigInt(String(r.initialBalanceCents));
      }
    }
    return sum;
  }

  /** Alguma conta activa tem data de referência dentro do intervalo do extrato. */
  async hasReferenceInsidePeriod(
    condominiumId: string,
    periodFromYmd: string,
    periodToYmd: string,
  ): Promise<boolean> {
    const fromYmd = periodFromYmd.trim().slice(0, 10);
    const toYmd = periodToYmd.trim().slice(0, 10);
    const openingAsOfYmd = ymdBefore(fromYmd);
    const rows = await this.repo.find({
      where: { condominiumId, isActive: true },
      select: { initialBalanceOn: true },
    });
    return rows.some((r) => {
      const seedYmd = formatDateOnlyYmdUtc(r.initialBalanceOn);
      return seedYmd > openingAsOfYmd && seedYmd <= toYmd;
    });
  }

  private async findOneInCondo(
    condominiumId: string,
    accountId: string,
  ): Promise<CondominiumBankAccount> {
    return this.findOneInCondominium(condominiumId, accountId);
  }

  private parseInitialCents(value: number): bigint {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new BadRequestException(
        'Saldo inicial inválido (use centavos inteiros).',
      );
    }
    return BigInt(value);
  }

  private toView(
    r: CondominiumBankAccount,
    currentBalanceCents: bigint = BigInt(String(r.initialBalanceCents)),
  ): BankAccountView {
    return {
      id: r.id,
      condominiumId: r.condominiumId,
      name: r.name,
      bankName: r.bankName,
      initialBalanceCents: String(r.initialBalanceCents),
      initialBalanceOn: formatDateOnlyYmdUtc(r.initialBalanceOn),
      isActive: r.isActive,
      currentBalanceCents: currentBalanceCents.toString(),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
