import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { StateMessage } from '@/components/StateMessage'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { confidenceLabel, severityLabel, typeLabel } from '@/lib/labels'
import type { Finding } from '@/types/analysis'

export function FindingsList({ findings, analysisId }: { findings: Finding[]; analysisId: string }) {
  if (!findings.length) return <StateMessage>Выводов пока нет.</StateMessage>
  return <div className="overflow-x-auto rounded-lg border bg-white">
    <Table>
      <TableHeader><TableRow>
        <TableHead>Тип</TableHead><TableHead>Серьёзность</TableHead><TableHead>Подразделение</TableHead>
        <TableHead>Функция</TableHead><TableHead>Уверенность</TableHead><TableHead>Статус</TableHead>
      </TableRow></TableHeader>
      <TableBody>{findings.map((finding) => <TableRow key={finding.id}>
        <TableCell><Link className="font-medium text-blue-700 underline-offset-2 hover:underline" to={`/analysis/${analysisId}/findings/${finding.id}`}>{typeLabel[finding.type]}</Link><span className="block text-xs text-muted-foreground">{finding.title}</span></TableCell>
        <TableCell><Badge variant={finding.severity === 'high' ? 'destructive' : 'secondary'}>{severityLabel[finding.severity]}</Badge></TableCell>
        <TableCell>{finding.department || '—'}</TableCell>
        <TableCell>{finding.function || '—'}</TableCell>
        <TableCell>{confidenceLabel(finding.confidence)}</TableCell>
        <TableCell>{finding.status || 'Новый'}</TableCell>
      </TableRow>)}</TableBody>
    </Table>
  </div>
}
