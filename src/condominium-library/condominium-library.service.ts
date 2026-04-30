import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { In, Repository } from 'typeorm';
import { Person } from '../people/person.entity';
import { GovernanceService } from '../planning/governance.service';
import { GovernanceRole } from '../planning/enums/governance-role.enum';
import type { ReceiptStoragePort } from '../storage/receipt-storage.port';
import { RECEIPT_STORAGE } from '../storage/storage.tokens';
import { User } from '../users/user.entity';
import { CondominiumLibraryDocument } from './entities/condominium-library-document.entity';
import { CondominiumLibraryDocumentDownload } from './entities/condominium-library-document-download.entity';

@Injectable()
export class CondominiumLibraryService {
  constructor(
    @InjectRepository(CondominiumLibraryDocument)
    private readonly docRepo: Repository<CondominiumLibraryDocument>,
    @InjectRepository(CondominiumLibraryDocumentDownload)
    private readonly downloadRepo: Repository<CondominiumLibraryDocumentDownload>,
    @InjectRepository(Person)
    private readonly personRepo: Repository<Person>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly governance: GovernanceService,
    @Inject(RECEIPT_STORAGE)
    private readonly storage: ReceiptStoragePort,
  ) {}

  async list(condominiumId: string, userId: string) {
    await this.governance.assertAnyAccess(condominiumId, userId);
    return this.docRepo.find({
      where: { condominiumId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Histórico de downloads: apenas titular do condomínio ou síndico (não admin/subsíndico).
   */
  async listDownloadLog(condominiumId: string, userId: string) {
    await this.governance.assertSyndicOrOwner(condominiumId, userId);
    const rows = await this.downloadRepo.find({
      where: { condominiumId },
      relations: { document: true, user: true },
      order: { downloadedAt: 'DESC' },
      take: 500,
    });
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const nameByUser = await this.loadPreferredPersonNameByUserId(userIds);
    return rows.map((r) => {
      const docName = r.document?.originalFilename?.trim() || '—';
      const u = r.user;
      const fromPerson = nameByUser.get(r.userId);
      const userLabel = (
        fromPerson ||
        u?.email?.trim() ||
        'Usuário removido'
      ).slice(0, 255);
      return {
        id: r.id,
        documentId: r.documentId,
        documentName: docName,
        userId: r.userId,
        userLabel,
        downloadedAt: r.downloadedAt.toISOString(),
      };
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
    await this.governance.assertAnyAccess(condominiumId, userId);
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
    void this.recordDownload(condominiumId, row.id, userId);
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
    return (user?.email?.trim() || 'Usuário removido').slice(0, 255);
  }

  private async loadPreferredPersonNameByUserId(
    userIds: string[],
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (userIds.length === 0) {
      return out;
    }
    const people = await this.personRepo.find({
      where: { userId: In(userIds) },
      order: { createdAt: 'ASC' },
    });
    for (const p of people) {
      const n = p.fullName?.trim();
      const uid = p.userId;
      if (n && uid && !out.has(uid)) {
        out.set(uid, n);
      }
    }
    return out;
  }

  private async recordDownload(
    condominiumId: string,
    documentId: string,
    userId: string,
  ): Promise<void> {
    try {
      await this.downloadRepo.save(
        this.downloadRepo.create({
          id: randomUUID(),
          condominiumId,
          documentId,
          userId,
        }),
      );
    } catch {
      /* não bloqueia o download */
    }
  }
}
