import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AnalysisSummary } from '@/types/analysis'

export function SummaryGrid({ summary }: { summary: AnalysisSummary }) {
  const values = [
    ['Подразделений BEFORE', summary.beforeDepartments],
    ['Подразделений AFTER', summary.afterDepartments],
    ['Сохранены', summary.preserved],
    ['Реорганизованы', summary.reorganized],
    ['Созданы', summary.created],
    ['Удалены', summary.deleted],
    ['Потенциально потерянные функции', summary.functionLoss],
    ['Потенциальные дублирования', summary.functionDuplication],
    ['Потенциальные конфликты', summary.responsibilityConflict],
  ] as const
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {values.map(([label, value]) => (
        <Card key={label} className="gap-2 py-4">
          <CardHeader className="px-4"><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle></CardHeader>
          <CardContent className="px-4 text-2xl font-semibold">{value}</CardContent>
        </Card>
      ))}
    </div>
  )
}
