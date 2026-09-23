import { Link, useParams, useSearchParams } from 'react-router'
import { isMockMode } from '@/api/analysis'
import { StateMessage } from '@/components/StateMessage'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FunctionsList } from '@/features/analysis/FunctionsList'
import { SummaryGrid } from '@/features/analysis/SummaryGrid'
import { DepartmentsList } from '@/features/departments/DepartmentsList'
import { FindingsList } from '@/features/findings/FindingsList'
import { useAnalysis } from '@/hooks/use-analysis'

const tabs = ['Overview', 'Departments', 'Functions', 'Findings'] as const
type Tab = typeof tabs[number]

export function AnalysisPage() {
  const { id = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: analysis, isPending, error } = useAnalysis(id)
  const requested = searchParams.get('tab')
  const tab: Tab = tabs.find((item) => item === requested) ?? 'Overview'

  if (isPending) return <StateMessage>Загрузка анализа…</StateMessage>
  if (error) return <StateMessage tone="error">Не удалось загрузить анализ: {error.message}</StateMessage>
  if (!analysis) return <StateMessage>Анализ не найден.</StateMessage>

  return <div className="space-y-6">
    <div><Link className="text-sm text-muted-foreground hover:underline" to="/">← Все анализы</Link><div className="mt-3 flex flex-wrap items-center gap-3"><h1 className="text-3xl font-bold">Результаты анализа</h1><Badge variant="outline">{new Date(analysis.createdAt).toLocaleString('ru-RU')}</Badge></div></div>
    {(analysis.status === 'queued' || analysis.status === 'processing') && <div role="status" className="space-y-3 rounded-lg border bg-white p-6"><div className="h-2 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full w-1/3 animate-pulse rounded-full bg-blue-600" /></div><h2 className="font-semibold">Анализ выполняется</h2><p className="text-sm text-muted-foreground">Страница обновится автоматически, когда результат будет готов.</p></div>}
    {analysis.status === 'failed' && <StateMessage tone="error">Анализ завершился с ошибкой: {analysis.error || 'Причина не указана.'}</StateMessage>}
    {analysis.status === 'completed' && <>
      {isMockMode && <StateMessage>Демо результат: файлы не разбирались, поэтому показатели равны нулю и выводов нет. Подключите backend для анализа содержимого.</StateMessage>}
      {analysis.demo && <StateMessage>Backend запущен с USE_MOCK_AI=true: документы сохранены, но их содержимое не анализировалось. Для анализа подключите AI Service и установите USE_MOCK_AI=false.</StateMessage>}
      <nav aria-label="Разделы анализа" className="flex gap-2 overflow-x-auto border-b pb-2">
        {tabs.map((item) => <Button key={item} variant={tab === item ? 'default' : 'ghost'} size="sm" onClick={() => setSearchParams({ tab: item })}>{item}</Button>)}
      </nav>
      {tab === 'Overview' && <div className="space-y-6">
        {!isMockMode && !analysis.demo && (analysis.summary ? <SummaryGrid summary={analysis.summary} /> : <StateMessage>Сводка ещё не предоставлена API.</StateMessage>)}
        <section className="space-y-3"><h2 className="text-xl font-semibold">Документы</h2><ul className="divide-y rounded-lg border bg-white">{analysis.documents.map((document) => <li key={document.id} className="flex justify-between gap-3 p-3 text-sm"><span className="min-w-0 truncate">{document.name}</span><Badge variant="outline">{document.side.toUpperCase()}</Badge></li>)}</ul></section>
      </div>}
      {tab === 'Departments' && <DepartmentsList departments={analysis.departments ?? []} />}
      {tab === 'Functions' && <FunctionsList functions={analysis.functions ?? []} />}
      {tab === 'Findings' && <FindingsList findings={analysis.findings ?? []} analysisId={analysis.id} />}
    </>}
  </div>
}
