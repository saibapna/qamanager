/** Assign each test item to exactly one physical result page.
 * Use inclusive integer order boundaries rather than string comparisons on IDs.
 */
export function paginateItems(items, pageMap, kategoriMap = {}) {
  if (!pageMap || typeof pageMap !== 'object') throw new Error('page_map tidak valid');
  const pageNumbers = Object.keys(pageMap).map(Number).sort((a, b) => a - b);
  if (!pageNumbers.length || pageNumbers.some(n => !Number.isInteger(n) || n < 2)) {
    throw new Error('page_map harus memiliki halaman hasil bernomor >= 2');
  }
  const sorted = [...items].sort((a, b) => Number(a.urutan) - Number(b.urutan));
  const unique = new Set();
  const pages = pageNumbers.map((pn, i) => {
    const spec = pageMap[pn];
    if (!spec || typeof spec !== 'object') throw new Error(`page_map ${pn} tidak valid`);
    let selected;
    if (Number.isInteger(spec.fromOrder) && Number.isInteger(spec.toOrder)) {
      selected = sorted.filter(it => Number(it.urutan) >= spec.fromOrder && Number(it.urutan) <= spec.toOrder);
    } else if (Array.isArray(spec.categories)) {
      // Legacy maps are supported, but they must still cover each item once.
      const last = spec.lastNo ? sorted.find(it => it.no === spec.lastNo) : null;
      if (spec.lastNo && !last) throw new Error(`lastNo ${spec.lastNo} tidak ditemukan`);
      selected = sorted.filter(it => spec.categories.includes(it.kategori) &&
        (!last || Number(it.urutan) <= Number(last.urutan)) &&
        !spec.excludeNos?.includes(it.no));
    } else {
      throw new Error(`page_map ${pn} harus memiliki fromOrder/toOrder atau categories`);
    }
    const rows = [];
    let lastCat = null;
    for (const it of selected) {
      if (unique.has(it.no)) throw new Error(`Item ${it.no} muncul lebih dari sekali dalam page_map`);
      unique.add(it.no);
      if (it.kategori !== lastCat) {
        rows.push({ isSection: true, text: kategoriMap[it.kategori] || it.kategori });
        lastCat = it.kategori;
      }
      rows.push({ no: it.no, kebutuhan: it.kebutuhan, hasil: it.hasil || '', status: it.status });
    }
    return { pageNumber: pn, isLastPage: i === pageNumbers.length - 1, rows };
  });
  if (unique.size !== items.length) {
    const missing = sorted.filter(it => !unique.has(it.no)).map(it => it.no);
    throw new Error(`page_map tidak mencakup ${missing.length} item: ${missing.join(', ')}`);
  }
  return pages;
}
