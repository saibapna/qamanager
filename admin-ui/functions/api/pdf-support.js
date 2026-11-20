import { renderSafeHandlebars } from './safe-handlebars.js';
import { PDFDocument } from 'pdf-lib';
import { createHash } from 'node:crypto';
import { paginateItems } from '../../../src/layout/page-map.js';
import { runAtomic } from './workflow-core.js';

const MAX_FIXTURE_BYTES = 5 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 6 * 1024 * 1024;
const MAX_OUTPUTS_PER_SESSION = 20;

const hashPdf = bytes => createHash('sha256').update(bytes).digest('hex');
const isPdf = bytes => bytes.length > 100 &&
  String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-';
const formatSize = size => (size / (1024 * 1024)).toFixed(2) + ' MiB';

function safePdfResponse(bytes, filename) {
  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(bytes.length),
      'Content-Disposition': 'attachment; filename="' + filename + '"',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function normalizePdfData(value) {
  if (value instanceof Uint8Array) return value;
  if (typeof value === 'string' && value.startsWith('\\x')) return Uint8Array.from(Buffer.from(value.slice(2), 'hex'));
  return null;
}

async function pdfInfo(bytes, fail) {
  if (!bytes || !isPdf(bytes)) fail(400, 'Berkas bukan PDF yang valid');
  try {
    const document = await PDFDocument.load(bytes, { updateMetadata: false });
    const pageCount = document.getPageCount();
    if (pageCount < 1 || pageCount > 200) fail(422, 'PDF harus memiliki 1-200 halaman');
    const pages = document.getPages().map(page => {
      const { width, height } = page.getSize();
      return { width: Math.round(width * 100) / 100, height: Math.round(height * 100) / 100 };
    });
    return { pageCount, pages };
  } catch (error) {
    if (error?.status) throw error;
    fail(422, 'PDF rusak, terenkripsi, atau tidak didukung');
  }
}

function buildHtml({ sesi, tpl, items, fail }) {
  let pages;
  try { pages = paginateItems(items, tpl.page_map, tpl.kategori_map); }
  catch (error) { fail(422, 'page_map template tidak sesuai data UAT: ' + String(error.message).slice(0, 220)); }
  const total = items.length;
  const lulus = items.filter(x => x.status === 'PASS').length;
  const gagal = items.filter(x => x.status === 'FAIL').length;
  const belum = items.filter(x => x.status === 'BELUM').length;
  const binding = {
    project: {
      instansi: sesi.instansi,
      bidang: sesi.bidang,
      kode_form_1: 'S-APP.2.OBJ.3',
      kode_form_2: 'S-APP.2.OBJ.4',
      kode_form_3: 'S-APP.2.OBJ.5',
      form_title: 'Form Uji Aplikasi'
    },
    skpd: { nama: sesi.project_nama, kota: sesi.instansi },
    aplikasi: { nama_singkat: sesi.nama_singkat, nama_panjang: sesi.nama_panjang, url: sesi.url },
    sesi: { hari: sesi.hari, tanggal: sesi.tanggal, pukul: sesi.pukul, tempat: sesi.tempat, jenis: sesi.jenis },
    penguji: {
      nama: sesi.penguji_nama, jabatan: sesi.penguji_jabatan,
      email: sesi.penguji_email, telp: sesi.penguji_telp, nip: sesi.penguji_nip
    },
    saksi: {
      nama: sesi.saksi_nama, jabatan: sesi.saksi_jabatan,
      email: sesi.saksi_email, telp: sesi.saksi_telp
    },
    ringkasan: { total, lulus, gagal, belum, catatan: sesi.catatan || '', temuan: sesi.temuan || '' },
    pages
  };
  let html;
  try { html=renderSafeHandlebars(tpl.layout_hbs,binding,tpl.partials||{}); }
  catch(error){ fail(422,'Gagal merender template: '+String(error.message).slice(0,180)); }
  // The Chromium renderer must not issue arbitrary subrequests based on template HTML.
  const csp = '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; img-src data:; font-src data:; form-action &#39;none&#39;; base-uri &#39;none&#39;">';
  if (!/<head[^>]*>/i.test(html)) fail(422, 'Layout PDF wajib memiliki elemen <head>');
  html = html.replace(/<head([^>]*)>/i, '<head$1>' + csp);
  if (html.length > 2_000_000) fail(413, 'HTML hasil template terlalu besar');
  return html;
}

export function installPdfRoutes(app, { q, first, guard, id, fail, audit }) {
  // Stored PDFs are private. A project-scoped JWT is mandatory for all file endpoints.
  app.get('/api/templates/:templateId/fixtures', async c => {
    await guard(c, 'templateId');
    const tid = id(c.req.param('templateId'));
    const result = await q(c,
      'SELECT id,template_id,nama,pdf_path,sha256,size_bytes,page_count,created_at FROM template_fixtures WHERE template_id=$1 ORDER BY created_at DESC,id DESC',
      [tid]);
    return c.json(result.rows);
  });

  app.post('/api/templates/:templateId/fixtures', async c => {
    await guard(c, 'templateId', ['ADMIN']);
    const tid = id(c.req.param('templateId'));
    const ct = c.req.header('content-type') || '';
    if (!ct.toLowerCase().startsWith('multipart/form-data')) fail(415, 'Upload harus multipart/form-data');
    const form = await c.req.formData().catch(() => fail(400, 'Upload tidak valid'));
    const file = form.get('file');
    if (!file || typeof file.arrayBuffer !== 'function' || file.size <= 0 || file.size > MAX_FIXTURE_BYTES) {
      fail(413, 'Fixture harus PDF berukuran maksimal ' + formatSize(MAX_FIXTURE_BYTES));
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const info = await pdfInfo(bytes, fail);
    const digest = hashPdf(bytes);
    const path = 'fixtures/template-' + tid + '/' + crypto.randomUUID() + '.pdf';
    const name = String(file.name || 'baseline.pdf').replace(/[^\w .()-]/g, '_').slice(0, 120);
    const fixture = await runAtomic(sql => q(c, sql), async () => {
      const inserted = await first(c,
        'INSERT INTO template_fixtures(template_id,nama,pdf_path,sha256,pdf_data,size_bytes,page_count) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,template_id,nama,pdf_path,sha256,size_bytes,page_count,created_at',
        [tid, name, path, digest, Buffer.from(bytes), bytes.length, info.pageCount]);
      await audit(c, 'FIXTURE_UPLOADED', 'template_fixture', inserted.id, { template_id: tid, size_bytes: bytes.length, sha256: digest });
      return inserted;
    });
    return c.json(fixture, 201);
  });

  app.get('/api/templates/:templateId/fixtures/:fixtureId/download', async c => {
    await guard(c, 'templateId');
    const tid = id(c.req.param('templateId'));
    const fid = id(c.req.param('fixtureId'));
    const data = await first(c,
      'SELECT pdf_data FROM template_fixtures WHERE template_id=$1 AND id=$2',
      [tid, fid]);
    const bytes = normalizePdfData(data?.pdf_data);
    if (!bytes) fail(404, 'Fixture tidak ditemukan');
    return safePdfResponse(bytes, 'fixture-template-' + tid + '-' + fid + '.pdf');
  });

  app.post('/api/sesi/:sesiId/pdf', async c => {
    const projectId = await guard(c, 'sesiId', ['ADMIN', 'TESTER']);
    const sid = id(c.req.param('sesiId'));
    if (!c.env.BROWSER?.quickAction) fail(503, 'Binding Cloudflare Browser Run belum dikonfigurasi');
    const sesi = await first(c,
      'SELECT s.*, a.nama_singkat,a.nama_panjang,a.url,p.nama AS project_nama,p.instansi,p.bidang FROM ulo_sesi s JOIN aplikasi a ON a.id=s.aplikasi_id JOIN projects p ON p.id=s.project_id WHERE s.id=$1',
      [sid]);
    const tpl = await first(c,
      'SELECT layout_hbs,partials,kategori_map,page_map,published FROM templates WHERE id=$1 AND project_id=$2',
      [sesi.template_id, projectId]);
    if (!tpl?.published) fail(409, 'Template sesi belum published');
    const items = (await q(c,
      'SELECT no,kategori,kebutuhan,hasil,status,urutan FROM ulo_item WHERE sesi_id=$1 ORDER BY urutan', [sid])).rows;
    if (!items.length) fail(422, 'Belum ada item UAT untuk sesi ini');
    const count = await first(c, 'SELECT count(*)::int AS count FROM ulo_output WHERE sesi_id=$1', [sid]);
    if (count.count >= MAX_OUTPUTS_PER_SESSION) fail(409, 'Batas ' + MAX_OUTPUTS_PER_SESSION + ' dokumen PDF per sesi tercapai');
    const html = buildHtml({ sesi, tpl, items, fail });
    let render;
    try { render = await c.env.BROWSER.quickAction('pdf', { html }); }
    catch (error) {
      console.error('qamanager_pdf_renderer', error?.message || 'Browser Run error');
      fail(503, 'Browser Run tidak dapat menghasilkan PDF. Periksa kuota Browser Run');
    }
    if (!render || typeof render.arrayBuffer !== 'function' || !render.ok) {
      console.error('qamanager_pdf_renderer_response', render?.status || 'invalid response');
      fail(502, 'Browser Run gagal mengembalikan PDF');
    }
    const data = new Uint8Array(await render.arrayBuffer());
    if (data.length > MAX_OUTPUT_BYTES) fail(413, 'PDF melebihi batas ' + formatSize(MAX_OUTPUT_BYTES));
    const info = await pdfInfo(data, fail);
    const digest = hashPdf(data);
    // Advisory lock serializes version allocation; the browser call is made outside this transaction.
    await q(c, 'BEGIN');
    let saved;
    try {
      await q(c, 'SELECT pg_advisory_xact_lock(177013,$1)', [sid]);
      const latest = await first(c, 'SELECT coalesce(max(versi),0)+1 AS next_version FROM ulo_output WHERE sesi_id=$1', [sid]);
      const version = Number(latest.next_version);
      if (version > MAX_OUTPUTS_PER_SESSION) fail(409, 'Batas versi PDF sesi tercapai');
      const path = 'output/project-' + projectId + '/sesi-' + sid + '-v' + version + '.pdf';
      saved = await first(c,
        'INSERT INTO ulo_output(sesi_id,versi,pdf_path,sha256,size_bytes,page_count,pdf_data) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,versi,pdf_path,sha256,size_bytes,page_count',
        [sid, version, path, digest, data.length, info.pageCount, Buffer.from(data)]);
      await audit(c, 'PDF_GENERATED', 'sesi', sid, { output_id: saved.id, versi: version });
      await q(c, 'COMMIT');
    } catch (error) {
      await q(c, 'ROLLBACK');
      throw error;
    }
    return safePdfResponse(data, 'ulo-sesi-' + sid + '-v' + saved.versi + '.pdf');
  });

  app.get('/api/sesi/:sesiId/outputs/:outputId/download', async c => {
    await guard(c, 'sesiId');
    const sid = id(c.req.param('sesiId'));
    const oid = id(c.req.param('outputId'));
    const file = await first(c, 'SELECT pdf_data,versi FROM ulo_output WHERE id=$1 AND sesi_id=$2', [oid, sid]);
    const bytes = normalizePdfData(file?.pdf_data);
    if (!bytes) fail(404, 'PDF keluaran tidak ditemukan');
    return safePdfResponse(bytes, 'ulo-sesi-' + sid + '-v' + file.versi + '.pdf');
  });

  async function compare(c, kind) {
    const projectId = await guard(c, 'templateId');
    const tid = id(c.req.param('templateId'));
    const input = await c.req.json().catch(() => fail(400, 'JSON tidak valid'));
    const requested = String(input?.outputPath || input?.output || '').trim();
    if (!requested || requested.length > 500) fail(400, 'Path PDF keluaran wajib');
    const output = await first(c,
      'SELECT o.id,o.sha256,o.pdf_data,o.page_count,o.pdf_path FROM ulo_output o JOIN ulo_sesi s ON s.id=o.sesi_id WHERE o.pdf_path=$1 AND s.template_id=$2 AND s.project_id=$3',
      [requested, tid, projectId]);
    if (!output?.pdf_data) fail(404, 'Output PDF untuk template ini tidak ditemukan');
    const fixture = await first(c,
      'SELECT id,sha256,pdf_data,page_count FROM template_fixtures WHERE template_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1',
      [tid]);
    if (!fixture?.pdf_data) fail(404, 'Upload fixture PDF baseline terlebih dahulu');
    const identical = output.sha256 === fixture.sha256;
    const outPages = Number(output.page_count) || (await pdfInfo(normalizePdfData(output.pdf_data), fail)).pageCount;
    const refPages = Number(fixture.page_count) || (await pdfInfo(normalizePdfData(fixture.pdf_data), fail)).pageCount;
    const bothPages = Math.max(outPages, refPages);
    if (kind === 'validate') {
      return c.json({
        ok: identical,
        method: 'sha256_exact_bytes',
        log: 'Metode: kecocokan byte PDF (SHA-256), bukan SSIM visual.\\n' +
          'Baseline: ' + refPages + ' halaman. Output: ' + outPages + ' halaman.\\n' +
          (identical ? 'File PDF identik sampai tingkat byte.' : 'File PDF tidak identik. Perbedaan byte tidak selalu berarti perbedaan visual.')
      });
    }
    const pages = Array.from({ length: bothPages }, (_, i) => ({
      page: i + 1,
      ok: identical && i < outPages && i < refPages
    }));
    return c.json({
      allPass: identical,
      method: 'sha256_exact_bytes',
      description: identical ? 'PDF identik byte-per-byte.' : 'PDF berbeda secara byte; heatmap/SSIM visual belum tersedia.',
      pages,
      baselineUrl: '/api/templates/' + tid + '/fixtures/' + fixture.id + '/download',
      outputUrl: '/api/sesi/' + (await first(c, 'SELECT sesi_id FROM ulo_output WHERE id=$1', [output.id])).sesi_id + '/outputs/' + output.id + '/download'
    });
  }

  app.post('/api/templates/:templateId/validate', async c => compare(c, 'validate'));
  app.post('/api/templates/:templateId/diff', async c => compare(c, 'diff'));
}
