// Explicit, conservative bounded-bytea policy while Cloudflare R2 is not enabled.
// Tombstoned evidence continues counting toward physical storage until an approved
// retention + backup process safely purges it.
const MiB = 1024 * 1024;
export const PRIVATE_STORAGE_LIMITS = Object.freeze({
  evidenceFile: 4 * MiB,
  evidenceItemCount: 10,
  evidenceSessionBytes: 64 * MiB,
  evidenceProjectBytes: 256 * MiB,
  fixtureFile: 5 * MiB,
  fixtureTemplateCount: 10,
  fixtureProjectBytes: 100 * MiB,
  pdfOutput: 6 * MiB,
  pdfSessionCount: 20,
  pdfProjectBytes: 256 * MiB,
});

export function wouldExceedQuota(used, additional, limit) {
  const values = [used, additional, limit].map(Number);
  if (values.some(v => !Number.isSafeInteger(v) || v < 0) || values[2] === 0) {
    throw new Error('Invalid private storage quota accounting');
  }
  // Avoid integer overflow and allow a file exactly at the remaining capacity.
  return values[0] > values[2] || values[1] > values[2] - values[0];
}

export function storageMiB(bytes) {
  return (Number(bytes) / MiB).toFixed(1) + ' MiB';
}
