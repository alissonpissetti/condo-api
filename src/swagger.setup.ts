import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Express } from 'express';

const LOGO_FILENAME = 'logo-big.png';

/**
 * OpenAPI + Swagger UI em `/docs`.
 * Serve `/logo-big.png` a partir da raiz do projeto (cwd), se o ficheiro existir.
 */
export function setupSwagger(app: INestApplication): void {
  const logoPath = join(process.cwd(), LOGO_FILENAME);
  const hasLogo = existsSync(logoPath);
  const port = process.env.PORT ?? '3000';
  const serverUrl =
    process.env.SWAGGER_SERVER_URL?.replace(/\/$/, '') ??
    `http://localhost:${port}`;

  const expressApp = app.getHttpAdapter().getInstance() as Express;
  if (hasLogo) {
    expressApp.get('/logo-big.png', (_req, res) => {
      res.sendFile(logoPath);
    });
  }

  const config = new DocumentBuilder()
    .setTitle('Condo API')
    .setDescription(
      'API de gestão condominal: registo e login (JWT), condomínios do utilizador, agrupamentos (blocos) e unidades.',
    )
    .setVersion('1.0')
    .addServer(serverUrl)
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'Obtenha o token em POST /auth/login. Cabeçalho: Authorization: Bearer seguido do token.',
      },
      'JWT',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);

  const logoBarCss = hasLogo
    ? `
.swagger-ui .topbar {
  background-color: #f8f9fa;
  background-image: url('/logo-big.png');
  background-repeat: no-repeat;
  background-position: 16px center;
  background-size: auto 40px;
  padding-left: min(200px, 28vw);
  min-height: 56px;
  border-bottom: 1px solid #e9ecef;
}
.swagger-ui .topbar .download-url-wrapper { max-width: 100%; }
`
    : '';

  SwaggerModule.setup('docs', app, document, {
    customSiteTitle: 'Condo API — Documentação',
    customfavIcon: hasLogo ? '/logo-big.png' : undefined,
    customCss: `
${logoBarCss}
.swagger-ui .topbar-wrapper { align-items: center; }
`,
    explorer: true,
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
      showRequestDuration: true,
    },
  });
}
