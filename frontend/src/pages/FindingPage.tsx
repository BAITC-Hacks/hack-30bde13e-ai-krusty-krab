import { Link, useParams } from 'react-router'
import { StateMessage } from '@/components/StateMessage'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EvidenceViewer } from '@/features/evidence/EvidenceViewer'
import { useAnalysis } from '@/hooks/use-analysis'
import { confidenceLabel, severityLabel, typeLabel } from '@/lib/labels'

export function FindingPage() {
  const { id = '', findingId = '' } = useParams()
  const { data: analysis, isPending, error } = useAnalysis(id)
  if (isPending) return <StateMessage>Загрузка вывода…</StateMessage>
  if (error) return <StateMessage tone="error">Не удалось загрузить вывод: {error.message}</StateMessage>
  const finding = analysis?.findings?.find((item) => item.id === findingId)
  if (!finding) return <StateMessage>Вывод не найден.</StateMessage>

  return <div className="space-y-6">
    <div><Link className="text-sm text-muted-foreground hover:underline" to={`/analysis/${id}?tab=Findings`}>← К выводам</Link><h1 className="mt-3 text-3xl font-bold">{finding.title}</h1><div className="mt-3 flex flex-wrap gap-2"><Badge variant="outline">{typeLabel[finding.type]}</Badge><Badge variant={finding.severity === 'high' ? 'destructive' : 'secondary'}>{severityLabel[finding.severity]}</Badge><Badge variant="outline">Уверенность {confidenceLabel(finding.confidence)}</Badge><Badge variant="outline">{finding.status || 'Новый'}</Badge></div></div>
    <Card><CardHeader><CardTitle>Объяснение AI</CardTitle></CardHeader><CardContent className="space-y-3 text-sm leading-relaxed"><p>{finding.explanation}</p>{finding.department && <p><strong>Подразделение:</strong> {finding.department}</p>}{finding.function && <p><strong>Функция:</strong> {finding.function}</p>}</CardContent></Card>
    <section className="space-y-3"><h2 className="text-xl font-semibold">Доказательства из документов</h2><EvidenceViewer evidence={finding.evidence} /></section>
  </div>
}
