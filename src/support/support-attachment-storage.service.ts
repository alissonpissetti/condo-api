import { Inject, Injectable } from '@nestjs/common';
import type { Express } from 'express';
import type { ReceiptStoragePort } from '../storage/receipt-storage.port';
import { RECEIPT_STORAGE } from '../storage/storage.tokens';
import type { SupportTicketAttachmentMeta } from './support-attachment.types';

/**
 * Encaminha anexos de suporte para o armazenamento global (STORAGE_DRIVER).
 */
@Injectable()
export class SupportAttachmentStorageService {
  constructor(
    @Inject(RECEIPT_STORAGE)
    private readonly storage: ReceiptStoragePort,
  ) {}

  isKeyForTicket(ticketId: string, storageKey: string): boolean {
    return this.storage.isSupportAttachmentKeyForTicket(ticketId, storageKey);
  }

  saveMany(
    ticketId: string,
    files: Express.Multer.File[],
  ): Promise<SupportTicketAttachmentMeta[]> {
    return this.storage.saveSupportAttachments(ticketId, files);
  }

  read(
    ticketId: string,
    storageKey: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    return this.storage.readSupportAttachment(ticketId, storageKey);
  }
}
