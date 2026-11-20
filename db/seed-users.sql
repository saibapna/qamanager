-- Jalankan: node scripts/generate-user-seed.mjs untuk mengisi file ini dengan hash asli
-- Placeholder (hash untuk password "password123" akan di-generate otomatis)
INSERT INTO users (email, nama, password_hash) VALUES
  ('admin@sirikap.id',   'Admin SIRIKAP',   '$argon2id$v=19$m=19456,t=2,p=4$M1JPHObmgO8MuE/1VR3wAw$pjFam9eYlEb1TnOlsydq3aLGyAdAcX/dyGDL5ruGMr8'),
  ('tester@sirikap.id',  'Tester SIRIKAP',  '$argon2id$v=19$m=19456,t=2,p=4$e2Zm7Iu3CcijFKD7l/HLAw$oisq1rHCogqpJW+w9JTQPrp09tTmBut4OXbSjQpvtLs'),
  ('witness@sirikap.id', 'Saksi SIRIKAP',   '$argon2id$v=19$m=19456,t=2,p=4$9XEj28ga1TdKn96CY+fjDg$Nw2NR6ykumk2IZnMYCSdBohTqAoUOBaPu7Ysn8Rwtzw'),
  ('admin@simpeg.id',    'Admin SIMPEG',    '$argon2id$v=19$m=19456,t=2,p=4$YsZ9osnTuMgxX45MZfEFaw$CZwpgEVNVNw5oy4vyXAGlLW0kdLyqQfhG1H+0+XuKmI'),
  ('tester@simpeg.id',   'Tester SIMPEG',   '$argon2id$v=19$m=19456,t=2,p=4$0wx1l6WVWXQMNodZ+/Kntg$mzglMtOzoiIJ/+stnH+qnI3KhZ+jVmAe2G1onC7x2jg');

INSERT INTO project_members (user_id, project_id, role)
SELECT u.id, p.id, 'ADMIN' FROM users u, projects p
WHERE u.email='admin@sirikap.id' AND p.kode='SIRIKAP';
INSERT INTO project_members (user_id, project_id, role)
SELECT u.id, p.id, 'TESTER' FROM users u, projects p
WHERE u.email='tester@sirikap.id' AND p.kode='SIRIKAP';
INSERT INTO project_members (user_id, project_id, role)
SELECT u.id, p.id, 'WITNESS' FROM users u, projects p
WHERE u.email='witness@sirikap.id' AND p.kode='SIRIKAP';
INSERT INTO project_members (user_id, project_id, role)
SELECT u.id, p.id, 'ADMIN' FROM users u, projects p
WHERE u.email='admin@simpeg.id' AND p.kode='SIMPEG';
INSERT INTO project_members (user_id, project_id, role)
SELECT u.id, p.id, 'TESTER' FROM users u, projects p
WHERE u.email='tester@simpeg.id' AND p.kode='SIMPEG';
