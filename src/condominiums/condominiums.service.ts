import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Grouping } from '../groupings/grouping.entity';
import { Condominium } from './condominium.entity';
import { CreateCondominiumDto } from './dto/create-condominium.dto';
import { UpdateCondominiumDto } from './dto/update-condominium.dto';

@Injectable()
export class CondominiumsService {
  constructor(
    @InjectRepository(Condominium)
    private readonly condoRepo: Repository<Condominium>,
    @InjectRepository(Grouping)
    private readonly groupingRepo: Repository<Grouping>,
    private readonly dataSource: DataSource,
  ) {}

  async assertOwner(
    condominiumId: string,
    userId: string,
  ): Promise<Condominium> {
    const condo = await this.condoRepo.findOne({
      where: { id: condominiumId, ownerId: userId },
    });
    if (!condo) {
      throw new ForbiddenException('Condominium not found or access denied');
    }
    return condo;
  }

   findAllForOwner(userId: string): Promise<Condominium[]> {
    return this.findAllAccessible(userId);
  }

  /** Titular da conta ou participante de gestão (síndico/admin/owner na tabela). */
  async findAllAccessible(userId: string): Promise<Condominium[]> {
    const byOwnerOrParticipant = await this.condoRepo
      .createQueryBuilder('c')
      .leftJoin(
        'condominium_participants',
        'p',
        'p.condominium_id = c.id AND p.user_id = :uid',
        { uid: userId },
      )
      .where('c.owner_id = :uid OR p.user_id IS NOT NULL', { uid: userId })
      .getMany();

    const byUnit = await this.condoRepo
      .createQueryBuilder('c')
      .innerJoin('groupings', 'g', 'g.condominium_id = c.id')
      .innerJoin('units', 'u', 'u.grouping_id = g.id')
      .leftJoin('people', 'op', 'op.id = u.owner_person_id')
      .leftJoin('people', 'rp', 'rp.id = u.responsible_person_id')
      .where('op.user_id = :uid OR rp.user_id = :uid', { uid: userId })
      .getMany();

    const map = new Map<string, Condominium>();
    for (const x of [...byOwnerOrParticipant, ...byUnit]) {
      map.set(x.id, x);
    }
    return Array.from(map.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  async findOneAccessible(id: string, userId: string): Promise<Condominium> {
    const all = await this.findAllAccessible(userId);
    const c = all.find((x) => x.id === id);
    if (!c) {
      throw new NotFoundException('Condominium not found');
    }
    return c;
  }

  async findById(condominiumId: string): Promise<Condominium | null> {
    return this.condoRepo.findOne({ where: { id: condominiumId } });
  }

  /** Para jobs internos (ex.: fechamento mensal automático). */
  async findAllCondominiumIds(): Promise<string[]> {
    const rows = await this.condoRepo.find({ select: ['id'] });
    return rows.map((r) => r.id);
  }

  async findOneForOwner(id: string, userId: string): Promise<Condominium> {
    const condo = await this.condoRepo.findOne({
      where: { id, ownerId: userId },
    });
    if (!condo) {
      throw new NotFoundException('Condominium not found');
    }
    return condo;
  }

  async create(
    userId: string,
    dto: CreateCondominiumDto,
  ): Promise<Condominium> {
    return this.dataSource.transaction(async (manager) => {
      const condo = manager.create(Condominium, {
        ownerId: userId,
        name: dto.name,
      });
      await manager.save(condo);
      const grouping = manager.create(Grouping, {
        condominiumId: condo.id,
        name: 'Geral',
      });
      await manager.save(grouping);
      return condo;
    });
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateCondominiumDto,
  ): Promise<Condominium> {
    const condo = await this.findOneForOwner(id, userId);
    if (dto.name !== undefined) {
      condo.name = dto.name;
    }
    return this.condoRepo.save(condo);
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.findOneForOwner(id, userId);
    await this.condoRepo.delete(id);
  }
}
