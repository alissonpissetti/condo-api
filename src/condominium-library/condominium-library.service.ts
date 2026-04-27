import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { Person } from '../people/person.entity';
import { GovernanceService } from '../planning/governance.service';
import { GovernanceRole } from '../planning/enums/governance-role.enum';
import type { ReceiptStoragePort } from '../storage/receipt-storage.port';
import { RECEIPT_STORAGE } from '../storage/storage.tokens';
import { User } from '../users/user.entity';
import { CondominiumLibraryDocument } from './entities/condominium-library-document.entity';

@Injectable()
export class CondominiumLibraryService {
  constructor(
    @InjectRepository(CondominiumLibraryDocument)
    private readonly docRepo: Repository<CondominiumLibraryDocument>,
    @InjectRepository(Person)
    private readonly personRepo: Repository<Person>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly governance: GovernanceService,
    @Inject(RECEIPT_STORAGE)
    private readonly storage: ReceiptStoragePort,
  ) {}

  async list(condominiumId: string, userId: string) {
    await this.governance.assertManagement(condominiumId, userId);
    return this.docRepo.find({
      where: { condominiumId },
      order: { createdAt: 'DESC' },
    });
  }

  async upload(
    condominiumId: string,
    userId: string,
    file: Express.Multer.File | undefined,
    displayNameRaw?: string,
  ) {
    await this.governance.assertManagement(condominiumId, userId);
    if (!file?.buffer?.length) {
      throw new BadRequestException('Envie um arquivo.');
    }
    const storageKey = await this.storage.saveLibraryDocument(
      condominiumId,
      file.buffer,
      file.mimetype,
    );
    const uploadedByDisplayName = await this.resolveUploaderDisplayName(userId);
    const displayName = (displayNameRaw ?? '').trim();
    const nameForList = (displayName || file.originalname || 'documento').slice(
      0,
      255,
    );
    const doc = this.docRepo.create({
      id: randomUUID(),
      condominiumId,
      storageKey,
      mimeType: file.mimetype,
      originalFilename: nameForList,
      uploadedByUserId: userId,
      uploadedByDisplayName,
    });
    return this.docRepo.save(doc);
  }

  async readFile(condominiumId: string, documentId: string, userId: string) {
    await this.governance.assertManagement(condominiumId, userId);
    const row = await this.docRepo.findOne({
      where: { id: documentId, condominiumId },
    });
    if (!row) {
      throw new NotFoundException('Documento não encontrado.');
    }
    if (!this.storage.isValidLibraryDocumentKey(row.storageKey)) {
      throw new BadRequestException('Chave de arquivo inválida.');
    }
    const read = await this.storage.readLibraryDocument(
      condominiumId,
      row.storageKey,
    );
    const safeName = (row.originalFilename?.trim() || read.filename).replace(
      /"/g,
      '',
    );
    return { ...read, filename: safeName };
  }

  async remove(condominiumId: string, documentId: string, userId: string) {
    const access = await this.governance.assertManagement(condominiumId, userId);
    const canDelete =
      access.kind === 'owner' ||
      (access.kind === 'participant' && access.role === GovernanceRole.Syndic);
    if (!canDelete) {
      throw new ForbiddenException(
        'Apenas o titular ou síndico podem remover documentos da biblioteca.',
      );
    }
    const row = await this.docRepo.findOne({
      where: { id: documentId, condominiumId },
    });
    if (!row) {
      throw new NotFoundException('Documento não encontrado.');
    }
    await this.storage.deleteLibraryDocument(condominiumId, row.storageKey);
    await this.docRepo.delete({ id: row.id });
  }

  private async resolveUploaderDisplayName(userId: string): Promise<string> {
    const person = await this.personRepo.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    const personName = person?.fullName?.trim();
    if (personName) {
      return personName.slice(0, 255);
    }
    const user = await this.userRepo.findOne({ where: { id: userId } });
    return (user?.email?.trim() || 'Utilizador removido').slice(0, 255);
  }
}
