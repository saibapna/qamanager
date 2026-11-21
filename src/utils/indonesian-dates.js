/** Kalender Indonesia untuk nilai DATE (tanpa timezone) dan TIMESTAMPTZ (WIB).
 * Tidak mengubah data sumber, terutama hari yang mungkin salah di lampiran resmi.
 */
const dateFormatter = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
});
const timestampFormatter = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});
const weekdays = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/** Interpret DATE by its calendar components, never by the visitor's timezone. */
function dateOnly(value) {
  if (value == null || value === '') return null;
  let text;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    text = value.toISOString().slice(0, 10);
  } else if (typeof value === 'string') {
    text = value.trim();
  } else {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})(?=$|T| )/.exec(text);
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d;
}

/** Formats a SQL DATE as "18 November 2026", even in UTC-12 / UTC+14. */
export function formatDateIndonesia(value) {
  const d = dateOnly(value);
  return d ? dateFormatter.format(d) : '—';
}

/** Actual Gregorian weekday; does not overwrite the weekday supplied by a signed form. */
export function weekdayIndonesia(value) {
  const d = dateOnly(value);
  return d ? weekdays[d.getUTCDay()] : '—';
}

export function formatHariTanggal(value) {
  const d = dateOnly(value);
  return d ? weekdays[d.getUTCDay()] + ', ' + dateFormatter.format(d) : '—';
}

function canonicalWeekday(value) {
  return String(value || '').trim().toLocaleLowerCase('id-ID')
    .replace(/['’`\-\s.]/g, '');
}

/** Used only to flag inconsistency between source form and calendar, not to edit it. */
export function weekdayMismatch(sourceDay, isoDate) {
  const expected = weekdayIndonesia(isoDate);
  return expected !== '—' && !!String(sourceDay || '').trim() &&
    canonicalWeekday(sourceDay) !== canonicalWeekday(expected);
}

/** A timestamp with explicit zone is rendered in Asia/Jakarta, never visitor-local time. */
export function formatTimestampWib(value) {
  let date;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'string') {
    const original = value.trim();
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ]\d{2}:\d{2}/.test(original) ||
        !/(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(original)) return '—';
    const iso = original.replace(' ', 'T')
      .replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
      .replace(/([+-]\d{2})$/, '$1:00');
    date = new Date(iso);
  } else return '—';
  if (!Number.isFinite(date.getTime())) return '—';
  const parts = Object.fromEntries(
    timestampFormatter.formatToParts(date).map(({ type, value }) => [type, value])
  );
  return parts.day + ' ' + parts.month + ' ' + parts.year + ', ' +
    parts.hour + '.' + parts.minute + ' WIB';
}

export function formatPukulWib(value) {
  if (typeof value !== 'string') return '—';
  const match = /^(\d{1,2})[:.](\d{2})$/.exec(value.trim());
  if (!match) return value.trim() || '—';
  const h = Number(match[1]), m = Number(match[2]);
  if (h > 23 || m > 59) return value.trim();
  return String(h).padStart(2, '0') + '.' + match[2] + ' WIB';
}
