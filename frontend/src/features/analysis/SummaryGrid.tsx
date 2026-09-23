import type { AnalysisSummary } from '@/types/analysis'

export function SummaryGrid({ summary }: { summary: AnalysisSummary }) {
  const values = [
    ['Подразделений до', summary.beforeDepartments],
    ['Подразделений после', summary.afterDepartments],
    ['Сохранены', summary.preserved],
    ['Реорганизованы', summary.reorganized],
    ['Созданы', summary.created],
    ['Удалены', summary.deleted],
    ['Потенциально потерянные функции', summary.functionLoss],
    ['Потенциальные дублирования', summary.functionDuplication],
    ['Потенциальные конфликты', summary.responsibilityConflict],
  ] as const
  return <section aria-label="Сводка анализа" className="summary-grid">
    {values.map(([label, value]) => <div className="metric" key={label}><span className="metric__label">{label}</span><strong className="metric__value">{value}</strong></div>)}
  </section>
}
