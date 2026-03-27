// ── Types ────────────────────────────────────────────────

export type SolutionPurpose =
  | 'instruments_bacterial'
  | 'instruments_viral'
  | 'instruments_dso'
  | 'instruments_combined'
  | 'surfaces'
  | 'high_level'
  | 'cleaning';

export interface SolutionRequest {
  purpose: SolutionPurpose;
  productId: string;
  volumeMl: number;
  speed: 'fast' | 'standard';
}

export interface SolutionStep {
  order: number;
  text: string;
}

export interface SolutionRecipe {
  title: string;
  productName: string;
  finalVolumeMl: number;
  concentrateMl: number;
  waterMl: number;
  concentrationPercent: number;
  minContactTimeMin: number;
  steps: SolutionStep[];
  warnings: string[];
  shelfLifeDays: number;
  afterNote: string | null;
}

// ── Products with verified data from official instructions ──

export interface ConcentrateProduct {
  id: string;
  name: string;
  shortName: string;
  /** Shelf life of working solution in days */
  shelfLifeDays: number;
}

export const CONCENTRATE_PRODUCTS: ConcentrateProduct[] = [
  { id: 'delanol', name: 'Деланол', shortName: 'Деланол', shelfLifeDays: 35 },
  { id: 'bionol', name: 'Біонол форте', shortName: 'Біонол', shelfLifeDays: 35 },
  { id: 'instrum', name: 'DEZIK Instrum', shortName: 'Instrum', shelfLifeDays: 0 },
];

export const PURPOSE_LABELS: Record<SolutionPurpose, string> = {
  instruments_bacterial: 'Дезінфекція інструментів (бактерії)',
  instruments_viral: 'Дезінфекція інструментів (віруси, ВІЛ, гепатити)',
  instruments_dso: 'Достерилізаційне очищення (ДСО)',
  instruments_combined: 'Дезінфекція + ДСО (суміщена)',
  surfaces: 'Поверхні та робоче місце',
  high_level: 'Дезінфекція високого рівня (ДВР)',
  cleaning: 'Очищення від нальоту',
};

export const PURPOSE_SHORT_LABELS: Record<SolutionPurpose, string> = {
  instruments_bacterial: 'Інструменти (бактерії)',
  instruments_viral: 'Інструменти (віруси/ВІЛ)',
  instruments_dso: 'ДСО',
  instruments_combined: 'Дезінфекція + ДСО',
  surfaces: 'Поверхні',
  high_level: 'ДВР',
  cleaning: 'Очищення від нальоту',
};

/** Which purposes are available for each product */
export const PRODUCT_PURPOSES: Record<string, SolutionPurpose[]> = {
  delanol: ['instruments_bacterial', 'instruments_viral', 'instruments_dso', 'instruments_combined', 'surfaces', 'high_level'],
  bionol: ['instruments_bacterial', 'instruments_viral', 'instruments_dso', 'instruments_combined', 'surfaces', 'high_level'],
  instrum: ['cleaning'],
};

/**
 * Verified regimes from official instructions.
 * Each entry: [concentrationPercent, contactTimeMin]
 * Two options per regime: standard (lower concentration, longer time) and fast (higher concentration, less time).
 *
 * Sources:
 * - Деланол: офіційна інструкція, ТУ У 24.2-22920528-013:2008
 * - Біонол форте: офіційна інструкція, ТУ У 24.2-32304923-001:2005
 */
interface Regime { concentration: number; time: number; }

const REGIMES: Record<string, Record<SolutionPurpose, { standard: Regime; fast: Regime }>> = {
  delanol: {
    instruments_bacterial: {
      standard: { concentration: 0.1, time: 30 },
      fast:     { concentration: 0.4, time: 5 },
    },
    instruments_viral: {
      standard: { concentration: 0.1, time: 60 },
      fast:     { concentration: 0.5, time: 5 },
    },
    instruments_dso: {
      standard: { concentration: 0.2, time: 15 },
      fast:     { concentration: 0.2, time: 15 },
    },
    instruments_combined: {
      standard: { concentration: 0.2, time: 30 },
      fast:     { concentration: 0.5, time: 15 },
    },
    surfaces: {
      standard: { concentration: 0.05, time: 15 },
      fast:     { concentration: 0.2, time: 5 },
    },
    high_level: {
      standard: { concentration: 0.3, time: 15 },
      fast:     { concentration: 0.5, time: 5 },
    },
  },
  bionol: {
    instruments_bacterial: {
      standard: { concentration: 0.5, time: 30 },
      fast:     { concentration: 2.0, time: 5 },
    },
    instruments_viral: {
      standard: { concentration: 1.0, time: 30 },
      fast:     { concentration: 5.0, time: 5 },
    },
    instruments_dso: {
      standard: { concentration: 0.5, time: 30 },
      fast:     { concentration: 1.0, time: 15 },
    },
    instruments_combined: {
      standard: { concentration: 0.75, time: 60 },
      fast:     { concentration: 1.0, time: 30 },
    },
    surfaces: {
      standard: { concentration: 0.25, time: 30 },
      fast:     { concentration: 1.0, time: 15 },
    },
    high_level: {
      standard: { concentration: 2.0, time: 15 },
      fast:     { concentration: 5.0, time: 5 },
    },
  },
};

// ── Calculator ──────────────────────────────────────────

export async function calculateSolution(req: SolutionRequest): Promise<SolutionRecipe> {
  const product = CONCENTRATE_PRODUCTS.find((p) => p.id === req.productId);
  if (!product) throw new Error('Продукт не знайдено');

  // DEZIK Instrum — special case, no dilution
  if (req.productId === 'instrum') {
    return {
      title: 'Очищення від нальоту — DEZIK Instrum',
      productName: product.name,
      finalVolumeMl: req.volumeMl,
      concentrateMl: req.volumeMl,
      waterMl: 0,
      concentrationPercent: 100,
      minContactTimeMin: 20,
      steps: [
        { order: 1, text: 'Надягніть захисні рукавички.' },
        { order: 2, text: `Налийте ${req.volumeMl} мл DEZIK Instrum у ємність.` },
        { order: 3, text: 'Занурте інструменти у розчин на 15–20 хвилин.' },
        { order: 4, text: 'Промийте під проточною водою.' },
        { order: 5, text: 'Ретельно висушіть.' },
      ],
      warnings: [
        'DEZIK Instrum НЕ є дезінфектантом. Використовуйте ПІСЛЯ дезінфекції.',
        'Допускається використання в ультразвуковій мийці.',
      ],
      shelfLifeDays: 0,
      afterNote: 'Instrum видаляє наліт та відновлює блиск. Для дезінфекції використовуйте Деланол або Біонол форте.',
    };
  }

  const productRegimes = REGIMES[req.productId];
  if (!productRegimes) throw new Error('Режими для цього продукту не знайдено');

  const regime = productRegimes[req.purpose]?.[req.speed];
  if (!regime) throw new Error('Режим не знайдено для цієї комбінації');

  const { concentration, time } = regime;
  const concentrateMl = roundTo1(req.volumeMl * concentration / 100);
  const waterMl = roundTo1(req.volumeMl - concentrateMl);

  const purposeLabel = PURPOSE_SHORT_LABELS[req.purpose];
  const speedLabel = req.speed === 'fast' ? 'швидкий' : 'стандартний';

  const steps: SolutionStep[] = [];
  let stepN = 1;

  steps.push({ order: stepN++, text: 'Надягніть захисні рукавички та окуляри.' });
  steps.push({ order: stepN++, text: `Налийте в ємність ${waterMl} мл чистої води кімнатної температури.` });
  steps.push({ order: stepN++, text: `Додайте ${concentrateMl} мл концентрату «${product.name}».` });
  steps.push({ order: stepN++, text: 'Перемішайте до однорідного стану.' });

  let afterNote: string | null = null;

  if (req.purpose === 'instruments_bacterial' || req.purpose === 'instruments_viral' || req.purpose === 'high_level') {
    steps.push({ order: stepN++, text: `Занурте інструменти так, щоб шар розчину був ≥1 см над ними. Розбірні вироби — у розібраному стані.` });
    steps.push({ order: stepN++, text: `Витримайте ${time} хвилин.` });
    steps.push({ order: stepN++, text: 'Промийте проточною водою 3 хвилини (з каналами — 5 хвилин).' });
    afterNote = 'Після дезінфекції інструменти потребують ДСО перед стерилізацією.';
  } else if (req.purpose === 'instruments_dso') {
    steps.push({ order: stepN++, text: 'Обполосніть інструменти проточною водою 0,5 хв.' });
    steps.push({ order: stepN++, text: `Занурте у розчин на ${time} хвилин при температурі (20±5)°C.` });
    steps.push({ order: stepN++, text: 'Помийте кожен інструмент йоржем або щіткою в розчині 0,5 хв.' });
    steps.push({ order: stepN++, text: 'Промийте проточною водою 3 хвилини.' });
    steps.push({ order: stepN++, text: 'Висушіть гарячим повітрям при 85°C до повного видалення вологи.' });
    afterNote = 'Після ДСО інструменти готові до стерилізації.';
  } else if (req.purpose === 'instruments_combined') {
    steps.push({ order: stepN++, text: `Занурте інструменти у розчин (шар ≥1 см) на ${time} хвилин.` });
    steps.push({ order: stepN++, text: 'Помийте кожен інструмент йоржем або щіткою в цьому ж розчині 0,5 хв.' });
    steps.push({ order: stepN++, text: 'Промийте проточною водою 3 хвилини.' });
    steps.push({ order: stepN++, text: 'Висушіть гарячим повітрям при 85°C.' });
    afterNote = 'Дезінфекція та ДСО виконані одночасно. Інструменти готові до стерилізації.';
  } else if (req.purpose === 'surfaces') {
    steps.push({ order: stepN++, text: `Протріть поверхні серветкою, змоченою розчином. Норма: 100 мл/м².` });
    steps.push({ order: stepN++, text: `Витримайте ${time} хвилин.` });
    afterNote = null;
  }

  const warnings: string[] = [
    'Працюйте у захисних рукавичках та окулярах.',
  ];

  if (concentration >= 1.0) {
    warnings.push('Висока концентрація — готуйте у добре вентильованому приміщенні.');
  }

  warnings.push(`Робочий розчин зберігається ${product.shelfLifeDays} діб у щільно закритій тарі.`);
  warnings.push('Розчин можна використовувати багаторазово, якщо зовнішній вигляд не змінився.');

  return {
    title: `${purposeLabel} — ${product.name} (${speedLabel})`,
    productName: product.name,
    finalVolumeMl: req.volumeMl,
    concentrateMl,
    waterMl,
    concentrationPercent: concentration,
    minContactTimeMin: time,
    steps,
    warnings,
    shelfLifeDays: product.shelfLifeDays,
    afterNote,
  };
}

function roundTo1(n: number): number {
  return Math.round(n * 10) / 10;
}
