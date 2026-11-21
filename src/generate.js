import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { TemplateRegistry } from './template-registry.js';
import { paginateItems } from './layout/page-map.js';

export async function generateULOPdfForSesi({ db, sesiId, outPath, registry }) {
  registry ||= new TemplateRegistry(db);

  const { rows: [sesi] } = await db.query(
    `SELECT s.*, a.nama_singkat, a.nama_panjang, a.url,
            p.id AS project_id, p.nama AS project_nama, p.instansi, p.bidang,
            t.versi AS template_versi
     FROM ulo_sesi s
     JOIN aplikasi a ON a.id = s.aplikasi_id
     JOIN projects p ON p.id = a.project_id
     JOIN templates t ON t.id = s.template_id
     WHERE s.id = $1`, [sesiId]
  );
  if (!sesi) throw new Error(`Sesi ${sesiId} tidak ditemukan`);

  const { rows: items } = await db.query(
    `SELECT no, kategori, kebutuhan, hasil, status, urutan
     FROM ulo_item WHERE sesi_id = $1 ORDER BY urutan`, [sesiId]
  );

  const tpl = await registry.load(sesi.project_id, sesi.template_versi);
  const data = buildDataBinding({ sesi, items, tpl });
  const html = tpl.template(data);

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath.replace(/\.pdf$/, '.html'), html, 'utf-8');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none']
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.evaluateHandle('document.fonts.ready');
    await page.pdf({
      path: outPath, format: 'A4', printBackground: true,
      margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' },
      displayHeaderFooter: false, preferCSSPageSize: true
    });
  } finally {
    await browser.close();
  }

  const buf = await fs.readFile(outPath);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  return { path: outPath, sha256: sha, size: buf.length, templateVersi: tpl.versi };
}

function buildDataBinding({ sesi, items, tpl }) {
  const pages = paginateItems(items, tpl.pageMap, tpl.kategoriMap);
  const total = items.length;
  const lulus = items.filter(i => i.status === 'PASS').length;
  const gagal = items.filter(i => i.status === 'FAIL').length;
  const belum = items.filter(i => i.status === 'BELUM').length;

  const kind=String(sesi.jenis||'');
  const hasUat=/UAT|User Acceptance|Beta Test/i.test(kind);
  const hasUlo=/ULO|Uji Layak Operasi/i.test(kind);
  const formKind=hasUat&&hasUlo?'ULO/UAT':hasUat?'UAT':'ULO';
  return {
    penerbit: { dinas:'Dinas Komunikasi, Informatika dan Persandian Aceh', bidang:'Bidang Layanan E-Government' },
    dokumen: {
      jenis: formKind, totalPages: pages.length+1,
      showSummaryFirst: pages.length>=4, showSummaryFinal: pages.length>=4,
      signatureNotice: 'Ruang tanda tangan bukan bukti tanda tangan digital tersertifikasi atau persetujuan.'
    },
    project: {
      instansi: sesi.instansi, bidang: sesi.bidang,
      kode_form_1: 'S-APP.2.OBJ.3', kode_form_2: 'S-APP.2.OBJ.4',
      kode_form_3: 'S-APP.2.OBJ.5', form_title: 'Form Uji Aplikasi'
    },
    skpd: { nama: sesi.instansi || sesi.project_nama, kota: sesi.kota_kab_prov || '' },
    aplikasi: { nama_singkat: sesi.nama_singkat, nama_panjang: sesi.nama_panjang, url: sesi.url },
    sesi: { hari: sesi.hari, tanggal: sesi.tanggal, pukul: sesi.pukul, tempat: sesi.tempat, jenis: sesi.jenis },
    penguji: {
      nama: sesi.penguji_nama, jabatan: sesi.penguji_jabatan,
      email: sesi.penguji_email, telp: sesi.penguji_telp, nip: sesi.penguji_nip
    },
    saksi: {
      nama: sesi.saksi_nama, jabatan: sesi.saksi_jabatan,
      email: sesi.saksi_email, telp: sesi.saksi_telp, nip: sesi.saksi_nip || ''
    },
    ringkasan: { total, lulus, gagal, belum, catatan: sesi.catatan || '', temuan: sesi.temuan || '' },
    pages
  };
}

// CLI mode (single project, untuk testing manual)
if (import.meta.url === `file://${process.argv[1]}`) {
  const fs = await import('node:fs/promises');
  const dataPath = process.argv[2] || 'data/sample-sirikap.json';
  const outPath = process.argv[3] || 'output/hasil-ulo.pdf';
  const data = JSON.parse(await fs.readFile(dataPath, 'utf-8'));
  const Handlebars = (await import('handlebars')).default;
  const tplSrc = await fs.readFile('templates/base-layout.hbs', 'utf-8');
  const headerSrc = await fs.readFile('templates/partials/header.hbs', 'utf-8');
  Handlebars.registerPartial('header', headerSrc);
  const html = Handlebars.compile(tplSrc)(data);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const puppeteer = (await import('puppeteer')).default;
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.pdf({ path: outPath, format: 'A4', printBackground: true, preferCSSPageSize:true,
    margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' } });
  await browser.close();
  console.log('✅ PDF:', outPath);
}
