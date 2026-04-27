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
}
