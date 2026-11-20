-- Audit-driven indexes for foreign-key delete and join paths.
-- Additive, safe to rerun; no existing row changes.
CREATE INDEX IF NOT EXISTS idx_approvals_actor ON ulo_uat.ulo_approvals(actor_id);
CREATE INDEX IF NOT EXISTS idx_approvals_project ON ulo_uat.ulo_approvals(project_id);
CREATE INDEX IF NOT EXISTS idx_defect_comments_actor ON ulo_uat.ulo_defect_comments(actor_id);
CREATE INDEX IF NOT EXISTS idx_defect_comments_defect ON ulo_uat.ulo_defect_comments(defect_id);
CREATE INDEX IF NOT EXISTS idx_defects_creator ON ulo_uat.ulo_defects(created_by);
CREATE INDEX IF NOT EXISTS idx_defects_owner ON ulo_uat.ulo_defects(owner_id);
CREATE INDEX IF NOT EXISTS idx_defects_project ON ulo_uat.ulo_defects(project_id);
CREATE INDEX IF NOT EXISTS idx_evidence_project ON ulo_uat.ulo_evidence(project_id);
CREATE INDEX IF NOT EXISTS idx_evidence_sesi ON ulo_uat.ulo_evidence(sesi_id);
CREATE INDEX IF NOT EXISTS idx_evidence_uploader ON ulo_uat.ulo_evidence(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_item_events_actor ON ulo_uat.ulo_item_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_item_events_project ON ulo_uat.ulo_item_events(project_id);
CREATE INDEX IF NOT EXISTS idx_retests_actor ON ulo_uat.ulo_retests(actor_id);
CREATE INDEX IF NOT EXISTS idx_retests_defect ON ulo_uat.ulo_retests(defect_id);
