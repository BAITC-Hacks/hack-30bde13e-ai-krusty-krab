import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StateMessage } from '@/components/StateMessage'
import { sideLabel } from '@/lib/labels'
import type { Evidence } from '@/types/analysis'

export function EvidenceViewer({ evidence }: { evidence: Evidence[] }) {
  if (!evidence.length) return <StateMessage>Для этого вывода источник не предоставлен.</StateMessage>
  return <div className="space-y-3">
    {evidence.map((item, index) => <Card key={`${item.documentId}-${index}`}>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{sideLabel[item.side]}</Badge><CardTitle className="break-all text-base">{item.documentName}</CardTitle></div>
        <p className="text-sm text-muted-foreground">{item.page != null && `Страница ${item.page}`}{item.page != null && item.section && ' · '}{item.section && `Раздел: ${item.section}`}{item.page == null && !item.section && 'Местоположение не указано'}</p>
      </CardHeader>
      <CardContent><blockquote className="whitespace-pre-wrap border-l-2 pl-4 text-sm leading-relaxed">{item.text}</blockquote></CardContent>
    </Card>)}
  </div>
}
