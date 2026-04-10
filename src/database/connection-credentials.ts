type Getter = (key: string) => string | undefined;

type MysqlSsl = { ssl?: boolean | Record<string, unknown> };

function tryParseMysqlHostname(databaseUrl: string): string | undefined {
  try {
    return new URL(databaseUrl).hostname;
  } catch {
    const m = databaseUrl.match(/^mysql:\/\/[^@]*@([^:/?#]+)/i);
    return m?.[1];
  }
}

/** Hostname remoto típico (FQDN ou IPv4 público/privado fora de loopback). */
function shouldAutoEnableMysqlTls(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1') {
    return false;
  }
  if (/\./.test(h)) {
    return true;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    return true;
  }
  return false;
}

/**
 * TLS para mysql2 (ex.: servidor com `require_secure_transport=ON`).
 * - `DATABASE_SSL=false` desliga explicitamente.
 * - `DATABASE_SSL=true` (ou `MYSQL_REQUIRE_SECURE_TRANSPORT=true`) liga.
 * - Sem variável: host “remoto” na URL ou em `DB_HOST` (FQDN, IPv4 não loopback) liga TLS automaticamente.
 * - `DATABASE_SSL_REJECT_UNAUTHORIZED=false` aceita certificados não confiáveis pela CA (ex.: self‑signed).
 */
export function resolveMysqlSsl(
  get: Getter,
  /** `DATABASE_URL` mysql/mariadb ou hostname em modo `DB_HOST` (sem protocolo). */
  hostOrMysqlUrlHint?: string,
): MysqlSsl {
  const explicit = (
    get('DATABASE_SSL') ??
    get('MYSQL_REQUIRE_SECURE_TRANSPORT') ??
    ''
  )
    .toLowerCase()
    .trim();

  if (explicit === 'false' || explicit === '0' || explicit === 'off') {
    return {};
  }

  let enabled =
    explicit === 'true' ||
    explicit === '1' ||
    explicit === 'require' ||
    explicit === 'required';

  if (!enabled && hostOrMysqlUrlHint) {
    const host = hostOrMysqlUrlHint.includes('://')
      ? tryParseMysqlHostname(hostOrMysqlUrlHint)
      : hostOrMysqlUrlHint;
    if (host && shouldAutoEnableMysqlTls(host)) {
      enabled = true;
    }
  }

  if (!enabled) {
    return {};
  }

  const rejectRaw = get('DATABASE_SSL_REJECT_UNAUTHORIZED');
  const rejectUnauthorized =
    rejectRaw === undefined ||
    rejectRaw === '' ||
    rejectRaw === 'true' ||
    rejectRaw === '1';

  return rejectUnauthorized
    ? { ssl: true }
    : { ssl: { rejectUnauthorized: false } };
}

/**
 * Opções de conexão (URL ou host/porta/usuário/senha/base).
 * Mesma lógica usada pela app e pelo CLI de migrations.
 */
export type TypeOrmConnectionCredentials =
  | { type: 'postgres'; url: string }
  | { type: 'mysql'; url: string; ssl?: boolean | Record<string, unknown> }
  | {
      type: 'postgres';
      host: string;
      port: number;
      username: string;
      password: string;
      database: string;
    }
  | {
      type: 'mysql';
      host: string;
      port: number;
      username: string;
      password: string;
      database: string;
      ssl?: boolean | Record<string, unknown>;
    };

export function resolveTypeOrmConnectionOptions(
  get: Getter,
): TypeOrmConnectionCredentials {
  const databaseUrl = get('DATABASE_URL')?.trim();
  if (databaseUrl) {
    if (/^postgres(ql)?:\/\//i.test(databaseUrl)) {
      return { type: 'postgres', url: databaseUrl };
    }
    if (/^mariadb:\/\//i.test(databaseUrl)) {
      const url = databaseUrl.replace(/^mariadb:/i, 'mysql:');
      return {
        type: 'mysql',
        url,
        ...resolveMysqlSsl(get, url),
      };
    }
    if (/^mysql:\/\//i.test(databaseUrl)) {
      return {
        type: 'mysql',
        url: databaseUrl,
        ...resolveMysqlSsl(get, databaseUrl),
      };
    }
  }

  const driver = (get('DB_DRIVER') ?? 'mysql').toLowerCase();
  if (driver === 'postgres' || driver === 'postgresql') {
    return {
      type: 'postgres',
      host: get('DB_HOST') ?? 'localhost',
      port: parseInt(get('DB_PORT') ?? '5432', 10),
      username: get('DB_USER') ?? 'condo',
      password: get('DB_PASSWORD') ?? 'condo',
      database: get('DB_NAME') ?? 'condo',
    };
  }

  const host = get('DB_HOST') ?? 'localhost';
  return {
    type: 'mysql',
    host,
    port: parseInt(get('DB_PORT') ?? '3306', 10),
    username: get('DB_USER') ?? 'root',
    password: get('DB_PASSWORD') ?? '',
    database: get('DB_NAME') ?? 'default',
    ...resolveMysqlSsl(
      get,
      host !== 'localhost' && host !== '127.0.0.1' ? host : undefined,
    ),
  };
}
