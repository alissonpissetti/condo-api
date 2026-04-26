import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { IsNull, Not, QueryFailedError, Repository } from 'typeorm';
import { MailService } from '../mail/mail.service';
import { CondominiumsService } from '../condominiums/condominiums.service';
import { GovernanceService } from '../planning/governance.service';
import { Grouping } from '../groupings/grouping.entity';
import { Unit } from '../units/unit.entity';
import { UnitResponsiblePerson } from '../units/unit-responsible-person.entity';
import { SaasPlansService } from '../platform/saas-plans.service';
import { UsersService } from '../users/users.service';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { AssignUnitPersonDto } from './dto/assign-unit-person.dto';
import { CreateCondominiumInviteDto } from './dto/create-condominium-invite.dto';
import { PatchUnitPersonPhoneDto } from './dto/patch-unit-person-phone.dto';
import { CondominiumInvitation } from './condominium-invitation.entity';
import { Person } from './person.entity';
import { UnitInvitation } from './unit-invitation.entity';
import { applyPersonAddressToEntity } from './apply-person-address';
import { normalizeBrCellphone } from '../lib/phone-br';
import {
  isValidCpf,
  normalizeCepDigits,
  normalizeCpf,
  normalizeEmail,
} from './people.utils';

type UnitPersonRole = AssignUnitPersonDto['role'];

/** Celular BR em E.164 (55…); exige DDD + 9 + 8 dígitos. */
function normalizeInviteMobile(raw: string): string {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) {
    throw new BadRequestException('Celular é obrigatório.');
  }
  const n = normalizeBrCellphone(trimmed);
  if (!n) {
    throw new BadRequestException('Celular inválido.');
  }
  const national = n.startsWith('55') ? n.slice(2) : n;
  if (national.length !== 11 || national[2] !== '9') {
    throw new BadRequestException(
      'Indique um celular válido com DDD (11 dígitos, começando por 9 após o DDD).',
    );
  }
  return n;
}

@Injectable()
export class PeopleService {
  constructor(
    private readonly saasPlans: SaasPlansService,
    @InjectRepository(Person)
    private readonly personRepo: Repository<Person>,
    @InjectRepository(UnitInvitation)
    private readonly invitationRepo: Repository<UnitInvitation>,
    @InjectRepository(CondominiumInvitation)
    private readonly condominiumInvitationRepo: Repository<CondominiumInvitation>,
    @InjectRepository(Unit)
    private readonly unitRepo: Repository<Unit>,
    @InjectRepository(UnitResponsiblePerson)
    private readonly unitResponsibleRepo: Repository<UnitResponsiblePerson>,
    @InjectRepository(Grouping)
    private readonly groupingRepo: Repository<Grouping>,
    private readonly condominiumsService: CondominiumsService,
    private readonly governanceService: GovernanceService,
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
  ) {}

  private async loadUnitScoped(
    condominiumId: string,
    groupingId: string,
    unitId: string,
    userId: string,
    assertAccess: (cid: string, uid: string) => Promise<unknown>,
  ): Promise<{ unit: Unit; condominiumName: string }> {
    await assertAccess(condominiumId, userId);
    const condominium = await this.condominiumsService.findById(condominiumId);
    if (!condominium) {
      throw new NotFoundException('Condomínio não encontrado.');
    }
    const grouping = await this.groupingRepo.findOne({
      where: { id: groupingId, condominiumId },
    });
    if (!grouping) {
      throw new NotFoundException(
        'Agrupamento não encontrado neste condomínio.',
      );
    }
    const unit = await this.unitRepo.findOne({
      where: { id: unitId, groupingId },
      relations: { ownerPerson: true, responsibleLinks: { person: true } },
    });
    if (!unit) {
      throw new NotFoundException('Unidade não encontrada.');
    }
    return { unit, condominiumName: condominium.name };
  }

  private loadUnitForManagement(
    condominiumId: string,
    groupingId: string,
    unitId: string,
    userId: string,
  ): Promise<{ unit: Unit; condominiumName: string }> {
    return this.loadUnitScoped(condominiumId, groupingId, unitId, userId, (c, u) =>
      this.governanceService.assertManagement(c, u),
    );
  }

  /** Titular ou síndico: editar telefone de condômino ligado à unidade. */
  async patchPersonPhoneForUnit(
    condominiumId: string,
    groupingId: string,
    unitId: string,
    personId: string,
    actorUserId: string,
    dto: PatchUnitPersonPhoneDto,
  ): Promise<{ id: string; fullName: string; phone: string | null }> {
    const { unit } = await this.loadUnitScoped(
      condominiumId,
      groupingId,
      unitId,
      actorUserId,
      (c, u) => this.governanceService.assertSyndicOrOwner(c, u),
    );
    const isOwnerLink = unit.ownerPersonId === personId;
    const isResponsible = await this.unitResponsibleRepo.exist({
      where: { unitId: unit.id, personId },
    });
    if (!isOwnerLink && !isResponsible) {
      throw new BadRequestException(
        'Esta pessoa não é proprietária nem responsável identificada nesta unidade.',
      );
    }
    const person = await this.personRepo.findOne({ where: { id: personId } });
    if (!person) {
      throw new NotFoundException('Pessoa não encontrada.');
    }
    const trimmed = (dto.phone ?? '').trim();
    const phoneNorm = trimmed ? normalizeBrCellphone(trimmed) : null;
    if (trimmed && !phoneNorm) {
      throw new BadRequestException('Número de telefone inválido.');
    }
    if (person.userId) {
      await this.usersService.setPhoneForUserByStaff(person.userId, dto.phone);
    }
    person.phone = phoneNorm;
    await this.personRepo.save(person);
    return {
      id: person.id,
      fullName: person.fullName,
      phone: person.phone,
    };
  }

  private async ensureResponsibleLink(
    unitId: string,
    personId: string,
  ): Promise<void> {
    const exists = await this.unitResponsibleRepo.exist({
      where: { unitId, personId },
    });
    if (!exists) {
      await this.unitResponsibleRepo.save(
        this.unitResponsibleRepo.create({ unitId, personId }),
      );
    }
  }

  private async applyRoleToUnit(
    unit: Unit,
    personId: string,
    role: UnitPersonRole,
  ): Promise<void> {
    if (role === 'owner' || role === 'both') {
      unit.ownerPersonId = personId;
    }
    if (role === 'responsible' || role === 'both') {
      await this.ensureResponsibleLink(unit.id, personId);
    }
  }

  /** Ao ligar uma ficha real, remove rótulos livres do mesmo papel (evita duplicar no PDF). */
  private clearDisplayNamesWhenLinkingPerson(
    unit: Unit,
    role: UnitPersonRole,
  ): void {
    if (role === 'owner' || role === 'both') {
      unit.ownerDisplayName = null;
    }
    if (role === 'responsible' || role === 'both') {
      unit.responsibleDisplayName = null;
    }
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) {
      return '***';
    }
    const masked =
      local.length <= 1 ? '*' : `${local[0]}***${local[local.length - 1]}`;
    return `${masked}@${domain}`;
  }

  /** Pesquisa pessoa ou usuário por CPF/email (gestor da unidade). */
  async personCandidate(
    condominiumId: string,
    groupingId: string,
    unitId: string,
    userId: string,
    cpfRaw?: string,
    emailRaw?: string,
  ) {
    await this.loadUnitForManagement(condominiumId, groupingId, unitId, userId);
    const cpf = normalizeCpf(cpfRaw);
    const email = normalizeEmail(emailRaw);
    if (!cpf && !email) {
      throw new BadRequestException(
        'Informe o query param cpf ou email para pesquisar.',
      );
    }
    if (cpf && !isValidCpf(cpf)) {
      throw new BadRequestException('CPF inválido.');
    }

    let person: Person | null = null;
    if (cpf) {
      person = await this.personRepo.findOne({ where: { cpf } });
    }
    if (!person && email) {
      person = await this.personRepo.findOne({ where: { email } });
    }

    if (!person && email) {
      const user = await this.usersService.findByEmail(email);
      if (user) {
        const byUser = await this.personRepo.findOne({
          where: { userId: user.id },
        });
        return {
          found: true,
          source: 'user' as const,
          hasUserAccount: true,
          person: byUser
            ? this.serializePerson(byUser)
            : {
                id: null,
                cpf: null,
                email: user.email,
                fullName: null,
                hasUserAccount: true,
                note: 'Usuário existe; será criada ficha de pessoa na associação, se necessário.',
              },
        };
      }
    }

    if (person) {
      return {
        found: true,
        source: 'person' as const,
        hasUserAccount: !!person.userId,
        person: this.serializePerson(person),
      };
    }

    return {
      found: false,
      requiresEmailForInvite: !email,
      message: email
        ? 'Nenhuma pessoa com este email. Pode enviar convite com POST /people/assign.'
        : 'Nenhuma pessoa com este CPF. Indique também o email no corpo do POST /people/assign para convidar.',
    };
  }

  private serializePerson(p: Person) {
    return {
      id: p.id,
      cpf: p.cpf,
      email: p.email,
      fullName: p.fullName,
      phone: p.phone,
      hasUserAccount: !!p.userId,
      addressZip: p.addressZip,
      addressStreet: p.addressStreet,
      addressNumber: p.addressNumber,
      addressComplement: p.addressComplement,
      addressNeighborhood: p.addressNeighborhood,
      addressCity: p.addressCity,
      addressState: p.addressState,
    };
  }

  /**
   * Associa proprietário / responsável à unidade.
   * Se não existir pessoa nem usuário com o email, exige `email` no corpo e envia convite (sem alterar a unidade até aceitar).
   */
  async assignToUnit(
    condominiumId: string,
    groupingId: string,
    unitId: string,
    userId: string,
    dto: AssignUnitPersonDto,
  ) {
    const { unit, condominiumName } = await this.loadUnitForManagement(
      condominiumId,
      groupingId,
      unitId,
      userId,
    );
    const cpf = normalizeCpf(dto.cpf);
    const email = normalizeEmail(dto.email);
    const role = dto.role;
    const zipNorm = normalizeCepDigits(dto.addressZip);
    if (zipNorm.length !== 8) {
      throw new BadRequestException('CEP inválido: são necessários 8 dígitos.');
    }

    if (cpf && !isValidCpf(cpf)) {
      throw new BadRequestException('CPF inválido.');
    }
    if (!cpf && !email) {
      throw new BadRequestException('Informe cpf ou email para pesquisa.');
    }

    let person: Person | null = null;
    if (cpf) {
      person = await this.personRepo.findOne({ where: { cpf } });
    }
    if (!person && email) {
      person = await this.personRepo.findOne({ where: { email } });
    }

    if (!person && email) {
      const user = await this.usersService.findByEmail(email);
      if (user) {
        let linked = await this.personRepo.findOne({
          where: { userId: user.id },
        });
        if (!linked) {
          linked = this.personRepo.create({
            email: user.email,
            userId: user.id,
            fullName: dto.fullName.trim(),
            cpf: cpf ?? null,
            phone: dto.phone?.trim() || null,
          });
          applyPersonAddressToEntity(linked, dto);
          linked = await this.personRepo.save(linked);
        } else {
          if (cpf && linked.cpf && linked.cpf !== cpf) {
            throw new ConflictException(
              'O email pertence a uma conta com outro CPF.',
            );
          }
          if (cpf && !linked.cpf) {
            linked.cpf = cpf;
          }
          linked.fullName = dto.fullName.trim();
          if (dto.phone?.trim()) {
            linked.phone = dto.phone.trim();
          }
          applyPersonAddressToEntity(linked, dto);
          await this.personRepo.save(linked);
        }
        await this.applyRoleToUnit(unit, linked.id, role);
        this.clearDisplayNamesWhenLinkingPerson(unit, role);
        await this.unitRepo.save(unit);
        return {
          outcome: 'linked_existing_user' as const,
          personId: linked.id,
        };
      }
    }

    if (!person) {
      if (!email) {
        throw new BadRequestException(
          'Titular não encontrado. O email é obrigatório para enviar o convite.',
        );
      }
      const fullName = dto.fullName.trim();
      person = this.personRepo.create({
        email,
        cpf: cpf ?? null,
        fullName,
        phone: dto.phone?.trim() || null,
      });
      applyPersonAddressToEntity(person, dto);
      try {
        person = await this.personRepo.save(person);
      } catch (e) {
        if (e instanceof QueryFailedError) {
          throw new ConflictException(
            'E-mail ou CPF já cadastrado em outra ficha de pessoa.',
          );
        }
        throw e;
      }

      const plainToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(plainToken).digest('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);

      await this.invitationRepo.delete({
        unitId: unit.id,
        email,
        consumedAt: IsNull(),
      });

      const inv = this.invitationRepo.create({
        tokenHash,
        email,
        cpf: cpf ?? null,
        personId: person.id,
        unitId: unit.id,
        asOwner: role === 'owner' || role === 'both',
        asResponsible: role === 'responsible' || role === 'both',
        invitedByUserId: userId,
        expiresAt,
      });
      await this.invitationRepo.save(inv);

      const inviteLink = this.buildInvitePublicLink(plainToken);

      const roleDescription =
        role === 'both'
          ? 'proprietário e responsável pela unidade'
          : role === 'owner'
            ? 'proprietário da unidade'
            : 'responsável pela unidade (por exemplo, inquilino)';

      await this.mailService.sendUnitPersonInvite({
        to: email,
        inviteLink,
        roleDescription,
        condominiumName,
        unitIdentifier: unit.identifier,
      });

      return {
        outcome: 'invite_sent' as const,
        personId: person.id,
        email,
      };
    }

    if (email && person.email && person.email !== email) {
      throw new ConflictException(
        'O CPF indicado já está associado a outro email.',
      );
    }
    if (cpf && person.cpf && person.cpf !== cpf) {
      throw new ConflictException(
        'O email indicado já está associado a outro CPF.',
      );
    }
    if (email && !person.email) {
      person.email = email;
    }
    if (cpf && !person.cpf) {
      person.cpf = cpf;
    }
    person.fullName = dto.fullName.trim();
    if (dto.phone?.trim()) {
      person.phone = dto.phone.trim();
    }
    applyPersonAddressToEntity(person, dto);
    await this.personRepo.save(person);

    await this.applyRoleToUnit(unit, person.id, role);
    this.clearDisplayNamesWhenLinkingPerson(unit, role);
    await this.unitRepo.save(unit);

    return { outcome: 'linked' as const, personId: person.id };
  }

  /** Remove apenas o responsável pela unidade (proprietário mantém-se, se houver). */
  async clearResponsibleFromUnit(
    condominiumId: string,
    groupingId: string,
    unitId: string,
    userId: string,
  ): Promise<void> {
    const { unit } = await this.loadUnitForManagement(
      condominiumId,
      groupingId,
      unitId,
      userId,
    );
    await this.unitResponsibleRepo.delete({ unitId: unit.id });
    await this.unitRepo.update(
      { id: unit.id },
      {
        responsibleDisplayName: null,
        financialResponsiblePersonId: null,
      },
    );
  }

  /** Remove uma pessoa da lista de responsáveis da unidade (mantém as outras). */
  async removeResponsiblePersonFromUnit(
    condominiumId: string,
    groupingId: string,
    unitId: string,
    personId: string,
    userId: string,
  ): Promise<void> {
    const { unit } = await this.loadUnitForManagement(
      condominiumId,
      groupingId,
      unitId,
      userId,
    );
    const del = await this.unitResponsibleRepo.delete({
      unitId: unit.id,
      personId,
    });
    if ((del.affected ?? 0) < 1) {
      throw new NotFoundException(
        'Esta pessoa não está associada como responsável desta unidade.',
      );
    }
    const row = await this.unitRepo.findOne({
      where: { id: unit.id },
      select: { id: true, financialResponsiblePersonId: true },
    });
    if (row?.financialResponsiblePersonId === personId) {
      await this.unitRepo.update(
        { id: unit.id },
        { financialResponsiblePersonId: null },
      );
    }
  }

  async getInvitePreview(plainToken: string) {
    const tokenHash = createHash('sha256').update(plainToken).digest('hex');

    const unitInv = await this.invitationRepo.findOne({
      where: { tokenHash },
      relations: [
        'person',
        'unit',
        'unit.grouping',
        'unit.grouping.condominium',
      ],
    });

    if (unitInv) {
      if (unitInv.consumedAt) {
        throw new GoneException('Este convite já foi utilizado.');
      }
      if (unitInv.expiresAt.getTime() < Date.now()) {
        throw new GoneException('Convite expirado.');
      }

      const condoName =
        unitInv.unit?.grouping?.condominium?.name ?? '(condomínio)';
      const roles: string[] = [];
      if (unitInv.asOwner) {
        roles.push('proprietário');
      }
      if (unitInv.asResponsible) {
        roles.push('responsável');
      }

      return {
        inviteKind: 'unit' as const,
        condominiumName: condoName,
        unitIdentifier: unitInv.unit.identifier,
        emailMasked: this.maskEmail(unitInv.email),
        roles,
        expiresAt: unitInv.expiresAt.toISOString(),
        pendingRegistration: !unitInv.person.userId,
      };
    }

    const condoInv = await this.condominiumInvitationRepo.findOne({
      where: { tokenHash },
      relations: ['person', 'condominium', 'unit', 'unit.grouping'],
    });
    if (!condoInv) {
      throw new NotFoundException('Convite inválido.');
    }
    if (condoInv.consumedAt) {
      throw new GoneException('Este convite já foi utilizado.');
    }
    if (condoInv.expiresAt.getTime() < Date.now()) {
      throw new GoneException('Convite expirado.');
    }

    return {
      inviteKind: 'condominium' as const,
      condominiumName: condoInv.condominium.name,
      unitIdentifier: condoInv.unit.identifier,
      emailMasked: this.maskEmail(condoInv.email),
      roles: ['responsável pela unidade'],
      expiresAt: condoInv.expiresAt.toISOString(),
      pendingRegistration: !condoInv.person.userId,
    };
  }

  async acceptInvite(plainToken: string, dto: AcceptInviteDto) {
    const tokenHash = createHash('sha256').update(plainToken).digest('hex');

    const unitInv = await this.invitationRepo.findOne({
      where: { tokenHash },
      relations: ['person', 'unit', 'unit.grouping'],
    });

    if (unitInv) {
      return this.acceptUnitInvitation(unitInv, dto);
    }

    const condoInv = await this.condominiumInvitationRepo.findOne({
      where: { tokenHash },
      relations: ['person', 'condominium', 'unit'],
    });

    if (condoInv) {
      return this.acceptCondominiumInvitation(condoInv, dto);
    }

    throw new NotFoundException('Convite inválido.');
  }

  private async acceptUnitInvitation(inv: UnitInvitation, dto: AcceptInviteDto) {
    if (inv.consumedAt) {
      throw new GoneException('Este convite já foi utilizado.');
    }
    if (inv.expiresAt.getTime() < Date.now()) {
      throw new GoneException('Convite expirado.');
    }

    const existingUser = await this.usersService.findByEmail(inv.email);
    if (existingUser) {
      throw new ConflictException(
        'Já existe uma conta com este e-mail. Entre; o administrador pode associar a unidade novamente na aplicação.',
      );
    }

    const person = inv.person;
    if (person.userId) {
      throw new ConflictException(
        'Esta ficha de pessoa já tem usuário associado.',
      );
    }

    if (!dto.password || dto.password.length < 8) {
      throw new BadRequestException(
        'Senha obrigatória (mínimo 8 caracteres) para criar a conta.',
      );
    }

    const phoneNorm = normalizeInviteMobile(dto.phone);
    const phoneTaken = await this.usersService.findByPhone(phoneNorm);
    if (phoneTaken) {
      throw new ConflictException(
        'Este celular já está cadastrado em outra conta.',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const planId = await this.saasPlans.resolveDefaultPlanIdForNewUser();
    const user = await this.usersService.create({
      email: inv.email,
      passwordHash,
      planId,
      phone: phoneNorm,
    });

    person.userId = user.id;
    person.phone = phoneNorm;
    if (dto.fullName?.trim()) {
      person.fullName = dto.fullName.trim();
    }
    await this.personRepo.save(person);

    const unit = inv.unit;
    if (inv.asOwner) {
      unit.ownerPersonId = person.id;
      unit.ownerDisplayName = null;
    }
    if (inv.asResponsible) {
      unit.responsibleDisplayName = null;
    }
    await this.unitRepo.save(unit);
    if (inv.asResponsible) {
      await this.ensureResponsibleLink(unit.id, person.id);
    }

    inv.consumedAt = new Date();
    await this.invitationRepo.save(inv);

    return {
      message: 'Conta criada e unidade associada.',
      userId: user.id,
      personId: person.id,
      unitId: unit.id,
    };
  }

  private async acceptCondominiumInvitation(
    inv: CondominiumInvitation,
    dto: AcceptInviteDto,
  ) {
    if (inv.consumedAt) {
      throw new GoneException('Este convite já foi utilizado.');
    }
    if (inv.expiresAt.getTime() < Date.now()) {
      throw new GoneException('Convite expirado.');
    }

    const phoneNorm = normalizeInviteMobile(dto.phone);

    const person = inv.person;
    const existingUser = await this.usersService.findByEmail(inv.email);

    if (existingUser) {
      if (!person.userId) {
        person.userId = existingUser.id;
        if (!person.email) {
          person.email = existingUser.email;
        }
        await this.personRepo.save(person);
      }
      if (person.userId !== existingUser.id) {
        throw new ConflictException(
          'Este convite não corresponde à conta associada a este email.',
        );
      }
      await this.usersService.assertOrSetPhoneForInviteAccept(
        existingUser,
        phoneNorm,
      );
      const unit = inv.unit;
      unit.responsibleDisplayName = null;
      await this.unitRepo.save(unit);
      await this.ensureResponsibleLink(unit.id, person.id);
      person.phone = phoneNorm;
      if (dto.fullName?.trim()) {
        person.fullName = dto.fullName.trim();
      }
      await this.personRepo.save(person);
      inv.consumedAt = new Date();
      await this.condominiumInvitationRepo.save(inv);
      return {
        message:
          'Associação confirmada. Ficou como responsável pela unidade indicada.',
        userId: existingUser.id,
        personId: person.id,
        condominiumId: inv.condominiumId,
        unitId: unit.id,
      };
    }

    if (person.userId) {
      throw new ConflictException(
        'Esta ficha de pessoa já tem usuário associado. Entre com essa conta para aceitar convites futuros.',
      );
    }

    if (!dto.password || dto.password.length < 8) {
      throw new BadRequestException(
        'Senha obrigatória (mínimo 8 caracteres) para criar a conta.',
      );
    }

    const phoneTakenNew = await this.usersService.findByPhone(phoneNorm);
    if (phoneTakenNew) {
      throw new ConflictException(
        'Este celular já está cadastrado em outra conta.',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const planId = await this.saasPlans.resolveDefaultPlanIdForNewUser();
    const user = await this.usersService.create({
      email: inv.email,
      passwordHash,
      planId,
      phone: phoneNorm,
    });

    person.userId = user.id;
    person.phone = phoneNorm;
    if (dto.fullName?.trim()) {
      person.fullName = dto.fullName.trim();
    }
    await this.personRepo.save(person);

    const unit = inv.unit;
    unit.responsibleDisplayName = null;
    await this.unitRepo.save(unit);
    await this.ensureResponsibleLink(unit.id, person.id);

    inv.consumedAt = new Date();
    await this.condominiumInvitationRepo.save(inv);

    return {
      message: 'Conta criada. Ficou como responsável pela unidade indicada.',
      userId: user.id,
      personId: person.id,
      condominiumId: inv.condominiumId,
      unitId: unit.id,
    };
  }

  async lookupEmailForCondominiumInvite(
    condominiumId: string,
    userId: string,
    emailRaw?: string,
  ) {
    await this.governanceService.assertManagement(condominiumId, userId);
    const email = normalizeEmail(emailRaw);
    if (!email) {
      throw new BadRequestException('Indique o email na query (?email=).');
    }

    const person = await this.personRepo.findOne({ where: { email } });
    if (person) {
      if (person.userId) {
        return {
          found: true,
          fullName: person.fullName,
          hasUserAccount: true,
          canInvite: true,
          message:
            'Esta pessoa já tem conta. Pode enviar o convite: receberá um link para aceitar e ficar como responsável pela unidade.',
        };
      }
      return {
        found: true,
        fullName: person.fullName,
        hasUserAccount: false,
        canInvite: true,
      };
    }

    const user = await this.usersService.findByEmail(email);
    if (user) {
      const byUser = await this.personRepo.findOne({
        where: { userId: user.id },
      });
      return {
        found: true,
        fullName: byUser?.fullName ?? null,
        hasUserAccount: true,
        canInvite: true,
        message:
          'Já existe usuário com este e-mail. Você pode enviar o convite; a pessoa confirma pelo link com a conta existente.',
      };
    }

    return {
      found: false,
      fullName: null,
      hasUserAccount: false,
      canInvite: true,
      message: 'Indique o nome completo para enviar o convite.',
    };
  }

  async listPendingCondominiumInvitations(
    condominiumId: string,
    userId: string,
  ) {
    await this.governanceService.assertManagement(condominiumId, userId);
    const rows = await this.condominiumInvitationRepo.find({
      where: { condominiumId, consumedAt: IsNull() },
      order: { createdAt: 'DESC' },
      relations: { person: true, unit: { grouping: true } },
    });
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      expiresAt: r.expiresAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      personFullName: r.person.fullName,
      pendingRegistration: !r.person.userId,
      groupingName: r.unit.grouping.name,
      unitIdentifier: r.unit.identifier,
      inviteUrl: this.tryBuildInvitePublicLink(r.inviteTokenPlain),
    }));
  }

  async listHistoricCondominiumInvitations(
    condominiumId: string,
    userId: string,
  ) {
    await this.governanceService.assertManagement(condominiumId, userId);
    const rows = await this.condominiumInvitationRepo.find({
      where: { condominiumId, consumedAt: Not(IsNull()) },
      order: { consumedAt: 'DESC' },
      relations: { person: true, unit: { grouping: true } },
    });
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      createdAt: r.createdAt.toISOString(),
      acceptedAt: r.consumedAt!.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      personFullName: r.person.fullName,
      groupingName: r.unit.grouping.name,
      unitIdentifier: r.unit.identifier,
    }));
  }

  async deleteCondominiumInvitation(
    condominiumId: string,
    invitationId: string,
    userId: string,
  ): Promise<void> {
    await this.governanceService.assertManagement(condominiumId, userId);
    const inv = await this.condominiumInvitationRepo.findOne({
      where: { id: invitationId, condominiumId },
    });
    if (!inv) {
      throw new NotFoundException('Convite não encontrado.');
    }
    if (inv.consumedAt) {
      throw new BadRequestException(
        'Não é possível remover um convite já aceite.',
      );
    }
    await this.condominiumInvitationRepo.remove(inv);
  }

  async createCondominiumInvitation(
    condominiumId: string,
    userId: string,
    dto: CreateCondominiumInviteDto,
  ) {
    const { unit, condominiumName } = await this.loadUnitForManagement(
      condominiumId,
      dto.groupingId,
      dto.unitId,
      userId,
    );

    const email = normalizeEmail(dto.email);
    if (!email) {
      throw new BadRequestException('Email inválido.');
    }

    let person = await this.personRepo.findOne({ where: { email } });

    if (!person) {
      const existingUser = await this.usersService.findByEmail(email);
      if (existingUser) {
        person = await this.personRepo.findOne({
          where: { userId: existingUser.id },
        });
        if (!person) {
          const fullName = dto.fullName?.trim() ?? '';
          if (fullName.length < 2) {
            throw new BadRequestException(
              'Nome completo obrigatório para convidar esta conta (criação da ficha de pessoa ligada ao usuário).',
            );
          }
          person = this.personRepo.create({
            email: existingUser.email,
            fullName,
            userId: existingUser.id,
            cpf: null,
            phone: null,
          });
          try {
            person = await this.personRepo.save(person);
          } catch (e) {
            if (e instanceof QueryFailedError) {
              throw new ConflictException(
                'Dados em conflito ao criar ficha de pessoa.',
              );
            }
            throw e;
          }
        }
      }
    }

    if (!person) {
      const fullName = dto.fullName?.trim() ?? '';
      if (fullName.length < 2) {
        throw new BadRequestException(
          'Nome completo obrigatório para convidar um email que ainda não está no sistema.',
        );
      }
      person = this.personRepo.create({
        email,
        fullName,
        cpf: null,
        phone: null,
      });
      try {
        person = await this.personRepo.save(person);
      } catch (e) {
        if (e instanceof QueryFailedError) {
          throw new ConflictException(
            'Email ou dados em conflito com outra ficha de pessoa.',
          );
        }
        throw e;
      }
    } else {
      const fn = dto.fullName?.trim();
      if (fn && fn.length >= 2) {
        person.fullName = fn;
        await this.personRepo.save(person);
      }
    }

    const hasUserAccount = !!person.userId;

    await this.condominiumInvitationRepo.delete({
      condominiumId,
      email,
      consumedAt: IsNull(),
    });

    const plainToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(plainToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);

    const inv = this.condominiumInvitationRepo.create({
      tokenHash,
      inviteTokenPlain: plainToken,
      email,
      condominiumId,
      personId: person.id,
      unitId: unit.id,
      invitedByUserId: userId,
      expiresAt,
      createdAt: new Date(),
    });
    await this.condominiumInvitationRepo.save(inv);

    const inviteLink = this.buildInvitePublicLink(plainToken);

    await this.mailService.sendCondominiumMemberInvite({
      to: email,
      inviteLink,
      condominiumName,
      unitIdentifier: unit.identifier,
      existingAccount: hasUserAccount,
    });

    return {
      outcome: 'invite_sent' as const,
      personId: person.id,
      email,
      unitId: unit.id,
      inviteUrl: inviteLink,
    };
  }

  async listPendingInvitations(
    condominiumId: string,
    groupingId: string,
    unitId: string,
    userId: string,
  ) {
    const { unit } = await this.loadUnitForManagement(
      condominiumId,
      groupingId,
      unitId,
      userId,
    );
    return this.invitationRepo.find({
      where: { unitId: unit.id, consumedAt: IsNull() },
      relations: { person: true },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * URL do frontend: `FRONTEND_PUBLIC_URL/invitations/{token}` (igual ao e-mail).
   * Exige configuração; usado ao criar convite e a enviar e-mail.
   */
  private buildInvitePublicLink(plainToken: string): string {
    const base = this.requireFrontendPublicBase();
    return `${base}/invitations/${encodeURIComponent(plainToken)}`;
  }

  /** Listagem: não falha se a env estiver em falta (o link fica null). */
  private tryBuildInvitePublicLink(
    plainToken: string | null | undefined,
  ): string | null {
    if (plainToken == null || plainToken === '') {
      return null;
    }
    const raw = this.config.get<string>('FRONTEND_PUBLIC_URL')?.trim();
    if (!raw) {
      return null;
    }
    const base = raw.replace(/\/$/, '');
    return `${base}/invitations/${encodeURIComponent(plainToken)}`;
  }

  private requireFrontendPublicBase(): string {
    const raw = this.config.get<string>('FRONTEND_PUBLIC_URL')?.trim();
    if (!raw) {
      throw new BadRequestException(
        'FRONTEND_PUBLIC_URL não está definida. Configure a URL base do frontend (ex.: http://localhost:4200).',
      );
    }
    return raw.replace(/\/$/, '');
  }
}
