import * as Print from 'expo-print';
import { COLORS } from './constants';
import type { SterilizationCycle } from './types';
import type { SterilizationSession } from './api';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function generateJournalPDF(
  cycles: SterilizationCycle[],
  salonName?: string,
): Promise<string> {
  const today = new Date().toLocaleDateString('uk-UA', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const rows = cycles.map((c, i) => {
    const dateSource = c.started_at || c.created_at;
    const date = new Date(dateSource).toLocaleDateString('uk-UA', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
    const time = new Date(dateSource).toLocaleTimeString('uk-UA', {
      hour: '2-digit', minute: '2-digit',
    });
    const duration = c.duration_minutes ? `${c.duration_minutes} хв` : '--';
    const temp = c.temperature ? `${c.temperature}°C` : '--';
    const result = c.result === 'passed' ? 'Пройдено' : 'Не пройдено';
    const resultColor = c.result === 'passed' ? COLORS.success : COLORS.danger;

    return `
      <tr>
        <td style="text-align:center">${i + 1}</td>
        <td>${date}<br><span style="color:#6B7280;font-size:9px">${time}</span></td>
        <td>${c.sterilizer_name}</td>
        <td>${c.instrument_name}</td>
        <td>${c.packet_type}</td>
        <td style="text-align:center">${temp}</td>
        <td style="text-align:center">${duration}</td>
        <td style="text-align:center;color:${resultColor};font-weight:600">${result}</td>
      </tr>
    `;
  }).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 11px; color: #1B1B1B; padding: 24px; }
        .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid ${COLORS.brand}; padding-bottom: 12px; }
        .header h1 { font-size: 18px; color: ${COLORS.brand}; margin: 0 0 4px 0; }
        .header p { font-size: 11px; color: #6B7280; margin: 2px 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th { background: ${COLORS.brand}; color: white; font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; padding: 8px 6px; text-align: left; }
        td { padding: 6px; border-bottom: 1px solid #e2e4ed; font-size: 10px; vertical-align: top; }
        tr:nth-child(even) { background: #f9f9fb; }
        .footer { margin-top: 24px; font-size: 9px; color: #6B7280; text-align: center; border-top: 1px solid #e2e4ed; padding-top: 8px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Журнал стерилізації</h1>
        ${salonName ? `<p>${salonName}</p>` : ''}
        <p>Сформовано: ${today}</p>
        <p>Записів: ${cycles.length}</p>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:30px">№</th>
            <th style="width:80px">Дата</th>
            <th>Стерилізатор</th>
            <th>Інструменти</th>
            <th>Пакет</th>
            <th style="width:45px">Темп.</th>
            <th style="width:45px">Час</th>
            <th style="width:70px">Результат</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <div class="footer">
        Згенеровано в Dezik Log · dezik.com.ua · ${today}
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

  let actualMinutes: number | null = null;
  if (sess.started_at && sess.ended_at) {
    const diff = new Date(sess.ended_at).getTime() - new Date(sess.started_at).getTime();
    actualMinutes = Math.round(diff / 60000);
  }
  const actualLabel = actualMinutes != null ? `${actualMinutes} хв` : '--';
  const recommendedLabel = sess.duration_minutes ? `${sess.duration_minutes} хв` : '--';
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
    ['Тривалість', `${actualLabel} (рекомендовано ${recommendedLabel})`],
    ['Стерилізатор', sess.sterilizer_name || '--'],
    ['Інструменти', sess.instrument_names || '--'],
    ['Температура', tempLabel],
    ['Пакет', sess.packet_type || '--'],
  ];
  if (sess.pouch_size) rows.push(['Розмір пакета', sess.pouch_size]);
  if (sess.employee_name) rows.push(['Хто стерилізував', sess.employee_name]);

  const rowsHtml = rows
    .map(([k, v]) => `<tr><td class="k">${escapeHtml(k)}</td><td class="v">${escapeHtml(v)}</td></tr>`)
    .join('');

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
      <div class="footer">
        Згенеровано в Dezik SteriLog · dezik.com.ua · ${today}
      </div>
    </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });
  return uri;
}
