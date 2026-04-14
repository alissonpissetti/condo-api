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
}
