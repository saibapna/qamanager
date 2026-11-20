#!/usr/bin/env node
import fs from 'node:fs/promises';
const parts=[
  'db/schema.sql','db/schema-auth.sql',
  'db/seed-projects.sql','db/seed-templates.sql',
  'db/seed-sirikap-items.sql','db/seed-simpeg-items.sql'
];
let sql='-- ULO/UAT Manager bootstrap for an EMPTY private ulo_uat schema.\n';
sql+='-- Intentionally omits db/seed-users.sql (insecure public demo accounts).\n\n';
for(const part of parts)sql+=`\n-- SOURCE: ${part}\n`+await fs.readFile(part,'utf8')+'\n';
await fs.writeFile('db/supabase-bootstrap.sql',sql);
console.log(`db/supabase-bootstrap.sql: ${sql.length} chars`);
