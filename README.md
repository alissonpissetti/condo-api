# condo-api

API NestJS (MVP) para condomínios: autenticação JWT, condomínios (somente dono), agrupamentos aninhados e unidades.

## Documentação OpenAPI (Swagger)

- **UI:** `GET /docs` (ex.: [http://localhost:3000/docs](http://localhost:3000/docs) com `PORT=3000`)
- **JSON:** `GET /docs-json` (especificação para importar em Postman, etc.)

Coloque **`logo-big.png`** na **raiz do projeto** (junto a `package.json`) para o Swagger usar como favicon e imagem na barra superior. Sem o ficheiro, a documentação funciona na mesma.

Opcional no `.env`: **`SWAGGER_SERVER_URL`** (ex. `https://api.teudominio.com`) para alinhar o servidor predefinido no Swagger com o ambiente público.

## Pré-requisitos

- Node.js 18+
- Banco **MySQL/MariaDB** (ou PostgreSQL, se a `DATABASE_URL` for `postgres://` / `postgresql://`)
- Docker (opcional, para MariaDB local via `docker-compose.yml`)

## Configuração

1. Defina a conexão no `.env`. A forma recomendada é **`DATABASE_URL`** com esquema `mysql://` ou `mariadb://` (internamente usa o driver `mysql2`). Exemplo:

```env
DATABASE_URL=mysql://usuario:senha@host:porta/nome_do_banco
```

Se a senha contiver caracteres reservados em URL (`@`, `:`, `/`, `#`, espaços, etc.), use [percent-encoding](https://developer.mozilla.org/en-US/docs/Glossary/Percent-encoding) na parte de usuário/senha da URL.

**MySQL e TLS:** servidores com `require_secure_transport=ON` exigem conexão cifrada. Para hosts remotos na `DATABASE_URL` (FQDN ou IPv4 que não seja `127.0.0.1`), a API ativa TLS automaticamente. Para desligar: `DATABASE_SSL=false`. Se aparecer erro de certificado, use `DATABASE_SSL_REJECT_UNAUTHORIZED=false` (menos seguro; prefira confiar na CA correta em produção).

2. (Opcional) Subir MariaDB local:

```bash
docker compose up -d
```

Nesse caso pode usar, por exemplo:  
`DATABASE_URL=mysql://condo:condo@127.0.0.1:3306/condo`

3. Copiar variáveis de ambiente:

```bash
cp .env.example .env
```

Ajuste `JWT_SECRET` em produção. Sem `DATABASE_URL`, a API usa **MySQL** com as variáveis `DB_HOST`, `DB_PORT` (padrão `3306`), `DB_USER`, `DB_PASSWORD`, `DB_NAME`. Para PostgreSQL sem URL, defina `DB_DRIVER=postgres` e use porta `5432` nos `DB_*`.

**Sincronização do schema (`synchronize`):** por omissão fica **ligada em desenvolvimento** (`NODE_ENV` diferente de `production`) e **desligada em produção**. Defina `DB_SYNCHRONIZE=false` no `.env` quando passar a usar só **migrations**, para o TypeORM não competir com o DDL versionado.

### Migrations (TypeORM)

Com o `.env` apontando para o banco (mesma `DATABASE_URL` da API):

```bash
npm run migration:show
npm run migration:run
# npm run migration:revert   # desfaz a última migration
```

A migration inicial cria as tabelas `users`, `condominiums`, `groupings` e `units` (MySQL/MariaDB ou PostgreSQL, conforme o driver da URL). Se o schema já existir (por exemplo criado antes com `synchronize: true`), alinhe o estado do banco ou use uma base vazia antes de `migration:run`, para não haver conflito de nomes de tabelas.

4. Instalar dependências e rodar em desenvolvimento:

```bash
npm install
npm run start:dev
```

A API escuta na porta definida em `PORT` (padrão `3000`). Em produção (`NODE_ENV=production`), o `synchronize` do TypeORM fica desligado por omissão; use migrations e, se quiser, `DB_SYNCHRONIZE=false` também em desenvolvimento.

## Exemplos com curl

Registrar usuário:

```bash
curl -s -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@example.com","password":"password12"}'
```

Login (guarde o token retornado):

```bash
curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@example.com","password":"password12"}'
```

Criar condomínio (substitua `TOKEN` pelo `access_token`):

```bash
curl -s -X POST http://localhost:3000/condominiums \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"name":"Residencial Alpha"}'
```

Na criação, um agrupamento padrão **Geral** é criado em transação.

## Rotas principais

| Método | Caminho | Auth |
|--------|---------|------|
| GET | `/docs` | Não (Swagger UI) |
| GET | `/docs-json` | Não (OpenAPI JSON) |
| GET | `/invitations/:token` | Não (pré-visualizar convite) |
| POST | `/invitations/accept/:token` | Não (aceitar convite + criar conta) |
| GET | `.../units/:unitId/people/candidate` | JWT (pesquisa CPF/email) |
| POST | `.../units/:unitId/people/assign` | JWT (associar ou convidar) |
| POST | `/auth/register` | Não |
| POST | `/auth/login` | Não |
| CRUD | `/condominiums` | JWT (dono) |
| CRUD | `/condominiums/:condominiumId/groupings` | JWT (dono) |
| CRUD | `/condominiums/:condominiumId/groupings/:groupingId/units` | JWT (dono) |

### Proprietário e responsável por unidade

Cada unidade pode ter **proprietário** e **responsável** (pessoas distintas, por exemplo inquilino).

1. **Pesquisa (JWT):** `GET .../condominiums/:condominiumId/groupings/:groupingId/units/:unitId/people/candidate?cpf=` e/ou `&email=`.
2. **Associar ou convidar (JWT):** `POST .../people/assign` com corpo `{ "role": "owner" | "responsible" | "both", "cpf"?: "...", "email"?: "...", "fullName"?: "..." }`.  
   - Se existir **pessoa** ou **utilizador** com o CPF/email, a unidade é atualizada na hora.  
   - Se **não existir**, o campo **`email` é obrigatório**: cria-se a ficha `people`, gera-se convite e envia-se e-mail (a unidade só é atualizada quando o convite for aceite).  
3. **Convite (público):** `GET /invitations/:token` (pré-visualização) e `POST /invitations/accept/:token` com `{"password":"...","fullName":"..."?}` — cria utilizador, liga à ficha e aplica os papéis na unidade.

Configure `INVITE_PUBLIC_URL` para o URL do **frontend** de cadastro (o email inclui `?inviteToken=...`). Sem SMTP (`SMTP_HOST`), o link é registado nos **logs** da API.

Não é possível apagar o último agrupamento de um condomínio.

**Migration:** `npm run migration:run` aplica `1744500000000-unit-persons-invitations` (tabelas `people`, `unit_invitations`, colunas nas `units`).

## Scripts

- `npm run build` — compila para `build/`
- `npm run start:dev` — modo watch
- `npm run test` — testes unitários

