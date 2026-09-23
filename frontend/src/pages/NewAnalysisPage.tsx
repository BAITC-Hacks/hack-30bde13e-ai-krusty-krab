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

  return <div className="space-y-6">
    <div><Link className="text-sm text-muted-foreground hover:underline" to="/">← На главную</Link><h1 className="mt-3 text-3xl font-bold">Новый анализ</h1><p className="mt-2 text-muted-foreground">Загрузите документы состояния организации до и после реорганизации.</p></div>
    {isMockMode && <StateMessage>Демо режим не читает содержимое файлов. Для реального анализа укажите VITE_API_URL.</StateMessage>}
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <DocumentPicker side="before" files={before} onChange={setBefore} onError={setValidationError} />
        <DocumentPicker side="after" files={after} onChange={setAfter} onError={setValidationError} />
      </div>
      {validationError && <p role="alert" className="text-sm text-red-700">{validationError}</p>}
      {create.error && <StateMessage tone="error">Не удалось создать анализ: {create.error.message}</StateMessage>}
      <Button type="submit" disabled={create.isPending}>{create.isPending ? 'Отправка…' : 'Запустить анализ'}</Button>
    </form>
  </div>
}
