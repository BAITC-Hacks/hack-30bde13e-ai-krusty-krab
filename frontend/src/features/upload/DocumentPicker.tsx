import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Side } from '@/types/analysis'

const allowedExtensions = /\.(pdf|docx|xlsx)$/i

export function DocumentPicker({ side, files, onChange, onError }: {
  side: Side
  files: File[]
  onChange: (files: File[]) => void
  onError: (message: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  function addFiles(selected: FileList | null) {
    if (!selected) return
    const next = Array.from(selected)
    if (next.some((file) => !allowedExtensions.test(file.name))) {
      onError('Поддерживаются только PDF, DOCX и XLSX.')
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    onError('')
    const current = new Set(files.map((file) => `${file.name}:${file.size}:${file.lastModified}`))
    onChange([...files, ...next.filter((file) => !current.has(`${file.name}:${file.size}:${file.lastModified}`))])
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <Card>
      <CardHeader><CardTitle>{side === 'before' ? 'BEFORE · До реорганизации' : 'AFTER · После реорганизации'}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">PDF, DOCX или XLSX</p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          multiple
          className="sr-only"
          id={`files-${side}`}
          onChange={(event) => addFiles(event.target.files)}
        />
        <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>Выбрать файлы</Button>
        {files.length === 0 ? <p className="text-sm text-muted-foreground">Файлы пока не выбраны</p> : (
          <ul className="space-y-2" aria-label={`Файлы ${side}`}>
            {files.map((file) => (
              <li key={`${file.name}:${file.size}:${file.lastModified}`} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
                <span className="min-w-0 truncate" title={file.name}>{file.name}</span>
                <Button type="button" size="sm" variant="ghost" aria-label={`Удалить ${file.name}`} onClick={() => onChange(files.filter((item) => item !== file))}>Удалить</Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
