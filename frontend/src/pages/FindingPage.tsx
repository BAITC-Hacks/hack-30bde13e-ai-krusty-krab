import { Link, useParams } from 'react-router'
import { StateMessage } from '@/components/StateMessage'
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

  return <div>
    <Link className="back-link" to={`/analysis/${id}?tab=Findings`}>← К выводам</Link>
    <div className="page-head"><div className="page-head__copy"><span className="eyebrow">{typeLabel[finding.type]}</span><h1 className="page-title mt-4">{finding.title}</h1><div className="meta-line"><span className={`severity severity--${finding.severity}`}>{severityLabel[finding.severity]} серьёзность</span><span className="section-count">Уверенность {confidenceLabel(finding.confidence)}</span><span className="section-count">{finding.status || 'Новый'}</span></div></div></div>
    <section className="detail-card"><span className="eyebrow detail-card__label">Объяснение AI</span><p className="detail-card__body">{finding.explanation}</p>{(finding.department || finding.function) && <div className="detail-meta">{finding.department && <p>Подразделение: <strong>{finding.department}</strong></p>}{finding.function && <p>Функция: <strong>{finding.function}</strong></p>}</div>}</section>
    <section className="document-section"><div className="section-heading"><h2 className="section-title">Доказательства из документов</h2><span className="section-count">{finding.evidence.length} источников</span></div><EvidenceViewer evidence={finding.evidence} /></section>
  </div>
}
