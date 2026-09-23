import { StateMessage } from '@/components/StateMessage'
import { sideLabel } from '@/lib/labels'
import type { Evidence } from '@/types/analysis'

export function EvidenceViewer({ evidence }: { evidence: Evidence[] }) {
  if (!evidence.length) return <StateMessage>Для этого вывода источник не предоставлен.</StateMessage>
  return <div className="evidence-list">
    {evidence.map((item, index) => <article className="evidence-item" key={`${item.documentId}-${index}`}>
      <h3 className="evidence-item__heading"><span className="section-count">{sideLabel[item.side]}</span>{item.documentName}</h3>
      <p className="evidence-item__meta">{item.page != null && `Страница ${item.page}`}{item.page != null && item.section && ' · '}{item.section && `Раздел: ${item.section}`}{item.page == null && !item.section && 'Местоположение не указано'}</p>
      <blockquote>{item.text}</blockquote>
    </article>)}
  </div>
}
