import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function renderPages(pdfPath, outDir, dpi = 300) {
  await fs.mkdir(outDir, { recursive: true });
  const prefix = path.join(outDir, path.basename(pdfPath, '.pdf'));
  await new Promise((resolve, reject) => {
    const p = spawn('pdftoppm', ['-png', '-r', String(dpi), pdfPath, prefix]);
    let err = '';
    p.stderr.on('data', d => err += d);
    p.on('close', c => c === 0 ? resolve() : reject(new Error(err)));
  });
  const files = (await fs.readdir(outDir))
    .filter(f => f.startsWith(path.basename(prefix)) && f.endsWith('.png'))
    .sort();
  return files.map(f => path.join(outDir, f));
}

export async function computeDiff(refPdf, outPdf, workDir) {
  const refDir = path.join(workDir, 'ref');
  const outDir = path.join(workDir, 'out');
  const diffDir = path.join(workDir, 'diff');
  const [refPages, outPages] = await Promise.all([
    renderPages(refPdf, refDir), renderPages(outPdf, outDir)
  ]);
  await fs.mkdir(diffDir, { recursive: true });
  return new Promise((resolve, reject) => {
    const p = spawn('python3', ['scripts/compute-diff.py',
      JSON.stringify({ refPages, outPages, diffDir })]);
    let out = '', err = '';
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => err += d);
    p.on('close', c => c === 0 ? resolve(JSON.parse(out)) : reject(new Error(err)));
  });
}
