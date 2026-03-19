import { printToFileAsync } from 'expo-print';
import { generateJournalPDF } from '../lib/pdf-export';
import type { SterilizationCycle } from '../lib/types';

beforeEach(() => {
  jest.clearAllMocks();
});

const makeCycle = (overrides: Partial<SterilizationCycle> = {}): SterilizationCycle => ({
  id: '1',
  user_id: 'u1',
  instrument_id: null,
  sterilizer_id: null,
  instrument_name: 'Кусачки',
  sterilizer_name: 'Сухожар',
  packet_type: 'kraft',
  temperature: 180,
  duration_minutes: 30,
  started_at: '2026-03-10T09:00:00Z',
  result: 'passed',
  notes: null,
  created_at: '2026-03-10T09:00:00Z',
  ...overrides,
});

describe('generateJournalPDF', () => {
  it('generates a PDF and returns a file URI', async () => {
    const uri = await generateJournalPDF([makeCycle()]);
    expect(uri).toBe('/tmp/mock.pdf');
    expect(printToFileAsync).toHaveBeenCalledTimes(1);
  });

  it('includes salon name when provided', async () => {
    await generateJournalPDF([makeCycle()], 'Beauty Studio');
    const html = (printToFileAsync as jest.Mock).mock.calls[0][0].html;
    expect(html).toContain('Beauty Studio');
  });

  it('omits salon name when not provided', async () => {
    await generateJournalPDF([makeCycle()]);
    const html = (printToFileAsync as jest.Mock).mock.calls[0][0].html;
    // Should not have an empty salon line
    expect(html).not.toContain('<p></p>');
  });

  it('renders correct number of rows', async () => {
    const cycles = [makeCycle({ id: '1' }), makeCycle({ id: '2' }), makeCycle({ id: '3' })];
    await generateJournalPDF(cycles);
    const html: string = (printToFileAsync as jest.Mock).mock.calls[0][0].html;
    const rowCount = (html.match(/<tr>/g) || []).length;
    // 1 header row + 3 data rows
    expect(rowCount).toBe(4);
  });

  it('shows "Пройдено" for passed and "Не пройдено" for failed', async () => {
    const cycles = [
      makeCycle({ result: 'passed' }),
      makeCycle({ id: '2', result: 'failed' }),
    ];
    await generateJournalPDF(cycles);
    const html: string = (printToFileAsync as jest.Mock).mock.calls[0][0].html;
    expect(html).toContain('Пройдено');
    expect(html).toContain('Не пройдено');
  });

  it('handles null temperature and duration gracefully', async () => {
    const cycle = makeCycle({ temperature: null, duration_minutes: null });
    await generateJournalPDF([cycle]);
    const html: string = (printToFileAsync as jest.Mock).mock.calls[0][0].html;
    // Should show '--' for missing values
    expect(html).toContain('--');
  });

  it('uses started_at for date, falls back to created_at', async () => {
    const cycle = makeCycle({ started_at: '2026-01-15T10:00:00Z', created_at: '2026-01-15T08:00:00Z' });
    await generateJournalPDF([cycle]);
    const html: string = (printToFileAsync as jest.Mock).mock.calls[0][0].html;
    expect(html).toContain('15');
  });

  it('handles empty cycles array', async () => {
    await generateJournalPDF([]);
    const html: string = (printToFileAsync as jest.Mock).mock.calls[0][0].html;
    expect(html).toContain('Записів: 0');
  });
});
