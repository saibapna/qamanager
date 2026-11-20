#!/usr/bin/env bash
# Jalankan setelah semua file di atas tersalin
set -euo pipefail

echo "▶ Verifikasi struktur..."
for f in package.json Dockerfile docker-compose.yml src/server.js templates/base-layout.hbs; do
  [ -f "$f" ] || { echo "❌ File tidak ada: $f"; exit 1; }
done

echo "▶ Buat direktori kosong..."
mkdir -p output fixtures public data

echo "▶ Build SQL templates seed..."
node scripts/build-template-seed.mjs

echo "▶ Generate hash user seed..."
node scripts/generate-user-seed.mjs 2>/dev/null || echo "⚠️  Butuh npm install dulu untuk generate hash"

echo "▶ Build openapi..."
[ -d node_modules ] && node scripts/build-openapi.js || echo "⚠️  npm install dulu"

echo ""
echo "✅ Setup selesai."
echo ""
echo "Langkah berikut:"
echo "  npm install"
echo "  node scripts/generate-user-seed.mjs  # LOCAL DEMO ONLY"
echo "  node scripts/build-openapi.js"
echo "  docker compose up -d"
echo ""
echo "Akses:"
echo "  API Docs : http://localhost:3000/docs"
echo "  Admin UI : http://localhost:5173"
echo "  Login    : admin@sirikap.id / password123"
