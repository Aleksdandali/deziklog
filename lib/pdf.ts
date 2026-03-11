import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { Cycle, UserProfile } from './types';

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return iso;
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export async function generateSterilizationPDF(
  cycles: Cycle[],
  profile: UserProfile,
  period: string
) {
  const completedCycles = cycles.filter((c) => c.status === 'completed');

  const html = `
    <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body { font-family: -apple-system, Helvetica, sans-serif; padding: 40px; color: #1b1b1b; font-size: 12px; }
        h1 { color: #4b569e; font-size: 20px; margin: 0 0 4px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 2px solid #eceef5; padding-bottom: 16px; }
        .salon-name { font-size: 16px; font-weight: 700; }
        .period { color: #6b7280; font-size: 11px; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th { background: #eceef5; color: #4b569e; padding: 8px 6px; text-align: left; font-size: 10px; font-weight: 600; }
        td { padding: 7px 6px; border-bottom: 1px solid #e5e7eb; font-size: 10px; }
        tr:nth-child(even) td { background: #f8f9fc; }
        .passed { color: #43A047; font-weight: 600; }
        .failed { color: #E53935; font-weight: 600; }
        .footer { margin-top: 40px; color: #9ca3af; font-size: 9px; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 12px; }
        .signature { margin-top: 24px; }
        .signature-line { border-top: 1px solid #1b1b1b; width: 200px; display: inline-block; margin-top: 24px; }
        .stats { display: flex; gap: 16px; margin: 12px 0; }
        .stat-box { background: #eceef5; border-radius: 8px; padding: 8px 12px; }
        .stat-num { font-size: 18px; font-weight: 700; color: #4b569e; }
        .stat-label { font-size: 9px; color: #6b7280; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="salon-name">${profile.salonName || 'Dezik Log'}</div>
          ${profile.salonAddress ? `<div style="color:#6b7280;font-size:11px;margin-top:2px;">${profile.salonAddress}</div>` : ''}
          ${profile.name ? `<div style="color:#6b7280;font-size:11px;">Відповідальна особа: ${profile.name}</div>` : ''}
        </div>
        <div style="text-align:right;">
          <h1>Журнал стерилізації</h1>
          <div class="period">${period}</div>
        </div>
      </div>

      <div class="stats">
        <div class="stat-box">
          <div class="stat-num">${completedCycles.length}</div>
          <div class="stat-label">Всього циклів</div>
        </div>
        <div class="stat-box">
          <div class="stat-num" style="color:#43A047">${completedCycles.filter(c => c.indicatorResult === 'passed').length}</div>
          <div class="stat-label">Успішних</div>
        </div>
        <div class="stat-box">
          <div class="stat-num" style="color:#E53935">${completedCycles.filter(c => c.indicatorResult === 'failed').length}</div>
          <div class="stat-label">Невдалих</div>
        </div>
      </div>

      <table>
        <tr>
          <th>№</th>
          <th>Дата</th>
          <th>Час початку</th>
          <th>Стерилізатор</th>
          <th>Режим</th>
          <th>Інструменти</th>
          <th>Результат</th>
        </tr>
        ${completedCycles.map((c, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${formatDate(c.startedAt)}</td>
            <td>${formatTime(c.startedAt)}</td>
            <td>${c.sterilizerName || '—'}</td>
            <td>${c.temperature}°C / ${c.durationMinutes} хв</td>
            <td>${c.instruments || '—'}</td>
            <td class="${c.indicatorResult || ''}">${c.indicatorResult === 'passed' ? '✓ Спрацював' : c.indicatorResult === 'failed' ? '✗ Не спрацював' : '—'}</td>
          </tr>
        `).join('')}
      </table>

      <div class="signature">
        <p>Відповідальна особа: ${profile.name || '___________________________'}</p>
        <div class="signature-line"></div>
        <span style="font-size:10px;color:#9ca3af;"> (підпис)</span>
      </div>

      <div class="footer">Згенеровано в Dezik Log by DEZIK · dezik.com.ua</div>
    </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Зберегти журнал' });
}
