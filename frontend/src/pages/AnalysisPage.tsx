import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Link, useParams, useSearchParams } from 'react-router'
import { isMockMode } from '@/api/analysis'
import { StateMessage } from '@/components/StateMessage'
import { FunctionsList } from '@/features/analysis/FunctionsList'
import { SummaryGrid } from '@/features/analysis/SummaryGrid'
import { DepartmentsList } from '@/features/departments/DepartmentsList'
import { FindingsList } from '@/features/findings/FindingsList'
import { useAnalysis, useRetryAnalysis } from '@/hooks/use-analysis'
import { sideLabel } from '@/lib/labels'

const tabs = [
  ['Overview', 'Обзор'],
  ['Departments', 'Подразделения'],
  ['Functions', 'Функции'],
  ['Findings', 'Выводы'],
] as const

type Tab = typeof tabs[number][0]
const statusLabel = { queued: 'В очереди', processing: 'В работе', completed: 'Готово', failed: 'Ошибка' }

export function AnalysisPage() {
  const { id = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: analysis, isPending, error } = useAnalysis(id)
  const retry = useRetryAnalysis(id)
  const [now, setNow] = useState(() => Date.now())
  const running = analysis?.status === 'processing' || analysis?.status === 'queued'
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [running])
  const seconds = Math.max(0, Math.floor((now - Date.parse(analysis?.updatedAt ?? analysis?.createdAt ?? '')) / 1000))
  const requested = searchParams.get('tab')
  const tab: Tab = tabs.find(([value]) => value === requested)?.[0] ?? 'Overview'

  if (isPending) return <StateMessage>Загрузка анализа…</StateMessage>
  if (error) return <StateMessage tone="error">Не удалось загрузить анализ: {error.message}</StateMessage>
  if (!analysis) return <StateMessage>Анализ не найден.</StateMessage>

  return <div>
    <Link className="back-link" to="/">← Все анализы</Link>
    <div className="page-head"><div className="page-head__copy"><span className="eyebrow">Результаты / {statusLabel[analysis.status]}</span><h1 className="page-title mt-4">Анализ изменений.</h1><p className="lede">Сводка сравнения организационных документов.</p><div className="meta-line"><span className="section-count">Создан {new Date(analysis.createdAt).toLocaleString('ru-RU')}</span><span className="section-count">{analysis.documents.length} документов</span></div></div></div>

    {(analysis.status === 'queued' || analysis.status === 'processing') && <div role="status" className="detail-card"><div className="progress-track"><div className="progress-track__fill animate-pulse" /></div><h2 className="section-title mt-6">Анализ выполняется · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</h2><p className="mt-2 text-sm text-muted-foreground">Документы загружены. Сопоставляем функции и проверяем выводы по источникам. Можно вернуться позже — результат сохранится, страница обновится автоматически.</p></div>}
    {analysis.status === 'failed' && <div className="space-y-4"><StateMessage tone="error">Анализ завершился с ошибкой: {analysis.error || 'Причина не указана.'}</StateMessage><p className="text-sm text-muted-foreground">Документы сохранены. Повторный запуск использует сохранённые успешные этапы; недостающие этапы могут расходовать токены.</p><Button disabled={retry.isPending} onClick={() => retry.mutate()}>{retry.isPending ? 'Запускаем…' : 'Повторить анализ'}</Button>{retry.error && <StateMessage tone="error">{retry.error.message}</StateMessage>}</div>}
    {analysis.status === 'completed' && <>
      {isMockMode && <div className="mb-6"><StateMessage>Демо результат: файлы не разбирались, поэтому показатели равны нулю и выводов нет. Подключите backend для анализа содержимого.</StateMessage></div>}
      {analysis.demo && <div className="mb-6"><StateMessage>Backend запущен с USE_MOCK_AI=true: документы сохранены, но их содержимое не анализировалось. Для анализа подключите AI Service и установите USE_MOCK_AI=false.</StateMessage></div>}
      <nav aria-label="Разделы анализа" className="analysis-tabs">
        {tabs.map(([value, label]) => <button key={value} type="button" className={`analysis-tab ${tab === value ? 'analysis-tab--active' : ''}`} aria-current={tab === value ? 'page' : undefined} onClick={() => setSearchParams({ tab: value })}>{label}</button>)}
      </nav>
      {tab === 'Overview' && <div>
        {!!analysis.limitations?.length && <StateMessage>{analysis.limitations.join(' ')}</StateMessage>}
        {!isMockMode && !analysis.demo && (analysis.summary ? <SummaryGrid summary={analysis.summary} /> : <StateMessage>Сводка ещё не предоставлена API.</StateMessage>)}
        <section className="document-section"><div className="section-heading"><h2 className="section-title">Документы</h2><span className="section-count">{analysis.documents.length} всего</span></div><ul className="data-list">{analysis.documents.map((document) => <li key={document.id} className="data-row"><span className="data-row__name">{document.name}</span><span className="section-count">{sideLabel[document.side]}</span></li>)}</ul></section>
      </div>}
      {tab === 'Departments' && <DepartmentsList departments={analysis.departments ?? []} />}
      {tab === 'Functions' && <FunctionsList functions={analysis.functions ?? []} />}
      {tab === 'Findings' && <FindingsList findings={analysis.findings ?? []} analysisId={analysis.id} />}
    </>}
  </div>
}
