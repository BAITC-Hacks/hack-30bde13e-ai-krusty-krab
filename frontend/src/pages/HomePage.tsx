import { Link } from 'react-router'
import { isMockMode } from '@/api/analysis'
import { StateMessage } from '@/components/StateMessage'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAnalyses } from '@/hooks/use-analysis'

const statusLabel = { queued: 'В очереди', processing: 'В работе', completed: 'Завершён', failed: 'Ошибка' }

export function HomePage() {
  const { data, isPending, error } = useAnalyses()
  return <div className="space-y-8">
    <section className="space-y-4 py-5">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Анализ реорганизации</h1>
      <p className="max-w-2xl text-muted-foreground">Сравните документы до и после изменений, проверьте подразделения, функции и выводы с доказательствами из источников.</p>
      <Link className={buttonVariants({})} to="/analysis/new">Новый анализ</Link>
    </section>
    {isMockMode && <StateMessage>Демо режим: документы сохраняются только как список имён. Содержимое не анализируется, пока не подключён backend.</StateMessage>}
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">Последние анализы</h2>
      {isPending ? <StateMessage>Загрузка анализов…</StateMessage> : error ? <StateMessage tone="error">Не удалось загрузить анализы: {error.message}</StateMessage> : !data?.length ? <StateMessage>Анализов пока нет. Создайте первый.</StateMessage> : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.map((analysis) => <li key={analysis.id}><Card className="relative h-full transition-colors hover:bg-slate-50"><CardHeader><CardTitle className="text-base"><Link className="after:absolute after:inset-0" to={`/analysis/${analysis.id}`}>Анализ от {new Date(analysis.createdAt).toLocaleString('ru-RU')}</Link></CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{statusLabel[analysis.status]} · Документов: {analysis.documents.length}</CardContent></Card></li>)}
        </ul>
      )}
    </section>
  </div>
}
