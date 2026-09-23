import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { isMockMode } from '@/api/analysis'
import { StateMessage } from '@/components/StateMessage'
import { Button } from '@/components/ui/button'
import { DocumentPicker } from '@/features/upload/DocumentPicker'
import { useCreateAnalysis } from '@/hooks/use-analysis'

export function NewAnalysisPage() {
  const [before, setBefore] = useState<File[]>([])
  const [after, setAfter] = useState<File[]>([])
  const [validationError, setValidationError] = useState('')
  const create = useCreateAnalysis()
  const navigate = useNavigate()

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!before.length || !after.length) {
      setValidationError('Добавьте хотя бы один документ для каждой стороны.')
      return
    }
    setValidationError('')
    try {
      const analysis = await create.mutateAsync({ before, after })
      navigate(`/analysis/${analysis.id}`)
    } catch {
      // The mutation error is shown below.
    }
  }

  return <div>
    <Link className="back-link" to="/">← Все анализы</Link>
    <div className="page-head"><div className="page-head__copy"><span className="eyebrow">Новый анализ / 02</span><h1 className="page-title mt-4">Сравните два состояния.</h1><p className="lede">Добавьте документы до и после реорганизации. Мы сопоставим подразделения, функции и ответственность.</p></div></div>
    {isMockMode && <div className="mb-6"><StateMessage>Демо режим не читает содержимое файлов. Для реального анализа укажите VITE_API_URL.</StateMessage></div>}
    <form onSubmit={submit}>
      <div className="upload-grid">
        <DocumentPicker side="before" files={before} onChange={setBefore} onError={setValidationError} />
        <DocumentPicker side="after" files={after} onChange={setAfter} onError={setValidationError} />
      </div>
      {validationError && <p role="alert" className="form-error mt-4">{validationError}</p>}
      {create.error && <div className="mt-4"><StateMessage tone="error">Не удалось создать анализ: {create.error.message}</StateMessage></div>}
      <div className="form-actions"><span className="form-help">PDF, DOCX и XLSX · минимум один файл с каждой стороны</span><Button type="submit" size="lg" disabled={create.isPending}>{create.isPending ? 'Отправка…' : 'Запустить анализ ↗'}</Button></div>
    </form>
  </div>
}
