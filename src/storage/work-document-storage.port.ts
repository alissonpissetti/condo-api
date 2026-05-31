/** Anexos da timeline de obras (`works/{workId}/{uuid}.{ext}`). */
export interface WorkDocumentStoragePort {
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
}
