import Handlebars from 'handlebars';
import crypto from 'crypto';

export class TemplateRegistry {
  constructor(db) { this.db = db; this.cache = new Map(); }

  async load(projectId, versi = 'latest') {
    const key = `${projectId}:${versi}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const sql = versi === 'latest'
      ? `SELECT * FROM templates WHERE project_id=$1 AND published=TRUE ORDER BY created_at DESC, id DESC LIMIT 1`
      : `SELECT * FROM templates WHERE project_id=$1 AND versi=$2 AND published=TRUE`;
    const params = versi === 'latest' ? [projectId] : [projectId, versi];
    const { rows } = await this.db.query(sql, params);
    if (!rows.length) throw new Error(`Template tidak ditemukan untuk project ${projectId} v${versi}`);
    const tpl = rows[0];
    // Isolate partials: a SIMPEG template must never reuse SIRIKAP partials.
    const engine = Handlebars.create();
    for (const [name, src] of Object.entries(tpl.partials || {})) {
      engine.registerPartial(name, src);
    }
    const compiled = {
      template: engine.compile(tpl.layout_hbs, { noEscape: false }),
      kategoriMap: tpl.kategori_map,
      pageMap: tpl.page_map,
      versi: tpl.versi,
      checksum: tpl.checksum,
      id: tpl.id
    };
    this.cache.set(key, compiled);
    return compiled;
  }

  invalidate(projectId) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${projectId}:`)) this.cache.delete(key);
    }
  }

  static computeChecksum(layoutHbs, partials) {
    return crypto.createHash('sha256')
      .update(layoutHbs + JSON.stringify(partials || {})).digest('hex');
  }
}
