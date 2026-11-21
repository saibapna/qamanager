/** Explicit shared-template catalog. Never expose a source project's UAT sessions,
 * evidence, fixtures or PDF outputs. Import creates a separate unpublished copy.
 */
export function installTemplateSharingRoutes(app, { q, first, guard, id, fail, audit, atomic, publishLive, json }) {
  app.get('/api/templates/:templateId/share', async c => {
    const projectId = await guard(c, 'templateId');
    const templateId = id(c.req.param('templateId'));
    const found = await first(c,
      'SELECT template_id,shared_at FROM template_shares WHERE template_id=$1 AND project_id=$2',
      [templateId, projectId]);
    return c.json({ shared: !!found, shared_at: found?.shared_at || null });
  });

  app.post('/api/templates/:templateId/share', async c => {
    const projectId = await guard(c, 'templateId', ['ADMIN']);
    const templateId = id(c.req.param('templateId'));
    const result = await atomic(c, async () => {
      const source = await first(c,
        'SELECT t.id FROM templates t JOIN projects p ON p.id=t.project_id WHERE t.id=$1 AND t.project_id=$2 AND t.published=TRUE AND p.aktif=TRUE',
        [templateId, projectId]);
      if (!source) fail(409, 'Hanya template published dari proyek aktif yang dapat dibagikan');
      const inserted = await first(c,
        'INSERT INTO template_shares(template_id,project_id,shared_by) VALUES($1,$2,$3) ON CONFLICT (template_id) DO NOTHING RETURNING template_id,shared_at',
        [templateId, projectId, c.get('uid')]);
      if (inserted) await audit(c, 'TEMPLATE_SHARED', 'template', templateId, {source_project_id:projectId});
      return {shared:true,shared_at:inserted?.shared_at || null};
    });
    await publishLive(c, 'TEMPLATE_SHARED');
    return c.json(result);
  });

  app.delete('/api/templates/:templateId/share', async c => {
    const projectId = await guard(c, 'templateId', ['ADMIN']);
    const templateId = id(c.req.param('templateId'));
    const result = await atomic(c, async () => {
      const removed = await first(c,
        'DELETE FROM template_shares WHERE template_id=$1 AND project_id=$2 RETURNING template_id',
        [templateId, projectId]);
      if (removed) await audit(c, 'TEMPLATE_UNSHARED', 'template', templateId, {source_project_id:projectId});
      return {shared:false};
    });
    await publishLive(c, 'TEMPLATE_UNSHARED');
    return c.json(result);
  });

  app.get('/api/projects/:projectId/shared-templates', async c => {
    const projectId = await guard(c, 'projectId', ['ADMIN']);
    const records = await q(c, `SELECT t.id,t.nama,t.versi,t.checksum,t.created_at,
        p.kode AS source_project_code, p.nama AS source_project_name,
        sh.shared_at
      FROM template_shares sh
      JOIN templates t ON t.id=sh.template_id AND t.project_id=sh.project_id
      JOIN projects p ON p.id=t.project_id
      WHERE t.published=TRUE AND p.aktif=TRUE AND t.project_id<>$1
      ORDER BY sh.shared_at DESC,t.id DESC LIMIT 100`, [projectId]);
    return c.json(records.rows);
  });

  app.post('/api/projects/:projectId/templates/import', async c => {
    const projectId = await guard(c, 'projectId', ['ADMIN']);
    const data = await json(c);
    const sourceId = id(data?.source_template_id);
    const version = typeof data?.versi === 'string'
      ? data.versi.trim() : 's' + String(sourceId);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$/.test(version)) {
      fail(400, 'Versi template wajib 1-20 karakter: huruf, angka, titik, garis atau underscore');
    }
    const cloned = await atomic(c, async () => {
      // Lock the opted-in share while copying, so revocation cannot race the import.
      // Only the template document is read: no UAT rows, evidence, fixture or PDF.
      const source = await first(c, `SELECT t.id,t.project_id,t.nama,t.versi,t.layout_hbs,
          t.partials,t.kategori_map,t.page_map,t.checksum
        FROM template_shares sh
        JOIN templates t ON t.id=sh.template_id AND t.project_id=sh.project_id
        JOIN projects p ON p.id=t.project_id
        WHERE sh.template_id=$1 AND t.project_id<>$2
          AND t.published=TRUE AND p.aktif=TRUE
        FOR SHARE OF sh,t`, [sourceId,projectId]);
      if (!source) fail(404, 'Template bersama tidak tersedia atau izin berbagi dicabut');
      const imported = await first(c, `INSERT INTO templates(
          project_id,versi,nama,layout_hbs,partials,kategori_map,page_map,checksum,published
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,FALSE)
        RETURNING id,project_id,versi,nama,published,checksum,created_at`, [
        projectId,version,('Salinan: '+source.nama).slice(0,255),
        source.layout_hbs,JSON.stringify(source.partials),
        JSON.stringify(source.kategori_map),JSON.stringify(source.page_map),
        source.checksum
      ]);
      await audit(c, 'TEMPLATE_IMPORTED', 'template', imported.id, {
        source_template_id:source.id,source_project_id:source.project_id,
        source_version:source.versi,source_checksum:source.checksum,
        independent_draft:true,fixtures_copied:false
      });
      return imported;
    });
    await publishLive(c, 'TEMPLATE_IMPORTED');
    return c.json(cloned, 201);
  });
}
