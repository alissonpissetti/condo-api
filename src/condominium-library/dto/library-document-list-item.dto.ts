/** Documento da biblioteca exposto à API (metadados no DB + arquivo no storage). */
export type LibraryDocumentListItem = {
  id: string;
  condominiumId: string;
  storageKey: string;
  mimeType: string;
  originalFilename: string;
  uploadedByUserId: string | null;
  uploadedByDisplayName: string;
  createdAt: string;
  /** Link público Nextcloud quando disponível; senão use o endpoint `/file`. */
  fileUrl: string | null;
};
