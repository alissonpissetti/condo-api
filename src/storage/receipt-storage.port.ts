import type { Express } from 'express';

export type SupportAttachmentMeta = {
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
};

export interface ReceiptStoragePort {
  isValidReceiptKey(key: string | null | undefined): boolean;
  saveTransactionReceipt(
    condominiumId: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string>;
  assertReceiptExists(
    condominiumId: string,
    relativeKey: string,
  ): Promise<void>;
  readReceipt(
    condominiumId: string,
    relativeKey: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }>;
  deleteReceipt(
    condominiumId: string,
    relativeKey: string | null | undefined,
  ): Promise<void>;

  /** Logo da gestão (PNG/JPG/WebP), uma por condomínio. */
  isValidManagementLogoKey(key: string | null | undefined): boolean;
  saveManagementLogo(
    condominiumId: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string>;
  readManagementLogo(
    condominiumId: string,
    relativeKey: string,
  ): Promise<{ buffer: Buffer; contentType: string }>;
  deleteManagementLogo(
    condominiumId: string,
    relativeKey: string | null | undefined,
  ): Promise<void>;

  /** PDFs de atas / planeamento (`documents/{uuid}.pdf`). */
  isValidPlanningDocumentKey(key: string | null | undefined): boolean;
  savePlanningDocumentPdf(
    condominiumId: string,
    buffer: Buffer,
  ): Promise<string>;
  readPlanningDocument(
    condominiumId: string,
    relativeKey: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }>;

  /**
   * PDF slip de taxa condominial para WhatsApp (`fee-slips/{competenceYm}/{unitId}.pdf`).
   * Sobrescreve o ficheiro ao reenviar a mesma unidade/competência.
   */
  isValidFeeSlipKey(key: string | null | undefined): boolean;
  saveFeeSlipPdf(
    condominiumId: string,
    competenceYm: string,
    unitId: string,
    buffer: Buffer,
  ): Promise<string>;
  /**
   * URL HTTPS pública para a Twilio anexar o PDF (partilha Nextcloud `/download`, etc.).
   * `null` quando o driver não suporta link público (ex.: disco local em dev).
   */
  resolveFeeSlipPublicUrl(
    condominiumId: string,
    relativeKey: string,
  ): Promise<string | null>;

  /** Biblioteca de documentos do condomínio (`library-documents/{uuid}.{ext}`). */
  isValidLibraryDocumentKey(key: string | null | undefined): boolean;
  saveLibraryDocument(
    condominiumId: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string>;
  readLibraryDocument(
    condominiumId: string,
    relativeKey: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }>;
  deleteLibraryDocument(
    condominiumId: string,
    relativeKey: string | null | undefined,
  ): Promise<void>;
  /**
   * Link público para abrir/baixar na biblioteca (partilha Nextcloud `/s/…`).
   * `null` em disco local ou quando partilhas estão desativadas.
   */
  resolveLibraryDocumentPublicUrl?(
    condominiumId: string,
    relativeKey: string,
  ): Promise<string | null>;

  /** Anexos de obras (`works/{workId}/{uuid}.{ext}`). */
  isValidWorkDocumentKey(key: string | null | undefined): boolean;
  saveWorkDocument(
    condominiumId: string,
    workId: string,
    buffer: Buffer,
    mimeType: string,
    originalFilename?: string,
  ): Promise<string>;
  readWorkDocument(
    condominiumId: string,
    relativeKey: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }>;
  deleteWorkDocument(
    condominiumId: string,
    relativeKey: string | null | undefined,
  ): Promise<void>;

  /** Anexos de informativos (`communication-attachments/…`). */
  isValidCommunicationAttachmentKey(key: string | null | undefined): boolean;
  isAllowedCommunicationAttachmentMime(mime: string): boolean;
  communicationAttachmentMaxBytes(mime: string): number;
  saveCommunicationAttachment(
    condominiumId: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string>;
  readCommunicationAttachment(
    condominiumId: string,
    relativeKey: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }>;
  deleteCommunicationAttachment(
    condominiumId: string,
    relativeKey: string,
  ): Promise<void>;

  /** Anexos de pautas (`poll-attachments/…`). */
  isValidPollAttachmentKey(key: string | null | undefined): boolean;
  isAllowedPollAttachmentMime(mime: string): boolean;
  savePollAttachment(
    condominiumId: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string>;
  readPollAttachment(
    condominiumId: string,
    relativeKey: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }>;
  deletePollAttachment(
    condominiumId: string,
    relativeKey: string,
  ): Promise<void>;

  /** Anexos de chamados de suporte (`support-tickets/{ticketId}/…`, fora do condomínio). */
  isSupportAttachmentKeyForTicket(ticketId: string, storageKey: string): boolean;
  saveSupportAttachments(
    ticketId: string,
    files: Express.Multer.File[],
  ): Promise<SupportAttachmentMeta[]>;
  readSupportAttachment(
    ticketId: string,
    storageKey: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }>;
}
