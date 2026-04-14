import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocalStorageService } from './local-storage.service';
import { NextcloudWebdavStorageService } from './nextcloud-webdav-storage.service';
import type { ReceiptStoragePort } from './receipt-storage.port';
import { RECEIPT_STORAGE } from './storage.tokens';

@Global()
@Module({
  providers: [
    LocalStorageService,
    NextcloudWebdavStorageService,
    {
      provide: RECEIPT_STORAGE,
      useFactory: (
        config: ConfigService,
        local: LocalStorageService,
        nextcloud: NextcloudWebdavStorageService,
      ): ReceiptStoragePort => {
        const driver = (
          config.get<string>('STORAGE_DRIVER') ?? 'local'
        ).toLowerCase();
        return driver === 'nextcloud' ? nextcloud : local;
      },
      inject: [
        ConfigService,
        LocalStorageService,
        NextcloudWebdavStorageService,
      ],
    },
  ],
  exports: [RECEIPT_STORAGE],
})
export class StorageModule {}
