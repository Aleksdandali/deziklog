import * as Print from 'expo-print';
import { COLORS } from './constants';
import type { SterilizationCycle } from './types';
import type { SterilizationSession } from './api';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// English packet codes stored in DB → Ukrainian labels for user-facing PDFs.
// Mirrors the picker in app/new-cycle.tsx.
// Keep in sync with PACK_OPTIONS in app/new-cycle.tsx.
const PACKET_LABELS: Record<string, string> = {
  kraft: 'Крафт',
  transparent: 'Прозорий',
  none: 'Без пакета',
};
function packetLabel(code: string | null | undefined): string {
  if (!code) return '--';
  return PACKET_LABELS[code] ?? code;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('uk-UA', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}
function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '--';
  return new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}

/** Photos for a journal row, as base64 data URIs (so the PDF is self-contained). */
export type CyclePhotos = { before?: string | null; after?: string | null };

/** Minimal shape required to build the photos map. */
export interface CycleWithPhotoPaths {
  id: string;
  photo_before_path?: string | null;
  photo_after_path?: string | null;
}

/**
 * Fetch signed URLs for each cycle's before/after photos and inline them as
 * base64 data URIs (so the resulting PDF is self-contained — no network at
 * render time, no signed-URL expiry).
 *
 * Chunked to cap concurrent fetch + FileReader in RAM: a long journal would
 * otherwise fire hundreds of parallel requests at the storage host.
 */
export async function loadCyclePhotos(
  items: CycleWithPhotoPaths[],
  getSignedUrl: (path: string) => Promise<string | null>,
  chunkSize = 6,
): Promise<Map<string, CyclePhotos>> {
  const photos = new Map<string, CyclePhotos>();
  for (let i = 0; i < items.length; i += chunkSize) {
    await Promise.all(items.slice(i, i + chunkSize).map(async (s) => {
      if (!s.photo_before_path && !s.photo_after_path) return;
      const [before, after] = await Promise.all([
        s.photo_before_path ? fetchAsDataUri(s.photo_before_path, getSignedUrl) : null,
        s.photo_after_path ? fetchAsDataUri(s.photo_after_path, getSignedUrl) : null,
      ]);
      if (before || after) photos.set(s.id, { before, after });
    }));
  }
  return photos;
}

async function fetchAsDataUri(
  storagePath: string,
  getSignedUrl: (path: string) => Promise<string | null>,
): Promise<string | null> {
  try {
    const url = await getSignedUrl(storagePath);
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Render the sterilization journal as a PDF matching the column layout of
 * Form №257/о — "Журнал контролю роботи стерилізаторів повітряного, парового
 * (автоклаву)", approved by наказ МОЗ України від 04.01.2001 №1.
 *
 * Note: officially the form must be kept on paper (наказ МОЗ №330 від
 * 05.07.2005). This PDF is a helper for printing — the operator still has to
 * sign the physical journal.
 */
export async function generateJournalPDF(
  cycles: SterilizationCycle[],
  salonName?: string,
  photos?: Map<string, CyclePhotos>,
): Promise<string> {
  const today = new Date().toLocaleDateString('uk-UA', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const emptyThumb = `<div class="thumb empty">—</div>`;

  const rows = cycles.map((c, i) => {
    const startIso = c.started_at || c.created_at;
    const date = fmtDate(startIso);
    const startTime = fmtTime(startIso);
    const endTime = fmtTime(c.ended_at);
    const duration = c.duration_minutes != null ? `${c.duration_minutes} хв` : '--';
    const temp = c.temperature != null ? `${c.temperature}°C` : '--';
    const result = c.result === 'passed' ? 'Пройдено' : 'Не пройдено';
    const resultColor = c.result === 'passed' ? COLORS.success : COLORS.danger;
    const signer = c.employee_name ? escapeHtml(c.employee_name) : '';

    const ph = photos?.get(c.id);
    const beforeImg = ph?.before ? `<img src="${ph.before}" class="thumb" alt="до"/>` : emptyThumb;
    const afterImg = ph?.after ? `<img src="${ph.after}" class="thumb" alt="після"/>` : emptyThumb;
    const photoCell = `
      <div class="photo-pair">
        <div class="photo-col"><div class="photo-label">До</div>${beforeImg}</div>
        <div class="photo-col"><div class="photo-label">Після</div>${afterImg}</div>
      </div>`;

    return `
      <tr>
        <td class="num">${i + 1}</td>
        <td>${date}</td>
        <td>${escapeHtml(c.sterilizer_name)}</td>
        <td>${escapeHtml(c.instrument_name)}</td>
        <td>${escapeHtml(packetLabel(c.packet_type))}</td>
        <td class="num">${startTime}</td>
        <td class="num">${endTime}</td>
        <td class="num">${temp}</td>
        <td class="num">${duration}</td>
        <td>${photoCell}</td>
        <td class="num" style="color:${resultColor};font-weight:600">${result}</td>
        <td class="sign">${signer}</td>
      </tr>
    `;
  }).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        @page { size: A4 landscape; margin: 14mm 10mm; }
        body { font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 10px; color: #1B1B1B; }
        .header { text-align: center; margin-bottom: 12px; border-bottom: 2px solid ${COLORS.brand}; padding-bottom: 10px; }
        .header h1 { font-size: 16px; color: ${COLORS.brand}; margin: 0 0 4px 0; }
        .header .form-id { font-size: 10px; color: #1B1B1B; margin: 2px 0; font-weight: 600; }
        .header .legal { font-size: 9px; color: #6B7280; margin: 2px 0; }
        .header .salon { font-size: 11px; color: #1B1B1B; margin: 4px 0 2px 0; font-weight: 600; }
        .header .meta { font-size: 9px; color: #6B7280; margin: 2px 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 6px; }
        th { background: ${COLORS.brand}; color: white; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.3px; padding: 6px 4px; text-align: left; border: 1px solid #d1d5db; }
        td { padding: 5px 4px; border: 1px solid #e2e4ed; font-size: 9.5px; vertical-align: middle; }
        td.num { text-align: center; }
        td.sign { min-width: 60px; }
        tr:nth-child(even) td { background: #f9f9fb; }
        .photo-pair { display: flex; gap: 4px; align-items: flex-end; justify-content: center; }
        .photo-col { display: flex; flex-direction: column; align-items: center; gap: 2px; }
        .photo-label { font-size: 7px; color: #6B7280; text-transform: uppercase; letter-spacing: 0.3px; }
        .thumb { width: 32px; height: 32px; object-fit: cover; border-radius: 3px; border: 1px solid #e2e4ed; display: block; }
        .thumb.empty { display: flex; align-items: center; justify-content: center; color: #9CA3AF; font-size: 10px; background: #f3f4f6; }
        .footer { margin-top: 14px; font-size: 8px; color: #6B7280; text-align: center; border-top: 1px solid #e2e4ed; padding-top: 6px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Журнал контролю роботи стерилізаторів</h1>
        <p class="form-id">Форма № 257/о</p>
        <p class="legal">Затв. наказом МОЗ України від 04.01.2001 № 1</p>
        ${salonName ? `<p class="salon">${escapeHtml(salonName)}</p>` : ''}
        <p class="meta">Сформовано: ${today} · Записів: ${cycles.length}</p>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:24px">№</th>
            <th style="width:60px">Дата</th>
            <th>Стерилізатор</th>
            <th>Найменування інструментів</th>
            <th style="width:54px">Упаковка</th>
            <th style="width:46px">Початок</th>
            <th style="width:46px">Кінець</th>
            <th style="width:36px">t°C</th>
            <th style="width:48px">Тривалість</th>
            <th style="width:96px">Тест-контроль</th>
            <th style="width:60px">Результат</th>
            <th style="width:80px">Підпис</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <div class="footer">
        Допоміжний друк з Dezik SteriLog · dezik.com.ua · оригінал журналу ведеться на папері згідно з наказом МОЗ № 330 від 05.07.2005
      </div>
    </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });
  return uri;
}

export async function generateCyclePDF(
  sess: SterilizationSession,
  salonName?: string,
  photos?: CyclePhotos,
): Promise<string> {
  const dateSource = sess.started_at || sess.created_at;
  const date = new Date(dateSource).toLocaleDateString('uk-UA', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  const startTime = sess.started_at
    ? new Date(sess.started_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
    : '--';
  const endTime = sess.ended_at
    ? new Date(sess.ended_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
    : '--';

  // Record the SELECTED protocol exposure time — not wall-clock. The app is a
  // photo-fixation journal, not a validated controller; the protocol duration
  // is the professionally meaningful value (exposure at temperature), while the
  // honest start/end timestamps stay in their own rows below.
  const durationLabel = sess.duration_minutes ? `${sess.duration_minutes} хв` : '--';
  const tempLabel = sess.temperature != null ? `${sess.temperature}°C` : '--';

  const passed = sess.result === 'success';
  const resultLabel = passed ? 'Стерилізація успішна' : sess.result === 'fail' ? 'Не пройшла' : '—';
  const resultColor = passed ? COLORS.success : sess.result === 'fail' ? COLORS.danger : COLORS.textSecondary;

  const today = new Date().toLocaleDateString('uk-UA', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const rows: Array<[string, string]> = [
    ['Дата', date],
    ['Початок', startTime],
    ['Кінець', endTime],
    ['Тривалість', durationLabel],
    ['Стерилізатор', sess.sterilizer_name || '--'],
    ['Інструменти', sess.instrument_names || '--'],
    ['Температура', tempLabel],
    ['Пакет', packetLabel(sess.packet_type)],
  ];
  if (sess.pouch_size) rows.push(['Розмір пакета', sess.pouch_size]);
  if (sess.employee_name) rows.push(['Хто стерилізував', sess.employee_name]);

  const rowsHtml = rows
    .map(([k, v]) => `<tr><td class="k">${escapeHtml(k)}</td><td class="v">${escapeHtml(v)}</td></tr>`)
    .join('');

  // Before/after indicator thumbnails, inlined as base64 (self-contained PDF).
  const beforeImg = photos?.before
    ? `<img src="${photos.before}" class="cphoto" alt="до"/>`
    : `<div class="cphoto empty">—</div>`;
  const afterImg = photos?.after
    ? `<img src="${photos.after}" class="cphoto" alt="після"/>`
    : `<div class="cphoto empty">—</div>`;
  const photosBlock = (photos?.before || photos?.after)
    ? `
      <div class="photos">
        <div class="photos-title">Фото індикатора</div>
        <div class="photos-row">
          <div class="photos-col"><div class="photos-label">До</div>${beforeImg}</div>
          <div class="photos-col"><div class="photos-label">Після</div>${afterImg}</div>
        </div>
      </div>`
    : '';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 12px; color: #1B1B1B; padding: 32px; }
        .header { text-align: center; margin-bottom: 24px; border-bottom: 2px solid ${COLORS.brand}; padding-bottom: 14px; }
        .header h1 { font-size: 20px; color: ${COLORS.brand}; margin: 0 0 6px 0; }
        .header .salon { font-size: 13px; color: #1B1B1B; margin: 2px 0; font-weight: 600; }
        .header .meta { font-size: 11px; color: #6B7280; margin: 2px 0; }
        .result-banner { margin: 16px 0 20px 0; padding: 14px; border-radius: 8px; background: ${resultColor}1A; border: 1px solid ${resultColor}; text-align: center; }
        .result-banner .label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #6B7280; margin-bottom: 4px; }
        .result-banner .value { font-size: 16px; font-weight: 700; color: ${resultColor}; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        td { padding: 10px 12px; border-bottom: 1px solid #e2e4ed; font-size: 12px; vertical-align: top; }
        td.k { color: #6B7280; font-weight: 600; width: 38%; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; }
        td.v { color: #1B1B1B; font-weight: 500; }
        .photos { margin-top: 22px; }
        .photos-title { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6B7280; font-weight: 600; margin-bottom: 10px; }
        .photos-row { display: flex; gap: 16px; }
        .photos-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; }
        .photos-label { font-size: 10px; color: #6B7280; text-transform: uppercase; letter-spacing: 0.3px; }
        .cphoto { width: 100%; max-width: 220px; height: 170px; object-fit: cover; border-radius: 8px; border: 1px solid #e2e4ed; display: block; }
        .cphoto.empty { display: flex; align-items: center; justify-content: center; color: #9CA3AF; font-size: 16px; background: #f3f4f6; }
        .footer { margin-top: 28px; font-size: 9px; color: #6B7280; text-align: center; border-top: 1px solid #e2e4ed; padding-top: 10px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Протокол стерилізації</h1>
        ${salonName ? `<p class="salon">${escapeHtml(salonName)}</p>` : ''}
        <p class="meta">Сформовано: ${today}</p>
      </div>
      <div class="result-banner">
        <div class="label">Результат</div>
        <div class="value">${escapeHtml(resultLabel)}</div>
      </div>
      <table>
        <tbody>${rowsHtml}</tbody>
      </table>
      ${photosBlock}
      <div class="footer">
        Згенеровано в Dezik SteriLog · dezik.com.ua · ${today}
      </div>
    </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });
  return uri;
}
