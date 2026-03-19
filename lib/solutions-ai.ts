// ── Types ────────────────────────────────────────────────

export type SolutionPurpose = 'instruments' | 'surfaces' | 'preclean' | 'other';

export interface SolutionRequest {
  purpose: SolutionPurpose;
  productId: string;
  volumeMl: number;
  notes?: string;
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
  minContactTimeMin: number | null;
  steps: SolutionStep[];
  warnings: string[];
}

// ── Mock products ───────────────────────────────────────

export interface ConcentrateProduct {
  id: string;
  name: string;
  /** Default concentration % for instrument disinfection */
  defaultConcentration: Record<SolutionPurpose, number>;
  /** Contact time in minutes per purpose (null = not specified) */
  contactTime: Record<SolutionPurpose, number | null>;
}

/**
 * TEMPORARY mock data — concentrations are approximate placeholders.
 * TODO: Replace with real data from Dezik product specs / Supabase.
 */
export const CONCENTRATE_PRODUCTS: ConcentrateProduct[] = [
  {
    id: 'delanol',
    name: 'Деланол',
    defaultConcentration: { instruments: 2, surfaces: 1, preclean: 2, other: 2 },
    contactTime: { instruments: 30, surfaces: 15, preclean: 15, other: 30 },
  },
  {
    id: 'delanol_dezik',
    name: 'Delanol Dezik',
    defaultConcentration: { instruments: 2, surfaces: 1, preclean: 2, other: 2 },
    contactTime: { instruments: 30, surfaces: 15, preclean: 15, other: 30 },
  },
  {
    id: 'instrum',
    name: 'Instrum Dezik',
    defaultConcentration: { instruments: 3, surfaces: 1.5, preclean: 3, other: 3 },
    contactTime: { instruments: 30, surfaces: 30, preclean: 15, other: 30 },
  },
  {
    id: 'bionol',
    name: 'Біонол',
    defaultConcentration: { instruments: 2, surfaces: 1, preclean: 2, other: 2 },
    contactTime: { instruments: 60, surfaces: 30, preclean: 30, other: 60 },
  },
];

export const PURPOSE_LABELS: Record<SolutionPurpose, string> = {
  instruments: 'Дезінфекція інструментів',
  surfaces: 'Дезінфекція поверхонь',
  preclean: 'Замочування / ПСО',
  other: 'Інше',
};

// ── Calculator ──────────────────────────────────────────

/**
 * Calculate solution recipe.
 *
 * NOTE: All concentrations are TEMPORARY mock values.
 * Before production use, replace with verified data from Dezik product specs.
 * TODO: Replace with backend AI call when ready.
 */
export async function calculateSolution(req: SolutionRequest): Promise<SolutionRecipe> {
  const product = CONCENTRATE_PRODUCTS.find((p) => p.id === req.productId);
  if (!product) {
    throw new Error('Продукт не знайдено');
  }

  const concentration = product.defaultConcentration[req.purpose];
  const contactTime = product.contactTime[req.purpose];

  // concentration% means: concentrateMl / finalVolumeMl * 100
  const concentrateMl = Math.round(req.volumeMl * concentration / 100);
  const waterMl = req.volumeMl - concentrateMl;

  const purposeLabel = PURPOSE_LABELS[req.purpose];

  const steps: SolutionStep[] = [
    { order: 1, text: `Надягніть захисні рукавички.` },
    { order: 2, text: `Налийте в ємність ${waterMl} мл чистої води.` },
    { order: 3, text: `Додайте ${concentrateMl} мл концентрату ${product.name}.` },
    { order: 4, text: `Перемішайте до однорідного стану.` },
  ];

  if (contactTime) {
    steps.push({
      order: 5,
      text: `Мінімальний час дії: ${contactTime} хвилин.`,
    });
  }

  return {
    title: `${purposeLabel} — ${product.name}`,
    productName: product.name,
    finalVolumeMl: req.volumeMl,
    concentrateMl,
    waterMl,
    concentrationPercent: concentration,
    minContactTimeMin: contactTime,
    steps,
    warnings: [
      'Працюйте в захисних рукавичках.',
      '⚠️ Розрахунок зроблено автоматично. Перед використанням звіртесь з офіційною інструкцією до продукту Dezik.',
      'Концентрації є орієнтовними — уточнюйте за інструкцією на упаковці.',
    ],
  };
}
