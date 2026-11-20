import swaggerUi from 'swagger-ui-express';
import fs from 'node:fs';
import path from 'node:path';

export function mountSwagger(app, { basePath = '/docs' } = {}) {
  const specPath = path.resolve('public', 'openapi.json');
  if (!fs.existsSync(specPath)) {
    console.warn('⚠️  openapi.json belum dibuild. Jalankan: node scripts/build-openapi.js');
    return;
  }
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf-8'));
  app.use(basePath, swaggerUi.serve, swaggerUi.setup(spec, {
    customSiteTitle: 'ULO/UAT Manager API',
    swaggerOptions: { persistAuthorization: true, displayRequestDuration: true, filter: true }
  }));
  app.get('/openapi.json', (_req, res) => res.sendFile(specPath));
  console.log(`📖 Swagger UI: http://localhost:3000${basePath}`);
}
