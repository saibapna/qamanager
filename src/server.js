import express from 'express';
import pg from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { promisify } from 'node:util';

import { authRoutes } from './auth/routes.js';
import { requireAuth, requireProjectRole } from './auth/middleware.js';
import { generateULOPdfForSesi } from './generate.js';
import { TemplateRegistry } from './template-registry.js';
import { mountSwagger } from './swagger.js';
import { computeDiff } from './validate/diff.js';

const exec = promisify(spawn);
const dbConfig = {
  host: process.env.PGHOST || 'localhost',
  user: process.env.PGUSER || 'ulo',
  password: process.env.PGPASSWORD || 'ulo_secret',
  database: process.env.PGDATABASE || 'ulo_uat'
};
const db = new pg.Client(dbConfig);
await db.connect();

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use((req, _res, next) => { req.db = db; next(); });
app.use('/api/auth', rateLimit({ windowMs: 60_000, max: 10 }));
app.use('/api', rateLimit({ windowMs: 60_000, max: 100 }));

const upload = multer({ dest: 'output/uploads/' });
const registry = new TemplateRegistry(db);
const UPLOAD_DIR = path.resolve('output');

// Health
app.get('/health', async (_req, res) => {
  try { await db.query('SELECT 1'); res.json({ ok: true, db: 'up', uptime: process.uptime() }); }
  catch (e) { res.status(503).json({ ok: false, error: e.message }); }
});

// Auth
app.use('/api/auth', authRoutes(db));

// Semua route bawah ini butuh login
app.use('/api', requireAuth);

// Projects
app.get('/api/projects', async (req, res) => {
  const { rows } = await db.query(
    `SELECT p.* FROM projects p
     JOIN project_members pm ON pm.project_id = p.id
     WHERE pm.user_id = $1 AND p.aktif = TRUE ORDER BY p.kode`, [req.user.id]);
  res.json(rows);
});

app.post('/api/projects', async (req, res) => {
  const { kode, nama, instansi, bidang } = req.body;
  if (!kode || !nama || !instansi) return res.status(400).json({ error: 'Kode, nama, instansi wajib' });
  const { rows: [p] } = await db.query(
    `INSERT INTO projects (kode, nama, instansi, bidang) VALUES ($1,$2,$3,$4) RETURNING *`,
    [kode, nama, instansi, bidang]);
  await db.query(
    `INSERT INTO project_members (user_id, project_id, role) VALUES ($1,$2,'ADMIN')`,
    [req.user.id, p.id]);
  res.status(201).json(p);
});

app.get('/api/projects/:projectId', requireProjectRole('ADMIN','TESTER','WITNESS','APPROVER','AUDITOR'), async (req, res) => {
  const { rows: [p] } = await db.query('SELECT * FROM projects WHERE id=$1', [req.params.projectId]);
  if (!p) return res.status(404).json({ error: 'Project tidak ditemukan' });
  res.json(p);
});

// Templates
app.get('/api/projects/:projectId/templates', requireProjectRole('ADMIN','TESTER','WITNESS','APPROVER','AUDITOR'), async (req, res) => {
  const { rows } = await db.query(
    'SELECT id, versi, nama, published, checksum, created_at FROM templates WHERE project_id=$1 ORDER BY created_at DESC',
    [req.params.projectId]);
  res.json(rows);
});

app.post('/api/projects/:projectId/templates', requireProjectRole('ADMIN'), async (req, res) => {
  const { versi, nama, layout_hbs, partials, kategori_map, page_map } = req.body;
  if (!versi || !nama || !layout_hbs || !kategori_map || !page_map)
    return res.status(400).json({ error: 'Field wajib belum lengkap' });
  const checksum = TemplateRegistry.computeChecksum(layout_hbs, partials);
  const { rows: [t] } = await db.query(
    `INSERT INTO templates (project_id, versi, nama, layout_hbs, partials, kategori_map, page_map, checksum)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.params.projectId, versi, nama, layout_hbs, partials || {}, kategori_map, page_map, checksum]);
  res.status(201).json(t);
});

app.get('/api/templates/:templateId', requireAuth, async (req, res) => {
  const { rows: [t] } = await db.query('SELECT * FROM templates WHERE id=$1', [req.params.templateId]);
  if (!t) return res.status(404).json({ error: 'Template tidak ditemukan' });
  res.json(t);
});

app.patch('/api/templates/:templateId', requireAuth, async (req, res) => {
  const { rows: [t] } = await db.query('SELECT * FROM templates WHERE id=$1', [req.params.templateId]);
  if (!t) return res.status(404).json({ error: 'Template tidak ditemukan' });
  if (t.published) return res.status(409).json({ error: 'Template published immutable' });
  const allowed = ['nama','layout_hbs','partials','kategori_map','page_map'];
  const updates = []; const values = []; let i = 1;
  for (const k of allowed) {
    if (req.body[k] !== undefined) { updates.push(`${k}=$${i++}`); values.push(req.body[k]); }
  }
  if (req.body.layout_hbs || req.body.partials) {
    const newLayout = req.body.layout_hbs || t.layout_hbs;
    const newPartials = req.body.partials || t.partials;
    updates.push(`checksum=$${i++}`);
    values.push(TemplateRegistry.computeChecksum(newLayout, newPartials));
  }
  if (!updates.length) return res.json(t);
  values.push(req.params.templateId);
  const { rows: [updated] } = await db.query(
    `UPDATE templates SET ${updates.join(',')} WHERE id=$${i} RETURNING *`, values);
  registry.invalidate(t.project_id);
  res.json(updated);
});

app.delete('/api/templates/:templateId', requireAuth, async (req, res) => {
  const { rows: [t] } = await db.query('SELECT project_id, published FROM templates WHERE id=$1', [req.params.templateId]);
  if (!t) return res.status(404).json({ error: 'Template tidak ditemukan' });
  if (t.published) return res.status(409).json({ error: 'Template published tidak dapat dihapus' });
  await db.query('DELETE FROM templates WHERE id=$1', [req.params.templateId]);
  registry.invalidate(t.project_id);
  res.status(204).end();
});

app.post('/api/templates/:templateId/publish', requireAuth, async (req, res) => {
  const { rows: [t] } = await db.query(
    'UPDATE templates SET published=TRUE WHERE id=$1 AND published=FALSE RETURNING *',
    [req.params.templateId]);
  if (!t) return res.status(404).json({ error: 'Template tidak ditemukan atau sudah published' });
  registry.invalidate(t.project_id);
  res.json(t);
});

app.post('/api/templates/:templateId/fixtures', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File wajib' });
  const buf = await fs.readFile(req.file.path);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  const finalPath = path.join(UPLOAD_DIR, 'fixtures', `${req.params.templateId}-${Date.now()}.pdf`);
  await fs.mkdir(path.dirname(finalPath), { recursive: true });
  await fs.rename(req.file.path, finalPath);
  const { rows: [fx] } = await db.query(
    `INSERT INTO template_fixtures (template_id, nama, pdf_path, sha256)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [req.params.templateId, req.file.originalname, finalPath, sha]);
  res.status(201).json(fx);
});

// Aplikasi
app.get('/api/projects/:projectId/aplikasi', requireAuth, async (req, res) => {
  const { rows } = await db.query('SELECT * FROM aplikasi WHERE project_id=$1 ORDER BY nama_singkat',
    [req.params.projectId]);
  res.json(rows);
});

app.post('/api/projects/:projectId/aplikasi', requireProjectRole('ADMIN','TESTER'), async (req, res) => {
  const { nama_singkat, nama_panjang, url } = req.body;
  const { rows: [a] } = await db.query(
    `INSERT INTO aplikasi (project_id, nama_singkat, nama_panjang, url)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [req.params.projectId, nama_singkat, nama_panjang, url]);
  res.status(201).json(a);
});

// Sesi
app.get('/api/aplikasi/:aplikasiId/sesi', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM ulo_sesi WHERE aplikasi_id=$1 ORDER BY created_at DESC', [req.params.aplikasiId]);
  res.json(rows);
});

app.post('/api/aplikasi/:aplikasiId/sesi', requireProjectRole('ADMIN','TESTER'), async (req, res) => {
  const { template_id, hari, tanggal, pukul, tempat, jenis,
    penguji_nama, penguji_jabatan, penguji_email, penguji_telp, penguji_nip,
    saksi_nama, saksi_jabatan, saksi_email, saksi_telp, catatan, temuan } = req.body;
  const { rows: [s] } = await db.query(
    `INSERT INTO ulo_sesi (aplikasi_id, template_id, hari, tanggal, pukul, tempat, jenis,
       penguji_nama, penguji_jabatan, penguji_email, penguji_telp, penguji_nip,
       saksi_nama, saksi_jabatan, saksi_email, saksi_telp, catatan, temuan)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     RETURNING *`,
    [req.params.aplikasiId, template_id, hari, tanggal, pukul, tempat, jenis,
     penguji_nama, penguji_jabatan, penguji_email, penguji_telp, penguji_nip,
     saksi_nama, saksi_jabatan, saksi_email, saksi_telp, catatan, temuan]);
  res.status(201).json(s);
});

app.get('/api/sesi/:sesiId', requireAuth, async (req, res) => {
  const { rows: [s] } = await db.query('SELECT * FROM ulo_sesi WHERE id=$1', [req.params.sesiId]);
  if (!s) return res.status(404).json({ error: 'Sesi tidak ditemukan' });
  const { rows: items } = await db.query(
    'SELECT * FROM ulo_item WHERE sesi_id=$1 ORDER BY urutan', [req.params.sesiId]);
  const ringkasan = {
    total: items.length,
    lulus: items.filter(i => i.status === 'PASS').length,
    gagal: items.filter(i => i.status === 'FAIL').length,
    belum: items.filter(i => i.status === 'BELUM').length
  };
  res.json({ ...s, items, ringkasan });
});

app.put('/api/sesi/:sesiId/items', requireProjectRole('ADMIN','TESTER'), async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items wajib array' });
  await db.query('DELETE FROM ulo_item WHERE sesi_id=$1', [req.params.sesiId]);
  for (const it of items) {
    await db.query(
      `INSERT INTO ulo_item (sesi_id, no, kategori, kebutuhan, hasil, status, urutan)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [req.params.sesiId, it.no, it.kategori, it.kebutuhan, it.hasil, it.status, it.urutan]);
  }
  res.json({ ok: true, count: items.length });
});

app.post('/api/sesi/:sesiId/pdf', requireProjectRole('ADMIN','TESTER','APPROVER'), async (req, res) => {
  const { rows: [s] } = await db.query(
    `SELECT s.*, a.project_id FROM ulo_sesi s
     JOIN aplikasi a ON a.id = s.aplikasi_id WHERE s.id=$1`, [req.params.sesiId]);
  if (!s) return res.status(404).json({ error: 'Sesi tidak ditemukan' });
  const outPath = path.join(UPLOAD_DIR, `project-${s.project_id}`, `ulo-${req.params.sesiId}.pdf`);
  try {
    const result = await generateULOPdfForSesi({ db, sesiId: Number(req.params.sesiId), outPath, registry });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="ulo-${req.params.sesiId}.pdf"`);
    res.setHeader('X-Checksum-SHA256', result.sha256);
    res.send(await fs.readFile(outPath));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/sesi/:sesiId/finalize', requireProjectRole('ADMIN','APPROVER'), async (req, res) => {
  const { rows: [s] } = await db.query(
    `UPDATE ulo_sesi SET status='FINAL' WHERE id=$1 AND status='DRAFT' RETURNING *`,
    [req.params.sesiId]);
  if (!s) return res.status(404).json({ error: 'Sesi tidak ditemukan atau sudah final' });
  res.json(s);
});

// Validate & Diff
app.post('/api/templates/:templateId/validate', requireAuth, async (req, res) => {
  const { output } = req.body;
  const { rows: [fx] } = await db.query(
    `SELECT pdf_path FROM template_fixtures WHERE template_id=$1 ORDER BY created_at DESC LIMIT 1`,
    [req.params.templateId]);
  if (!fx) return res.status(404).json({ error: 'Fixture baseline tidak ada' });
  try {
    const { stdout } = await exec('python3', ['scripts/validate.py', fx.pdf_path, output]);
    res.json({ ok: true, log: stdout });
  } catch (e) {
    res.status(422).json({ ok: false, log: e.stdout || e.message });
  }
});

app.post('/api/templates/:templateId/diff', requireAuth, async (req, res) => {
  const { outputPath } = req.body;
  const { rows: [fx] } = await db.query(
    `SELECT pdf_path FROM template_fixtures WHERE template_id=$1 ORDER BY created_at DESC LIMIT 1`,
    [req.params.templateId]);
  if (!fx) return res.status(404).json({ error: 'Fixture baseline tidak ada' });
  const workDir = path.join(UPLOAD_DIR, 'diff', String(req.params.templateId), String(Date.now()));
  await fs.mkdir(workDir, { recursive: true });
  try {
    const result = await computeDiff(fx.pdf_path, outputPath, workDir);
    const rel = (p) => `/api/diff-file/${path.relative(UPLOAD_DIR, p)}`;
    result.pages = result.pages.map(p => ({
      ...p, refUrl: rel(p.ref), outUrl: rel(p.out), heatmapUrl: rel(p.heatmap)
    }));
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.use('/api/diff-file', express.static(UPLOAD_DIR));

// Swagger
mountSwagger(app);

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`🚀 API on :${PORT} (docs: /docs)`));
