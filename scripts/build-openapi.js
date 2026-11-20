#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import SwaggerParser from '@apidevtools/swagger-parser';

const SRC = path.resolve('api-docs/openapi.yaml');
const OUT = path.resolve('public/openapi.json');

const raw = await fs.readFile(SRC, 'utf-8');
const parsed = YAML.parse(raw);
const bundled = await SwaggerParser.bundle(parsed);
await SwaggerParser.validate(bundled);
await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(bundled, null, 2));
console.log('✅ OpenAPI valid:', OUT);
