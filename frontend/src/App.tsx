import { Link, Route, Routes } from 'react-router'
import { AnalysisPage } from '@/pages/AnalysisPage'
import { FindingPage } from '@/pages/FindingPage'
import { HomePage } from '@/pages/HomePage'
import { NewAnalysisPage } from '@/pages/NewAnalysisPage'

export default function App() {
  return <div className="app-shell">
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="brand" to="/" aria-label="Hackalem AI — главная"><span className="brand-mark" aria-hidden="true">H.</span><span>Hackalem AI</span></Link>
        <nav className="header-actions" aria-label="Основная навигация">
          <Link className="header-link" to="/">Все анализы</Link>
          <Link className="header-cta" to="/analysis/new">Новый анализ <span aria-hidden="true">↗</span></Link>
        </nav>
      </div>
    </header>
    <main className="site-main">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/analysis/new" element={<NewAnalysisPage />} />
        <Route path="/analysis/:id/findings/:findingId" element={<FindingPage />} />
        <Route path="/analysis/:id" element={<AnalysisPage />} />
        <Route path="*" element={<div><span className="eyebrow">404 / Не найдено</span><h1 className="page-title mt-4">Страница не найдена</h1><Link className="back-link mt-6" to="/">← На главную</Link></div>} />
      </Routes>
    </main>
    <footer className="site-footer"><div className="site-footer__inner"><span>Hackalem AI · Анализ организационных изменений</span><span>Документы → структура → выводы</span></div></footer>
  </div>
}
