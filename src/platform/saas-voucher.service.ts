import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { Condominium } from '../condominiums/condominium.entity';
import type { CreateSaasVoucherDto } from './dto/create-saas-voucher.dto';
import type { PatchSaasVoucherDto } from './dto/patch-saas-voucher.dto';
import { SaasVoucher } from './entities/saas-voucher.entity';

/** Limites do mês de referência YYYY-MM (intervalo inclusivo em UTC). */
export function referenceMonthToDateBounds(referenceMonth: string): {
  refStart: string;
  refEnd: string;
} {
  const m = /^(\d{4})-(\d{2})$/.exec(referenceMonth.trim());
  if (!m) {
    throw new BadRequestException('referenceMonth inválido (use YYYY-MM).');
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) {
    throw new BadRequestException('referenceMonth inválido.');
  }
  const refStart = `${y.toString().padStart(4, '0')}-${mo.toString().padStart(2, '0')}-01`;
  const last = new Date(Date.UTC(y, mo, 0));
  const refEnd = last.toISOString().slice(0, 10);
  return { refStart, refEnd };
}

export function normalizeVoucherCode(raw: string): string {
  return raw.trim().toUpperCase();
}

@Injectable()
export class SaasVoucherService {
  constructor(
    @InjectRepository(SaasVoucher)
    private readonly voucherRepo: Repository<SaasVoucher>,
    @InjectRepository(Condominium)
    private readonly condoRepo: Repository<Condominium>,
  ) {}

  /**
   * Um voucher por condomínio (campo opcional). Só aplica se ativo e o mês
   * intersecta validFrom–validTo.
   */
  async getApplicableDiscountForCondominium(
    condominiumId: string,
    referenceMonth: string,
  ): Promise<{
    discountPercent: number;
    appliedVoucherIds: string[];
    appliedLabels: string[];
  }> {
    const { refStart, refEnd } = referenceMonthToDateBounds(referenceMonth);
    const condo = await this.condoRepo.findOne({
      where: { id: condominiumId },
      relations: { saasVoucher: true },
    });
    const v = condo?.saasVoucher;
    if (!v?.active) {
      return { discountPercent: 0, appliedVoucherIds: [], appliedLabels: [] };
    }
    const from = String(v.validFrom).slice(0, 10);
    const to = String(v.validTo).slice(0, 10);
    if (!(from <= refEnd && to >= refStart)) {
      return { discountPercent: 0, appliedVoucherIds: [], appliedLabels: [] };
    }
    const pct = Math.min(100, Math.max(0, v.discountPercent));
    return {
      discountPercent: pct,
      appliedVoucherIds: [v.id],
      appliedLabels: [v.name.trim() || v.code],
    };
  }

  async listVouchersForPlatform(): Promise<
    Array<{
      id: string;
      name: string;
      code: string;
      discountPercent: number;
      validFrom: string;
      validTo: string;
      notes: string | null;
      active: boolean;
      createdAt: Date;
      updatedAt: Date;
    }>
  > {
    const rows = await this.voucherRepo.find({
      order: { createdAt: 'DESC' },
    });
    return rows.map((v) => ({
      id: v.id,
      name: v.name,
      code: v.code,
      discountPercent: v.discountPercent,
      validFrom: String(v.validFrom).slice(0, 10),
      validTo: String(v.validTo).slice(0, 10),
      notes: v.notes,
      active: v.active,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
    }));
  }

  async createVoucher(dto: CreateSaasVoucherDto): Promise<SaasVoucher> {
    const code = normalizeVoucherCode(dto.code);
    if (code.length < 2) {
      throw new BadRequestException('code inválido.');
    }
    const dup = await this.voucherRepo.findOne({ where: { code } });
    if (dup) {
      throw new BadRequestException('Já existe um voucher com este código.');
    }
    const validFrom = dto.validFrom.slice(0, 10);
    const validTo = dto.validTo.slice(0, 10);
    if (validFrom > validTo) {
      throw new BadRequestException(
        'validFrom não pode ser posterior a validTo.',
      );
    }
    const discountPercent = Math.min(
      100,
      Math.max(0, Math.floor(Number(dto.discountPercent))),
    );
    const row = this.voucherRepo.create({
      id: randomUUID(),
      name: dto.name.trim(),
      code,
      discountPercent,
      validFrom,
      validTo,
      notes: dto.notes ?? null,
      active: dto.active ?? true,
    });
    return this.voucherRepo.save(row);
  }

  async patchVoucher(id: string, dto: PatchSaasVoucherDto): Promise<SaasVoucher> {
    const row = await this.voucherRepo.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('Voucher não encontrado.');
    }
    if (dto.name !== undefined) {
      row.name = dto.name.trim();
    }
    if (dto.code !== undefined) {
      const code = normalizeVoucherCode(dto.code);
      if (code.length < 2) {
        throw new BadRequestException('code inválido.');
      }
      if (code !== row.code) {
        const dup = await this.voucherRepo.findOne({ where: { code } });
        if (dup) {
          throw new BadRequestException('Já existe um voucher com este código.');
        }
        row.code = code;
      }
    }
    if (dto.discountPercent !== undefined) {
      row.discountPercent = Math.min(
        100,
        Math.max(0, Math.floor(Number(dto.discountPercent))),
      );
    }
    if (dto.validFrom !== undefined) {
      row.validFrom = dto.validFrom.slice(0, 10);
    }
    if (dto.validTo !== undefined) {
      row.validTo = dto.validTo.slice(0, 10);
    }
    if (row.validFrom > row.validTo) {
      throw new BadRequestException(
        'validFrom não pode ser posterior a validTo.',
      );
    }
    if (dto.notes !== undefined) {
      row.notes = dto.notes;
    }
    if (dto.active !== undefined) {
      row.active = dto.active;
    }
    return this.voucherRepo.save(row);
  }

  async getCondominiumVoucherAssignment(condominiumId: string): Promise<{
    voucher: {
      id: string;
      name: string;
      code: string;
      discountPercent: number;
      validFrom: string;
      validTo: string;
      active: boolean;
    } | null;
  }> {
    const condo = await this.condoRepo.findOne({
      where: { id: condominiumId },
      relations: { saasVoucher: true },
    });
    if (!condo) {
      throw new NotFoundException('Condomínio não encontrado.');
    }
    const v = condo.saasVoucher;
    if (!v) {
      return { voucher: null };
    }
    return {
      voucher: {
        id: v.id,
        name: v.name,
        code: v.code,
        discountPercent: v.discountPercent,
        validFrom: String(v.validFrom).slice(0, 10),
        validTo: String(v.validTo).slice(0, 10),
        active: v.active,
      },
    };
  }

  /**
   * `code` null, undefined ou "" remove a associação.
   * Se `code` omitido no DTO (não enviado), não altera.
   */
  async patchCondominiumVoucherCode(
    condominiumId: string,
    code: string | null | undefined,
    hadCodeKey: boolean,
  ): Promise<{
    voucher: {
      id: string;
      name: string;
      code: string;
      discountPercent: number;
      validFrom: string;
      validTo: string;
      active: boolean;
    } | null;
  }> {
    const condo = await this.condoRepo.findOne({
      where: { id: condominiumId },
      relations: { saasVoucher: true },
    });
    if (!condo) {
      throw new NotFoundException('Condomínio não encontrado.');
    }
    if (!hadCodeKey) {
      return this.getCondominiumVoucherAssignment(condominiumId);
    }
    const raw = code === null || code === undefined ? '' : String(code).trim();
    if (raw === '') {
      condo.saasVoucherId = null;
      condo.saasVoucher = null;
      await this.condoRepo.save(condo);
      return { voucher: null };
    }
    const normalized = normalizeVoucherCode(raw);
    const v = await this.voucherRepo.findOne({ where: { code: normalized } });
    if (!v) {
      throw new NotFoundException('Não existe voucher com este código.');
    }
    if (!v.active) {
      throw new BadRequestException('Este voucher está inativo.');
    }
    condo.saasVoucherId = v.id;
    await this.condoRepo.save(condo);
    return {
      voucher: {
        id: v.id,
        name: v.name,
        code: v.code,
        discountPercent: v.discountPercent,
        validFrom: String(v.validFrom).slice(0, 10),
        validTo: String(v.validTo).slice(0, 10),
        active: v.active,
      },
    };
  }
}
