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
import { IsNull, QueryFailedError, Repository } from 'typeorm';
import { MailService } from '../mail/mail.service';
import { CondominiumsService } from '../condominiums/condominiums.service';
import { Grouping } from '../groupings/grouping.entity';
import { Unit } from '../units/unit.entity';
import { UsersService } from '../users/users.service';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { AssignUnitPersonDto } from './dto/assign-unit-person.dto';
import { Person } from './person.entity';
import { UnitInvitation } from './unit-invitation.entity';
import { applyPersonAddressToEntity } from './apply-person-address';
import {
  isValidCpf,
  normalizeCepDigits,
  normalizeCpf,
  normalizeEmail,
} from './people.utils';

type UnitPersonRole = AssignUnitPersonDto['role'];

@Injectable()
export class PeopleService {
  constructor(
    @InjectRepository(Person)
    private readonly personRepo: Repository<Person>,
    @InjectRepository(UnitInvitation)
    private readonly invitationRepo: Repository<UnitInvitation>,
    @InjectRepository(Unit)
    private readonly unitRepo: Repository<Unit>,
    @InjectRepository(Grouping)
    private readonly groupingRepo: Repository<Grouping>,
    private readonly condominiumsService: CondominiumsService,
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
  ) {}

  private async loadUnitForOwner(
    condominiumId: string,
    groupingId: string,
    unitId: string,
    userId: string,
  ): Promise<{ unit: Unit; condominiumName: string }> {
    const condominium = await this.condominiumsService.assertOwner(
      condominiumId,
      userId,
    );
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
      relations: { ownerPerson: true, responsiblePerson: true },
    });
    if (!unit) {
      throw new NotFoundException('Unidade não encontrada.');
    }
    return { unit, condominiumName: condominium.name };
  }

  private applyRoleToUnit(unit: Unit, personId: string, role: UnitPersonRole) {
    if (role === 'owner' || role === 'both') {
      unit.ownerPersonId = personId;
    }
    if (role === 'responsible' || role === 'both') {
      unit.responsiblePersonId = personId;
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

  /** Pesquisa pessoa ou utilizador por CPF/email (gestor da unidade). */
  async personCandidate(
    condominiumId: string,
    groupingId: string,
    unitId: string,
    userId: string,
    cpfRaw?: string,
    emailRaw?: string,
  ) {
    await this.loadUnitForOwner(condominiumId, groupingId, unitId, userId);
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
                note: 'Utilizador existe; será criada ficha de pessoa na associação, se necessário.',
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
   * Se não existir pessoa nem utilizador com o email, exige `email` no corpo e envia convite (sem alterar a unidade até aceitar).
   */
  async assignToUnit(
    condominiumId: string,
    groupingId: string,
    unitId: string,
    userId: string,
    dto: AssignUnitPersonDto,
  ) {
    const { unit, condominiumName } = await this.loadUnitForOwner(
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
        this.applyRoleToUnit(unit, linked.id, role);
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
            'Email ou CPF já registado noutra ficha de pessoa.',
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

      const base = this.config
        .get<string>('INVITE_PUBLIC_URL')
        ?.replace(/\/$/, '');
      const port = this.config.get<string>('PORT', '3000');
      const apiOrigin = `http://localhost:${port}`;
      const inviteLink = base
        ? `${base}?inviteToken=${plainToken}`
        : `${apiOrigin}/invitations/${plainToken}`;

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

    this.applyRoleToUnit(unit, person.id, role);
    await this.unitRepo.save(unit);

    return { outcome: 'linked' as const, personId: person.id };
  }

  async getInvitePreview(plainToken: string) {
    const tokenHash = createHash('sha256').update(plainToken).digest('hex');
    const inv = await this.invitationRepo.findOne({
      where: { tokenHash },
      relations: [
        'person',
        'unit',
        'unit.grouping',
        'unit.grouping.condominium',
      ],
    });
    if (!inv) {
      throw new NotFoundException('Convite inválido.');
    }
    if (inv.consumedAt) {
      throw new GoneException('Este convite já foi utilizado.');
    }
    if (inv.expiresAt.getTime() < Date.now()) {
      throw new GoneException('Convite expirado.');
    }

    const condoName = inv.unit?.grouping?.condominium?.name ?? '(condomínio)';
    const roles: string[] = [];
    if (inv.asOwner) {
      roles.push('proprietário');
    }
    if (inv.asResponsible) {
      roles.push('responsável');
    }

    return {
      condominiumName: condoName,
      unitIdentifier: inv.unit.identifier,
      emailMasked: this.maskEmail(inv.email),
      roles,
      expiresAt: inv.expiresAt.toISOString(),
      pendingRegistration: !inv.person.userId,
    };
  }

  async acceptInvite(plainToken: string, dto: AcceptInviteDto) {
    const tokenHash = createHash('sha256').update(plainToken).digest('hex');
    const inv = await this.invitationRepo.findOne({
      where: { tokenHash },
      relations: ['person', 'unit', 'unit.grouping'],
    });
    if (!inv) {
      throw new NotFoundException('Convite inválido.');
    }
    if (inv.consumedAt) {
      throw new GoneException('Este convite já foi utilizado.');
    }
    if (inv.expiresAt.getTime() < Date.now()) {
      throw new GoneException('Convite expirado.');
    }

    const existingUser = await this.usersService.findByEmail(inv.email);
    if (existingUser) {
      throw new ConflictException(
        'Já existe uma conta com este email. Inicie sessão; o administrador pode voltar a associar a unidade na aplicação.',
      );
    }

    const person = inv.person;
    if (person.userId) {
      throw new ConflictException(
        'Esta ficha de pessoa já tem utilizador associado.',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.create({
      email: inv.email,
      passwordHash,
    });

    person.userId = user.id;
    if (dto.fullName?.trim()) {
      person.fullName = dto.fullName.trim();
    }
    await this.personRepo.save(person);

    const unit = inv.unit;
    if (inv.asOwner) {
      unit.ownerPersonId = person.id;
    }
    if (inv.asResponsible) {
      unit.responsiblePersonId = person.id;
    }
    await this.unitRepo.save(unit);

    inv.consumedAt = new Date();
    await this.invitationRepo.save(inv);

    return {
      message: 'Conta criada e unidade associada.',
      userId: user.id,
      personId: person.id,
      unitId: unit.id,
    };
  }
}
