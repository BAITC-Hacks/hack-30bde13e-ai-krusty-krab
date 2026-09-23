import { Link, Route, Routes } from 'react-router'
import { buttonVariants } from '@/components/ui/button'
import { AnalysisPage } from '@/pages/AnalysisPage'
import { FindingPage } from '@/pages/FindingPage'
import { HomePage } from '@/pages/HomePage'
import { NewAnalysisPage } from '@/pages/NewAnalysisPage'

export default function App() {
  return <div className="min-h-screen bg-slate-50">
    <header className="border-b bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6"><Link className="font-semibold" to="/">Hackalem AI</Link><Link className={buttonVariants({ variant: 'outline', size: 'sm' })} to="/analysis/new">Новый анализ</Link></div></header>
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/analysis/new" element={<NewAnalysisPage />} />
        <Route path="/analysis/:id/findings/:findingId" element={<FindingPage />} />
        <Route path="/analysis/:id" element={<AnalysisPage />} />
        <Route path="*" element={<div className="space-y-3"><h1 className="text-2xl font-bold">Страница не найдена</h1><Link className="underline" to="/">На главную</Link></div>} />
      </Routes>
    </main>
  </div>
}
