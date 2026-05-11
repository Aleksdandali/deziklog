import { COLORS, MS_PER_DAY } from './constants';

export type SolutionStatus = 'active' | 'warning' | 'expired';

export function getSolutionStatus(expiresAt: string): { status: SolutionStatus; daysLeft: number } {
  const expires = new Date(expiresAt);
  if (isNaN(expires.getTime())) return { status: 'expired', daysLeft: 0 };
  const daysLeft = Math.ceil((expires.getTime() - Date.now()) / MS_PER_DAY);
  if (daysLeft <= 0) return { status: 'expired', daysLeft };
  if (daysLeft <= 3) return { status: 'warning', daysLeft };
  return { status: 'active', daysLeft };
}

export function solutionStatusColor(status: SolutionStatus): string {
  if (status === 'expired') return COLORS.danger;
  if (status === 'warning') return COLORS.warning;
  return COLORS.success;
}

export function solutionStatusText(status: SolutionStatus, daysLeft: number): string {
  if (status === 'expired') return 'Термін вийшов';
  if (status === 'warning') return `${daysLeft} дні до закінчення`;
  return `${daysLeft} днів залишилось`;
}

export function solutionProgress(openedAt: string, expiresAt: string): number {
  const start = new Date(openedAt).getTime();
  const end = new Date(expiresAt).getTime();
  if (isNaN(start) || isNaN(end)) return 1;
  const total = end - start;
  if (total <= 0) return 1;
  const elapsed = Date.now() - start;
  return Math.min(1, Math.max(0, elapsed / total));
}
