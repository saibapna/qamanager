#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { parseArgs } from 'node:util';
import pg from 'pg';

const { values: args } = parseArgs({
  options: {
    'sesi-id': { type: 'string' },
    'db-config': { type: 'string', default: 'db.json' },
    output: { type: 'string', default: 'data/ulo.json' },
    pretty: { type: 'boolean', default: true }
  }
});

async function main() {
  if (!args['sesi-id']) throw new Error('--sesi-id wajib');
  const cfg = JSON.parse(await fs.readFile(args['db-config'], 'utf-8'));
  const db = new pg.Client(cfg);
  await db.connect();
  try {
    const { rows: [sesi] } = await db.query(
      `SELECT s.*, a.nama_singkat, a.nama_panjang, a.url,
              p.id AS project_id, p.nama AS project_nama, p.instansi, p.bidang,
              t.id AS template_id, t.versi AS template_versi, t.kategori_map, t.page_map
       FROM ulo_sesi s
       JOIN aplikasi a ON a.id = s.aplikasi_id
       JOIN projects p ON p.id = a.project_id
       JOIN templates t ON t.id = s.template_id
       WHERE s.id = $1`, [args['sesi-id']]);
    if (!sesi) throw new Error('Sesi tidak ditemukan');
    const { rows: items } = await db.query(
      `SELECT no, kategori, kebutuhan, hasil, status, urutan
       FROM ulo_item WHERE sesi_id = $1 ORDER BY urutan`, [args['sesi-id']]);
    const data = buildDataBinding({ sesi, items });
    await fs.mkdir(path.dirname(args.output), { recursive: true });
    await fs.writeFile(args.output, args.pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data));
    console.log('✅ Migrasi selesai:', args.output);
  } finally { await db.end(); }
}

function buildDataBinding({ sesi, items }) {
  const pageMap = typeof sesi.page_map === 'string' ? JSON.parse(sesi.page_map) : sesi.page_map;
  const kategoriMap = typeof sesi.kategori_map === 'string' ? JSON.parse(sesi.kategori_map) : sesi.kategori_map;
  const byCat = {};
  for (const it of items) (byCat[it.kategori] ||= []).push(it);
  const pages = [];
  const pageNumbers = Object.keys(pageMap).map(Number).sort((a, b) => a - b);
  for (const pn of pageNumbers) {
    const spec = pageMap[pn]; const rows = [];
    for (const cat of spec.categories) {
      const catItems = byCat[cat] || [];
      if (!catItems.length) continue;
      rows.push({ isSection: true, text: kategoriMap[cat] || cat });
      for (const it of catItems) {
        if (spec.lastNo && it.no > spec.lastNo) continue;
        if (spec.excludeNos?.includes(it.no)) continue;
        rows.push({ no: it.no, kebutuhan: it.kebutuhan, hasil: it.hasil });
      }
    }
    pages.push({ pageNumber: pn, isLastPage: pn === pageNumbers[pageNumbers.length - 1], rows });
  }
  return {
    project: { instansi: sesi.instansi, bidang: sesi.bidang,
      kode_form_1: 'S-APP.2.OBJ.3', kode_form_2: 'S-APP.2.OBJ.4',
      kode_form_3: 'S-APP.2.OBJ.5', form_title: 'Form Uji Aplikasi' },
    skpd: { nama: sesi.project_nama, kota: sesi.instansi },
    aplikasi: { nama_singkat: sesi.nama_singkat, nama_panjang: sesi.nama_panjang, url: sesi.url },
    sesi: { hari: sesi.hari, tanggal: sesi.tanggal, pukul: sesi.pukul, tempat: sesi.tempat, jenis: sesi.jenis },
    penguji: { nama: sesi.penguji_nama, jabatan: sesi.penguji_jabatan,
      email: sesi.penguji_email, telp: sesi.penguji_telp, nip: sesi.penguji_nip },
    saksi: { nama: sesi.saksi_nama, jabatan: sesi.saksi_jabatan,
      email: sesi.saksi_email, telp: sesi.saksi_telp },
    ringkasan: {
      total: items.length,
      lulus: items.filter(i => i.status === 'PASS').length,
      gagal: items.filter(i => i.status === 'FAIL').length,
      belum: items.filter(i => i.status === 'BELUM').length,
      catatan: sesi.catatan || '', temuan: sesi.temuan || ''
    },
    pages
  };
}
main().catch(e => { console.error('❌', e.message); process.exit(1); });
