import { Link } from 'react-router'
import { StateMessage } from '@/components/StateMessage'
import { confidenceLabel, severityLabel, typeLabel } from '@/lib/labels'
import type { Finding } from '@/types/analysis'

export function FindingsList({ findings, analysisId }: { findings: Finding[]; analysisId: string }) {
  if (!findings.length) return <StateMessage>Выводов пока нет.</StateMessage>
  return <ul className="finding-list">
    {findings.map((finding) => <li className="finding-row" key={finding.id}>
      <div><Link className="finding-row__title after:absolute after:inset-0" to={`/analysis/${analysisId}/findings/${finding.id}`}>{finding.title}</Link><p className="finding-row__meta">{typeLabel[finding.type]} · {finding.status || 'Новый'}</p></div>
      <span className={`severity severity--${finding.severity}`}>{severityLabel[finding.severity]}</span>
      <span className="finding-row__detail">{finding.department || finding.function || 'Подразделение не указано'}</span>
      <span className="section-count">{confidenceLabel(finding.confidence)} ↗</span>
    </li>)}
  </ul>
}
