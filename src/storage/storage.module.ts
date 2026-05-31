import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocalStorageService } from './local-storage.service';
import { NextcloudWebdavStorageService } from './nextcloud-webdav-storage.service';
import type { ReceiptStoragePort } from './receipt-storage.port';
import {
  resolveReceiptStoragePort,
  usesLocalDiskOnly,
} from './storage-driver.util';
import { StorageApiWorkDocumentService } from './storage-api-work-document.service';
import { RECEIPT_STORAGE, WORK_DOCUMENT_STORAGE } from './storage.tokens';
import type { WorkDocumentStoragePort } from './work-document-storage.port';

@Global()
@Module({
  providers: [
    LocalStorageService,
    NextcloudWebdavStorageService,
    StorageApiWorkDocumentService,
    {
      provide: RECEIPT_STORAGE,
      useFactory: (
        config: ConfigService,
        local: LocalStorageService,
        nextcloud: NextcloudWebdavStorageService,
      ): ReceiptStoragePort =>
        resolveReceiptStoragePort(config, local, nextcloud),
      inject: [
        ConfigService,
        LocalStorageService,
        NextcloudWebdavStorageService,
      ],
    },
    {
      provide: WORK_DOCUMENT_STORAGE,
      useFactory: (
        config: ConfigService,
        storageApi: StorageApiWorkDocumentService,
        receipt: ReceiptStoragePort,
      ): WorkDocumentStoragePort => {
        if (storageApi.isEnabled()) {
          Logger.log(
            'Anexos de obras: storage-api (S3, STORAGE_API_*).',
            'StorageModule',
          );
          return storageApi;
        }
        if (usesLocalDiskOnly(config)) {
          Logger.warn(
            'Anexos de obras: mesmo destino que comprovantes (disco local). Com base de dados remota, configure NEXTCLOUD_* ou STORAGE_API_* no .env da API.',
            'StorageModule',
          );
        } else {
          Logger.log(
            'Anexos de obras: mesmo armazenamento compartilhado que comprovantes e suporte.',
            'StorageModule',
          );
        }
        return receipt;
      },
      inject: [
        ConfigService,
        StorageApiWorkDocumentService,
        RECEIPT_STORAGE,
      ],
    },
  ],
  exports: [RECEIPT_STORAGE, WORK_DOCUMENT_STORAGE],
})
export class StorageModule {}
