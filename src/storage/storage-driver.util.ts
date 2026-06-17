import type { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import type { LocalStorageService } from './local-storage.service';
import type { NextcloudWebdavStorageService } from './nextcloud-webdav-storage.service';
import type { ReceiptStoragePort } from './receipt-storage.port';

const log = new Logger('StorageModule');

function stripEnvSecret(value: string | undefined): string {
  return (value ?? '').trim().replace(/^['"]|['"]$/g, '');
}

export function hasNextcloudStorageConfig(config: ConfigService): boolean {
  const base = config.get<string>('NEXTCLOUD_URL')?.trim();
  const user = config.get<string>('NEXTCLOUD_USERNAME')?.trim();
  const pass = stripEnvSecret(config.get<string>('NEXTCLOUD_APP_PASSWORD'));
  return !!(base && user && pass);
}

export function hasStorageApiConfig(config: ConfigService): boolean {
  return !!(
    config.get<string>('STORAGE_API_ENDPOINT')?.trim() &&
    config.get<string>('STORAGE_API_ACCESS_KEY_ID')?.trim() &&
    config.get<string>('STORAGE_API_SECRET_ACCESS_KEY')?.trim() &&
    config.get<string>('STORAGE_API_BUCKET')?.trim()
  );
}

/** Indica uso de disco local sem Nextcloud nem storage-api (arquivos não vão para produção). */
export function usesLocalDiskOnly(config: ConfigService): boolean {
  const driver = (config.get<string>('STORAGE_DRIVER') ?? 'local').toLowerCase();
  if (driver === 'nextcloud') {
    return false;
  }
  if (hasStorageApiConfig(config)) {
    return false;
  }
  return !hasNextcloudStorageConfig(config);
}

/**
 * Driver global de arquivos: `STORAGE_DRIVER=nextcloud` ou, se `NEXTCLOUD_*` estiver
 * definido, Nextcloud mesmo com `STORAGE_DRIVER=local` (útil em dev com base remota).
 */
export function resolveReceiptStoragePort(
  config: ConfigService,
  local: LocalStorageService,
  nextcloud: NextcloudWebdavStorageService,
): ReceiptStoragePort {
  const driver = (config.get<string>('STORAGE_DRIVER') ?? 'local').toLowerCase();
  if (driver === 'nextcloud' || hasNextcloudStorageConfig(config)) {
    if (driver !== 'nextcloud' && hasNextcloudStorageConfig(config)) {
      log.warn(
        'STORAGE_DRIVER=local, mas NEXTCLOUD_* está definido — usando Nextcloud para todos os anexos (incl. obras).',
      );
    }
    const url = config.get<string>('NEXTCLOUD_URL') ?? '?';
    log.log(`Armazenamento: Nextcloud (${url}).`);
    return nextcloud;
  }
  const path = config.get<string>('STORAGE_PATH') ?? 'storage';
  log.log(
    `Armazenamento: disco local (${path}). Anexos não aparecem em outros servidores — configure STORAGE_DRIVER=nextcloud ou STORAGE_API_* se a API usar base remota.`,
  );
  return local;
}
