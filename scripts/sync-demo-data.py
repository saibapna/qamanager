#!/usr/bin/env python3
"""Regenerate offline JSON PDF fixtures from canonical SQL item seeds."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ROW = re.compile(r"\('((?:[^']|'')*)','((?:[^']|'')*)','((?:[^']|'')*)','((?:[^']|'')*)','(PASS|FAIL|BELUM)',(\d+)\)")
CATEGORIES = {
 'SIRIKAP': ['AKSES & DASHBOARD','PARAMETER - DAFTAR OPD','PARAMETER - KECAMATAN','PARAMETER - GAMPONG','PARAMETER - URUSAN','INOVASI DAERAH - DAFTAR & INDIKATOR','INOVASI DAERAH - TAMBAH','KELITBANGAN & LAPORAN','UTILITY - PENGGUNA & GROUP','UTILITY - OTORITAS & PENGATURAN','NAVIGASI & LAINNYA','GATE ULO YANG BELUM TERBUKTI'],
 'SIMPEG': ['AUTENTIKASI & OTORISASI','DATA PEGAWAI','MUTASI & PROMOSI','ABSENSI','LAPORAN KEPEGAWAIAN','UTILITY']
}
for project in ('SIRIKAP','SIMPEG'):
    raw = (ROOT / 'db' / f'seed-{project.lower()}-items.sql').read_text()
    items = []
    for match in ROW.finditer(raw):
        no, cat, kebutuhan, hasil, status, urutan = match.groups()
        items.append(dict(no=no.replace("''", "'"), kategori=cat, kebutuhan=kebutuhan.replace("''", "'"), hasil=hasil.replace("''", "'"), status=status, urutan=int(urutan)))
    assert len(items) == 71 and [r['urutan'] for r in items] == list(range(1,72)), (project,len(items))
    source = ROOT / 'data' / f'sample-{project.lower()}.json'
    if source.exists():
        data = json.loads(source.read_text())
    else:
        data = {
            'project': {'instansi':'Badan Kepegawaian Daerah Provinsi Aceh','bidang':'Bidang Pengembangan Aplikasi',
              'kode_form_1':'S-APP.2.OBJ.3','kode_form_2':'S-APP.2.OBJ.4','kode_form_3':'S-APP.2.OBJ.5','form_title':'Form Uji Aplikasi'},
            'skpd': {'nama':'SIMPEG - Sistem Informasi Kepegawaian','kota':'Provinsi Aceh'},
            'aplikasi': {'nama_singkat':'SIMPEG','nama_panjang':'Sistem Informasi Kepegawaian Provinsi Aceh','url':'https://simpeg.acehprov.go.id/'},
            'sesi': {'hari':'Kamis','tanggal':'19 November 2026','pukul':'10:00','tempat':'Pengujian daring','jenis':'Uji Layak Operasi (ULO)'},
            'penguji': {'nama':'Rina Marlina, S.Kom','jabatan':'Analis Sistem Informasi','email':'rina@acehprov.go.id','telp':'','nip':'19900101 202001 2 001'},
            'saksi':{'nama':'','jabatan':'','email':'','telp':''},
            'ringkasan':{'catatan':'Pengujian fungsional modul kepegawaian.','temuan':'Temuan: ekspor laporan mutasi belum lengkap.'}
        }
    prev = data.get('ringkasan',{})
    data['ringkasan'] = {
      'total':len(items),'lulus':sum(i['status']=='PASS' for i in items),
      'gagal':sum(i['status']=='FAIL' for i in items),'belum':sum(i['status']=='BELUM' for i in items),
      'catatan':prev.get('catatan',''),'temuan':prev.get('temuan','')
    }
    pages=[]
    mapping=dict(zip('ABCDEFGHIJKL', CATEGORIES[project]))
    for page_no, start, end in ((2,1,18),(3,19,36),(4,37,54),(5,55,71)):
        rows=[]; last_cat=None
        for item in items[start-1:end]:
            if last_cat != item['kategori']:
                rows.append({'isSection':True,'text':mapping[item['kategori']]})
                last_cat=item['kategori']
            rows.append({key:item[key] for key in ('no','kebutuhan','hasil','status')})
        pages.append({'pageNumber':page_no,'isLastPage':page_no==5,'rows':rows})
    data['pages']=pages
    source.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    print(f'{project}: {len(items)} items; {data["ringkasan"]}')
