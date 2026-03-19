import * as Print from 'expo-print';
import { COLORS } from './constants';
import type { SterilizationCycle } from './types';

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
