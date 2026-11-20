/** Map a resource ID in the URL to its actual project before checking RBAC.
 * Request bodies never determine the project for a resource URL.
 */
export async function resolveProjectId(db, params = {}) {
  const q = async (sql, id) => {
    if (!/^\d+$/.test(String(id)) || Number(id) < 1) return null;
    const { rows } = await db.query(sql, [id]);
    return rows[0]?.project_id ?? null;
  };
  if (params.projectId !== undefined) {
    return q('SELECT id AS project_id FROM projects WHERE id=$1 AND aktif=TRUE', params.projectId);
  }
  if (params.templateId !== undefined) {
    return q('SELECT t.project_id FROM templates t JOIN projects p ON p.id=t.project_id WHERE t.id=$1 AND p.aktif=TRUE', params.templateId);
  }
  if (params.aplikasiId !== undefined) {
    return q('SELECT a.project_id FROM aplikasi a JOIN projects p ON p.id=a.project_id WHERE a.id=$1 AND p.aktif=TRUE', params.aplikasiId);
  }
  if (params.sesiId !== undefined) {
    return q('SELECT s.project_id FROM ulo_sesi s JOIN projects p ON p.id=s.project_id WHERE s.id=$1 AND p.aktif=TRUE', params.sesiId);
  }
  return null;
}

export function requireProjectRole(...allowedRoles) {
  return async (req, res, next) => {
    try {
      const projectId = await resolveProjectId(req.db, req.params);
      if (!projectId) return res.status(404).json({error:'Resource/project tidak ditemukan'});
      const { rows } = await req.db.query(
        'SELECT role FROM project_members WHERE user_id=$1 AND project_id=$2',
        [req.user.id, projectId]
      );
      if (!rows.length) return res.status(403).json({error:'Bukan anggota project'});
      if (!allowedRoles.includes(rows[0].role)) {
        return res.status(403).json({error:`Butuh role: ${allowedRoles.join('/')}`});
      }
      req.projectId = projectId;
      req.projectRole = rows[0].role;
      next();
    } catch (error) { next(error); }
  };
}

export const ALL_ROLES = ['ADMIN','TESTER','WITNESS','APPROVER','AUDITOR'];
