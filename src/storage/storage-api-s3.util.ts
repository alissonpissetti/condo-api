import { PutObjectCommand, type PutObjectCommandInput } from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';
import { BadRequestException, Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

/**
 * ACL no upload S3/MinIO para o objeto poder ser lido depois (URL pública ou CDN).
 * - Padrão: `public-read`
 * - `private` ou `none`: não envia ACL (use política do bucket + URL assinada)
 */
export function resolveStorageApiObjectAcl(
  config: ConfigService,
): string | undefined {
  const raw = config.get<string>('STORAGE_API_OBJECT_ACL')?.trim().toLowerCase();
  if (!raw || raw === 'default') {
    return 'public-read';
  }
  if (raw === 'none' || raw === 'false' || raw === 'off' || raw === 'private') {
    return undefined;
  }
  return raw;
}

/** Parâmetros extra do PutObject (ACL de leitura pública, etc.). */
export function storageApiPutObjectExtras(
  config: ConfigService,
): Pick<PutObjectCommandInput, 'ACL'> {
  const acl = resolveStorageApiObjectAcl(config);
  return acl ? { ACL: acl as PutObjectCommandInput['ACL'] } : {};
}

function bucketRejectsObjectAcl(err: unknown): boolean {
  const name =
    err && typeof err === 'object' && 'name' in err
      ? String((err as { name: string }).name)
      : '';
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    name === 'AccessControlListNotSupported' ||
    /acl/i.test(msg) ||
    /access control/i.test(msg)
  );
}

/** PutObject com ACL de leitura; falha com mensagem clara se o bucket não aceitar ACL. */
export async function storageApiPutObject(
  client: S3Client,
  config: ConfigService,
  input: PutObjectCommandInput,
  log: Logger,
): Promise<void> {
  const aclExtras = storageApiPutObjectExtras(config);
  const withAcl = { ...input, ...aclExtras };
  try {
    await client.send(new PutObjectCommand(withAcl));
    if (aclExtras.ACL) {
      log.debug(`storage-api: objeto gravado com ACL=${aclExtras.ACL}`);
    }
    return;
  } catch (err) {
    if (!aclExtras.ACL || !bucketRejectsObjectAcl(err)) {
      throw err;
    }
    log.warn(
      `storage-api: bucket rejeitou ACL=${aclExtras.ACL}. Tentando sem ACL — configure política pública no bucket ou habilite ACL (MinIO).`,
    );
  }
  try {
    await client.send(new PutObjectCommand(input));
  } catch (retryErr) {
    const msg = retryErr instanceof Error ? retryErr.message : String(retryErr);
    throw new BadRequestException(
      `Falha ao enviar arquivo ao storage-api (permissões). ${msg.slice(0, 180)}`,
    );
  }
}
