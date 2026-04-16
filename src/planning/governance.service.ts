import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { Condominium } from '../condominiums/condominium.entity';
import { Unit } from '../units/unit.entity';
import { Person } from '../people/person.entity';
import { normalizeEmail } from '../people/people.utils';
import { UsersService } from '../users/users.service';
import { CreateParticipantDto } from './dto/create-participant.dto';
import { CondominiumParticipant } from './entities/condominium-participant.entity';
import { GovernanceAuditLog } from './entities/governance-audit-log.entity';
import { GovernanceRole } from './enums/governance-role.enum';

export type CondoAccess =
  | { kind: 'owner' }
  | { kind: 'participant'; role: GovernanceRole }
  | { kind: 'resident' };

@Injectable()
export class GovernanceService {
  constructor(
    @InjectRepository(CondominiumParticipant)
    private readonly participantRepo: Repository<CondominiumParticipant>,
    @InjectRepository(Condominium)
    private readonly condoRepo: Repository<Condominium>,
    @InjectRepository(GovernanceAuditLog)
    private readonly auditRepo: Repository<GovernanceAuditLog>,
    @InjectRepository(Unit)
    private readonly unitRepo: Repository<Unit>,
    @InjectRepository(Person)
    private readonly personRepo: Repository<Person>,
    private readonly usersService: UsersService,
  ) {}

  async getCondominiumOrThrow(condominiumId: string): Promise<Condominium> {
    const c = await this.condoRepo.findOne({ where: { id: condominiumId } });
    if (!c) {
      throw new NotFoundException('Condomínio não encontrado.');
    }
    return c;
  }

  async resolveAccess(
    condominiumId: string,
    userId: string,
  ): Promise<CondoAccess | null> {
    const condo = await this.condoRepo.findOne({
      where: { id: condominiumId },
    });
    if (!condo) {
      return null;
    }
    if (condo.ownerId === userId) {
      return { kind: 'owner' };
    }
    const row = await this.participantRepo.findOne({
      where: { condominiumId, userId },
    });
    if (!row) {
      return null;
    }
    return { kind: 'participant', role: row.role };
  }

  async assertAnyAccess(
    condominiumId: string,
    userId: string,
  ): Promise<CondoAccess> {
    const access = await this.resolveAccess(condominiumId, userId);
    if (access) {
      return access;
    }
    const resident = await this.hasPersonLinkToCondominium(
      condominiumId,
      userId,
    );
    if (resident) {
      return { kind: 'resident' };
    }
    throw new ForbiddenException('Acesso negado a este condomínio.');
  }

  /** Morador com pessoa ligada à conta e a uma unidade do condomínio. */
  private async hasPersonLinkToCondominium(
    condominiumId: string,
    userId: string,
  ): Promise<boolean> {
    const n = await this.unitRepo
      .createQueryBuilder('u')
      .innerJoin('u.grouping', 'g')
      .leftJoin('u.ownerPerson', 'op')
      .leftJoin('u.responsiblePerson', 'rp')
      .where('g.condominiumId = :cid', { cid: condominiumId })
      .andWhere('(op.userId = :uid OR rp.userId = :uid)', { uid: userId })
      .getCount();
    return n > 0;
  }

  async assertManagement(
    condominiumId: string,
    userId: string,
  ): Promise<CondoAccess> {
    await this.ensureBootstrapParticipants(condominiumId);
    const access = await this.resolveAccess(condominiumId, userId);
    if (!access) {
      throw new ForbiddenException('Permissão de gestão necessária.');
    }
    if (access.kind === 'owner') {
      return access;
    }
    if (
      access.kind === 'participant' &&
      (access.role === GovernanceRole.Syndic ||
        access.role === GovernanceRole.SubSyndic ||
        access.role === GovernanceRole.Admin)
    ) {
      return access;
    }
    throw new ForbiddenException('Permissão de gestão necessária.');
  }

  /** Síndico ou dono (conta): convites, fechar pautas, PDF, etc. */
  async assertSyndicOrOwner(
    condominiumId: string,
    userId: string,
  ): Promise<CondoAccess> {
    await this.ensureBootstrapParticipants(condominiumId);
    const access = await this.resolveAccess(condominiumId, userId);
    if (!access) {
      throw new ForbiddenException('Permissão de síndico ou titular necessária.');
    }
    if (access.kind === 'owner') {
      return access;
    }
    if (access.kind === 'participant' && access.role === GovernanceRole.Syndic) {
      return access;
    }
    throw new ForbiddenException('Permissão de síndico ou titular necessária.');
  }

  async assertCanViewAggregates(
    condominiumId: string,
    userId: string,
  ): Promise<void> {
    await this.ensureBootstrapParticipants(condominiumId);
    const access = await this.resolveAccess(condominiumId, userId);
    if (access?.kind === 'owner') {
      return;
    }
    if (
      access?.kind === 'participant' &&
      (access.role === GovernanceRole.Syndic ||
        access.role === GovernanceRole.SubSyndic ||
        access.role === GovernanceRole.Admin)
    ) {
      return;
    }
    throw new ForbiddenException('Não pode ver resultados agregados.');
  }

  async assertCanManageRoles(
    condominiumId: string,
    userId: string,
  ): Promise<void> {
    await this.ensureBootstrapParticipants(condominiumId);
    const access = await this.resolveAccess(condominiumId, userId);
    if (access?.kind === 'owner') {
      return;
    }
    if (
      access?.kind === 'participant' &&
      access.role === GovernanceRole.Syndic
    ) {
      return;
    }
    throw new ForbiddenException('Apenas titular ou síndico gerem papéis.');
  }

  async ensureBootstrapParticipants(condominiumId: string): Promise<void> {
    const condo = await this.getCondominiumOrThrow(condominiumId);
    const count = await this.participantRepo.count({
      where: { condominiumId },
    });
    if (count > 0) {
      return;
    }
    const ownerId = condo.ownerId;
    await this.participantRepo.save([
      this.participantRepo.create({
        id: randomUUID(),
        condominiumId,
        userId: ownerId,
        personId: null,
        role: GovernanceRole.Owner,
      }),
      this.participantRepo.create({
        id: randomUUID(),
        condominiumId,
        userId: ownerId,
        personId: null,
        role: GovernanceRole.Syndic,
      }),
    ]);
  }

  async listParticipants(condominiumId: string) {
    await this.ensureBootstrapParticipants(condominiumId);
    return this.participantRepo.find({
      where: { condominiumId },
      relations: { user: true, person: true },
      order: { role: 'ASC', createdAt: 'ASC' },
    });
  }

  /**
   * Resolve conta por e-mail para atribuir papéis: tem de existir utilizador
   * e vínculo ao condomínio (titular, participante ou morador por unidade).
   */
  async lookupUserForGovernanceRole(
    condominiumId: string,
    actorUserId: string,
    emailRaw: string,
  ) {
    await this.assertCanManageRoles(condominiumId, actorUserId);
    const email = normalizeEmail(emailRaw);
    if (!email) {
      throw new BadRequestException('Indique um e-mail válido.');
    }
    const condo = await this.getCondominiumOrThrow(condominiumId);
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new NotFoundException(
        'Nenhuma conta com este e-mail. A pessoa precisa de registo (ex.: convite) antes de receber um papel.',
      );
    }
    const hasStake =
      condo.ownerId === user.id ||
      (await this.participantRepo.exist({
        where: { condominiumId, userId: user.id },
      })) ||
      (await this.hasPersonLinkToCondominium(condominiumId, user.id));
    if (!hasStake) {
      throw new BadRequestException(
        'Esta conta ainda não está ligada a este condomínio. Use convites ou associe a pessoa a uma unidade.',
      );
    }
    const person = await this.personRepo.findOne({
      where: { userId: user.id },
    });
    return {
      userId: user.id,
      email: user.email,
      personId: person?.id ?? null,
      fullName: person?.fullName ?? null,
      isOwner: condo.ownerId === user.id,
    };
  }

  async createParticipant(
    condominiumId: string,
    actorUserId: string,
    dto: CreateParticipantDto,
  ) {
    await this.assertCanManageRoles(condominiumId, actorUserId);
    await this.ensureBootstrapParticipants(condominiumId);

    if (dto.role === GovernanceRole.Owner) {
      throw new BadRequestException(
        'O papel owner é único e corresponde ao titular da conta; não pode ser atribuído aqui.',
      );
    }

    if (dto.role === GovernanceRole.Member) {
      throw new BadRequestException(
        'O papel de membro é atribuído automaticamente ao aceitar o convite de onboarding; não pode ser criado aqui.',
      );
    }

    if (dto.role === GovernanceRole.Syndic) {
      const olds = await this.participantRepo.find({
        where: { condominiumId, role: GovernanceRole.Syndic },
      });
      if (olds.length > 0) {
        await this.participantRepo.remove(olds);
      }
    }

    if (dto.role === GovernanceRole.SubSyndic) {
      const olds = await this.participantRepo.find({
        where: { condominiumId, role: GovernanceRole.SubSyndic },
      });
      if (olds.length > 0) {
        await this.participantRepo.remove(olds);
      }
    }

    const dup = await this.participantRepo.findOne({
      where: { condominiumId, userId: dto.userId, role: dto.role },
    });
    if (dup) {
      dup.personId = dto.personId ?? dup.personId;
      await this.participantRepo.save(dup);
      await this.auditRepo.save(
        this.auditRepo.create({
          id: randomUUID(),
          condominiumId,
          action: 'participant_updated',
          performedByUserId: actorUserId,
          payload: { userId: dto.userId, role: dto.role },
        }),
      );
      return dup;
    }

    const created = await this.participantRepo.save(
      this.participantRepo.create({
        id: randomUUID(),
        condominiumId,
        userId: dto.userId,
        personId: dto.personId ?? null,
        role: dto.role,
      }),
    );
    await this.auditRepo.save(
      this.auditRepo.create({
        id: randomUUID(),
        condominiumId,
        action: 'participant_created',
        performedByUserId: actorUserId,
        payload: { userId: dto.userId, role: dto.role },
      }),
    );
    return created;
  }

  async removeParticipant(
    condominiumId: string,
    actorUserId: string,
    participantId: string,
  ) {
    await this.assertCanManageRoles(condominiumId, actorUserId);
    const row = await this.participantRepo.findOne({
      where: { id: participantId, condominiumId },
    });
    if (!row) {
      throw new NotFoundException('Participante não encontrado.');
    }
    if (row.role === GovernanceRole.Owner) {
      throw new BadRequestException('Não é possível remover o papel owner.');
    }
    await this.participantRepo.remove(row);
    await this.auditRepo.save(
      this.auditRepo.create({
        id: randomUUID(),
        condominiumId,
        action: 'participant_removed',
        performedByUserId: actorUserId,
        payload: { participantId, userId: row.userId, role: row.role },
      }),
    );
  }

  /**
   * Garante participação como membro (onboarding por convite ao condomínio).
   * Não confere permissões de gestão.
   */
  async ensureMemberParticipant(
    condominiumId: string,
    userId: string,
    personId: string,
  ): Promise<void> {
    await this.ensureBootstrapParticipants(condominiumId);
    let row = await this.participantRepo.findOne({
      where: {
        condominiumId,
        userId,
        role: GovernanceRole.Member,
      },
    });
    if (row) {
      row.personId = personId;
      await this.participantRepo.save(row);
      return;
    }
    await this.participantRepo.save(
      this.participantRepo.create({
        id: randomUUID(),
        condominiumId,
        userId,
        personId,
        role: GovernanceRole.Member,
      }),
    );
  }

  async logElectionApplied(
    condominiumId: string,
    performedByUserId: string,
    payload: Record<string, unknown>,
  ) {
    await this.auditRepo.save(
      this.auditRepo.create({
        id: randomUUID(),
        condominiumId,
        action: 'election_governance_applied',
        performedByUserId,
        payload,
      }),
    );
  }

}
