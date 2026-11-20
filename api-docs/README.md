# API Docs

Swagger UI: http://localhost:3000/docs
Build: `node scripts/build-openapi.js`
Raw spec: http://localhost:3000/openapi.json

## Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@sirikap.id","password":"password123"}'
```

Gunakan accessToken sebagai Authorization: Bearer <token>.

## Client TypeScript

```bash
npx openapi-typescript-codegen \
  --input public/openapi.json \
  --output admin-ui/src/api/generated \
  --client axios
```
