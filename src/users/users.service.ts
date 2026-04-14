import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { QueryFailedError, Repository } from 'typeorm';
import { normalizeBrCellphone } from '../lib/phone-br';
import { applyPersonAddressToEntity } from '../people/apply-person-address';
import { Person } from '../people/person.entity';
import {
  isValidCpf,
  normalizeCepDigits,
  normalizeCpf,
} from '../people/people.utils';
import { MePersonDto } from './dto/me-response.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { UpdateMePersonDto } from './dto/update-me-person.dto';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Person)
    private readonly personRepo: Repository<Person>,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.usersRepo.findOne({
      where: { email: email.trim().toLowerCase() },
    });
  }

  findByPhone(phone: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { phone } });
  }

  async create(data: {
    email: string;
    passwordHash: string;
    phone?: string | null;
  }): Promise<User> {
    const user = this.usersRepo.create({
      email: data.email.trim().toLowerCase(),
      passwordHash: data.passwordHash,
      phone: data.phone ?? null,
    });
    return this.usersRepo.save(user);
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { id } });
  }

  async setPassword(userId: string, plainPassword: string): Promise<void> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('Utilizador não encontrado.');
    }
    user.passwordHash = await bcrypt.hash(plainPassword, 10);
    await this.usersRepo.save(user);
  }

  async getMe(userId: string): Promise<{
    id: string;
    email: string;
    phone: string | null;
    createdAt: Date;
    person: MePersonDto | null;
  }> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('Utilizador não encontrado.');
    }
    const person = await this.personRepo.findOne({
      where: { userId: user.id },
      order: { createdAt: 'DESC' },
    });
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      createdAt: user.createdAt,
      person: person ? this.serializePerson(person) : null,
    };
  }

  async updateProfile(
    userId: string,
    dto: UpdateMeDto,
  ): Promise<{
    id: string;
    email: string;
    phone: string | null;
    createdAt: Date;
    person: MePersonDto | null;
  }> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('Utilizador não encontrado.');
    }
    const emailNorm = dto.email.trim().toLowerCase();
    const phoneNorm = normalizeBrCellphone(dto.phone);
    if (!phoneNorm) {
      throw new BadRequestException('Número de telefone inválido.');
    }
    if (emailNorm !== user.email) {
      const emailTaken = await this.findByEmail(emailNorm);
      if (emailTaken) {
        throw new ConflictException('Email already registered');
      }
    }
    if (phoneNorm !== user.phone) {
      const phoneTaken = await this.findByPhone(phoneNorm);
      if (phoneTaken && phoneTaken.id !== userId) {
        throw new ConflictException('Phone already registered');
      }
    }
    user.email = emailNorm;
    user.phone = phoneNorm;

    const newPw = dto.newPassword?.trim();
    if (newPw) {
      const current = dto.currentPassword ?? '';
      if (!current.trim()) {
        throw new BadRequestException(
          'Indique a senha atual para definir uma nova.',
        );
      }
      const match = await bcrypt.compare(current, user.passwordHash);
      if (!match) {
        throw new BadRequestException('Senha atual incorreta.');
      }
      user.passwordHash = await bcrypt.hash(newPw, 10);
    }

    const saved = await this.usersRepo.save(user);
    await this.syncPersonForMe(saved, phoneNorm, dto);
    return this.getMe(saved.id);
  }

  private serializePerson(p: Person): MePersonDto {
    return {
      id: p.id,
      fullName: p.fullName,
      cpf: p.cpf,
      phone: p.phone,
      addressZip: p.addressZip,
      addressStreet: p.addressStreet,
      addressNumber: p.addressNumber,
      addressComplement: p.addressComplement,
      addressNeighborhood: p.addressNeighborhood,
      addressCity: p.addressCity,
      addressState: p.addressState,
      createdAt: p.createdAt,
    };
  }

  private async assertPersonEmailFree(
    email: string,
    excludePersonId: string | null,
  ): Promise<void> {
    const norm = email.trim().toLowerCase();
    const row = await this.personRepo.findOne({ where: { email: norm } });
    if (row && row.id !== excludePersonId) {
      throw new ConflictException(
        'Email já está associado a outra ficha de pessoa.',
      );
    }
  }

  private async assertCpfFree(
    cpf: string | null,
    excludePersonId: string | null,
  ): Promise<void> {
    if (!cpf) {
      return;
    }
    const row = await this.personRepo.findOne({ where: { cpf } });
    if (row && row.id !== excludePersonId) {
      throw new ConflictException('CPF já registado noutra ficha de pessoa.');
    }
  }

  private applyMeAddress(person: Person, p: UpdateMePersonDto): void {
    const zipNorm = normalizeCepDigits(p.addressZip ?? '');
    if (zipNorm.length === 0) {
      person.addressZip = null;
      person.addressStreet = null;
      person.addressNumber = null;
      person.addressComplement = null;
      person.addressNeighborhood = null;
      person.addressCity = null;
      person.addressState = null;
      return;
    }
    if (zipNorm.length !== 8) {
      throw new BadRequestException(
        'CEP inválido: são necessários 8 dígitos quando indicar endereço.',
      );
    }
    const street = p.addressStreet?.trim() ?? '';
    const number = p.addressNumber?.trim() ?? '';
    const nbh = p.addressNeighborhood?.trim() ?? '';
    const city = p.addressCity?.trim() ?? '';
    const state = p.addressState?.trim() ?? '';
    if (!street || !number || !nbh || !city || !state) {
      throw new BadRequestException(
        'Endereço incompleto: logradouro, número, bairro, cidade e UF são obrigatórios com o CEP.',
      );
    }
    if (!/^[A-Za-z]{2}$/.test(state)) {
      throw new BadRequestException('UF deve ter 2 letras.');
    }
    const payload = {
      addressZip: zipNorm,
      addressStreet: street,
      addressNumber: number,
      addressComplement: p.addressComplement?.trim() || null,
      addressNeighborhood: nbh,
      addressCity: city,
      addressState: state,
    };
    applyPersonAddressToEntity(person, payload);
  }

  private async syncPersonForMe(
    user: User,
    phoneNorm: string,
    dto: UpdateMeDto,
  ): Promise<void> {
    let person = await this.personRepo.findOne({
      where: { userId: user.id },
      order: { createdAt: 'DESC' },
    });

    if (!dto.person) {
      if (person) {
        person.email = user.email;
        person.phone = phoneNorm;
        await this.personRepo.save(person);
      }
      return;
    }

    const p = dto.person;
    const fullNameIn = p.fullName?.trim();
    const zipProbe = normalizeCepDigits(p.addressZip ?? '');
    const hasAddressIntent =
      zipProbe.length > 0 ||
      !!(
        p.addressStreet?.trim() ||
        p.addressNumber?.trim() ||
        p.addressNeighborhood?.trim() ||
        p.addressCity?.trim() ||
        p.addressState?.trim() ||
        p.addressComplement?.trim()
      );

    if (!person && !fullNameIn) {
      if (hasAddressIntent) {
        throw new BadRequestException(
          'Indique o nome completo para registar o endereço na ficha.',
        );
      }
      return;
    }

    if (!person && fullNameIn) {
      await this.assertPersonEmailFree(user.email, null);
      const cpfNorm =
        p.cpf === undefined ? null : (normalizeCpf(p.cpf) ?? null);
      if (p.cpf !== undefined && p.cpf.trim() && !cpfNorm) {
        throw new BadRequestException('CPF inválido.');
      }
      if (cpfNorm && !isValidCpf(cpfNorm)) {
        throw new BadRequestException('CPF inválido.');
      }
      await this.assertCpfFree(cpfNorm, null);
      person = this.personRepo.create({
        userId: user.id,
        email: user.email,
        fullName: fullNameIn,
        cpf: cpfNorm,
        phone: phoneNorm,
      });
      this.applyMeAddress(person, p);
      try {
        await this.personRepo.save(person);
      } catch (e) {
        if (
          e instanceof QueryFailedError &&
          /Duplicate|duplicate|UQ_people|unique/i.test(String(e.message))
        ) {
          throw new ConflictException(
            'Email ou CPF já registado noutra ficha de pessoa.',
          );
        }
        throw e;
      }
      return;
    }

    if (!person) {
      return;
    }

    await this.assertPersonEmailFree(user.email, person.id);

    if (fullNameIn) {
      person.fullName = fullNameIn;
    }
    person.email = user.email;
    person.phone = phoneNorm;

    if (p.cpf !== undefined) {
      const cpfNorm = normalizeCpf(p.cpf) ?? null;
      if (p.cpf?.trim() && !cpfNorm) {
        throw new BadRequestException('CPF inválido.');
      }
      if (cpfNorm && !isValidCpf(cpfNorm)) {
        throw new BadRequestException('CPF inválido.');
      }
      await this.assertCpfFree(cpfNorm, person.id);
      person.cpf = cpfNorm;
    }

    this.applyMeAddress(person, p);

    try {
      await this.personRepo.save(person);
    } catch (e) {
      if (
        e instanceof QueryFailedError &&
        /Duplicate|duplicate|UQ_people|unique/i.test(String(e.message))
      ) {
        throw new ConflictException(
          'Email ou CPF já registado noutra ficha de pessoa.',
        );
      }
      throw e;
    }
  }
}
