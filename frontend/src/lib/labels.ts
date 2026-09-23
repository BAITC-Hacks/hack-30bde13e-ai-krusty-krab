import type { FindingType, Severity, Side } from '@/types/analysis'

export const sideLabel: Record<Side, string> = { before: 'BEFORE', after: 'AFTER' }
export const typeLabel: Record<FindingType, string> = {
  FUNCTION_LOSS: 'Потеря функции',
  FUNCTION_DUPLICATION: 'Дублирование функции',
  RESPONSIBILITY_CONFLICT: 'Конфликт ответственности',
}
export const severityLabel: Record<Severity, string> = {
  low: 'Низкая', medium: 'Средняя', high: 'Высокая',
}

export function confidenceLabel(value: number) {
  return `${Math.round((value <= 1 ? value * 100 : value))}%`
}
