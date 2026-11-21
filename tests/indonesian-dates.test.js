import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDateIndonesia, weekdayIndonesia, formatHariTanggal,
  weekdayMismatch, formatTimestampWib, formatPukulWib
} from '../src/utils/indonesian-dates.js';

test('DATE-only is rendered as an Indonesian calendar date, without visitor timezone drift', () => {
  assert.equal(formatDateIndonesia('2026-11-18'), '18 November 2026');
  assert.equal(formatDateIndonesia('2026-11-18T00:00:00.000Z'), '18 November 2026');
  assert.equal(formatHariTanggal('2026-11-18'), 'Rabu, 18 November 2026');
  assert.equal(formatDateIndonesia('2026-09-20'), '20 September 2026');
  assert.equal(formatDateIndonesia('2026-04-15'), '15 April 2026');
});

test('discrepant day of the original BA is flagged, never silently corrected', () => {
  assert.equal(weekdayIndonesia('2026-09-20'), 'Minggu');
  assert.equal(weekdayMismatch('Selasa', '2026-09-20'), true);
  assert.equal(weekdayMismatch('Jum’at', '2026-04-15'), true);
  assert.equal(weekdayMismatch("Jum'at", '2026-04-17'), false);
  assert.equal(weekdayMismatch('Rabu', '2026-11-18'), false);
  assert.equal(weekdayMismatch('', '2026-11-18'), false);
});

test('timestamp is normalized to WIB and not machine local time', () => {
  assert.equal(formatTimestampWib('2026-11-21T11:41:49Z'), '21 November 2026, 18.41 WIB');
  assert.equal(formatTimestampWib('2026-11-21 11:41:49+00'), '21 November 2026, 18.41 WIB');
  assert.equal(formatTimestampWib('2026-11-21T18:41:49+07:00'), '21 November 2026, 18.41 WIB');
  assert.equal(formatTimestampWib('2026-11-21'), '—');
  assert.equal(formatPukulWib('9:00'), '09.00 WIB');
  assert.equal(formatPukulWib('09:00'), '09.00 WIB');
  assert.equal(formatPukulWib('11.00'), '11.00 WIB');
});

test('malformed dates stay invalid rather than rolling forward', () => {
  for (const value of ['2026-02-30','2026-13-01','15/04/26','invalid','']) {
    assert.equal(formatDateIndonesia(value), '—');
  }
  assert.equal(formatDateIndonesia(null), '—');
  assert.equal(formatTimestampWib('invalid'), '—');
});
