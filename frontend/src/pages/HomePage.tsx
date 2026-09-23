import { Link } from 'react-router'
import { isMockMode } from '@/api/analysis'
import { StateMessage } from '@/components/StateMessage'
import { useAnalyses } from '@/hooks/use-analysis'

const statusLabel = { queued: 'В очереди', processing: 'В работе', completed: 'Завершён', failed: 'Ошибка' }

export function HomePage() {
  const { data, isPending, error } = useAnalyses()

  return <div>
    <section className="home-hero">
      <div><span className="eyebrow">Рабочее пространство / 01</span><h1 className="hero-title">Изменения становятся яснее.</h1></div>
      <div className="home-hero__side">
        <p className="lede">Сравните документы до и после реорганизации. Увидьте, что изменилось в подразделениях и функциях, и проверьте каждый вывод по источнику.</p>
        <Link className="action-link" to="/analysis/new">Начать анализ <span aria-hidden="true">↗</span></Link>
      </div>
    </section>

    {isMockMode && <div className="mt-8"><StateMessage>Демо режим: документы сохраняются только как список имён. Содержимое не анализируется, пока не подключён backend.</StateMessage></div>}

    <section className="recent-section">
      <div className="section-heading"><h2 className="section-title">Последние анализы</h2><span className="section-count">{data?.length ?? '—'} всего</span></div>
      {isPending ? <StateMessage>Загрузка анализов…</StateMessage> : error ? <StateMessage tone="error">Не удалось загрузить анализы: {error.message}</StateMessage> : !data?.length ? <StateMessage>Здесь появятся ваши анализы. Начните с загрузки двух наборов документов.</StateMessage> : (
        <ul className="recent-list">
          {data.map((analysis) => <li className="recent-item" key={analysis.id}>
            <div><Link className="recent-item__title after:absolute after:inset-0" to={`/analysis/${analysis.id}`}>Анализ от {new Date(analysis.createdAt).toLocaleDateString('ru-RU')}</Link><p className="recent-item__meta">{new Date(analysis.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</p></div>
            <span className={`status-pill status-pill--${analysis.status}`}>{statusLabel[analysis.status]}</span>
            <span className="recent-item__documents">{analysis.documents.length} док.</span>
            <span className="recent-item__arrow" aria-hidden="true">↗</span>
          </li>)}
        </ul>
      )}
    </section>
  </div>
}
