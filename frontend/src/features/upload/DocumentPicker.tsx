import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import type { Side } from '@/types/analysis'

const allowedExtensions = /\.(pdf|docx|xlsx)$/i
const maxFileSize = 20 * 1024 * 1024

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
    if (next.some((file) => file.size > maxFileSize)) {
      onError('Размер одного файла не должен превышать 20 МБ.')
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    onError('')
    const current = new Set(files.map((file) => `${file.name}:${file.size}:${file.lastModified}`))
    onChange([...files, ...next.filter((file) => !current.has(`${file.name}:${file.size}:${file.lastModified}`))])
    if (inputRef.current) inputRef.current.value = ''
  }

  return <section className="upload-panel" aria-labelledby={`picker-${side}`}>
    <div className="upload-panel__top"><span className="upload-panel__number">{side === 'before' ? '01 / BEFORE' : '02 / AFTER'}</span><span aria-hidden="true">↗</span></div>
    <h2 className="upload-panel__title" id={`picker-${side}`}>{side === 'before' ? 'До реорганизации' : 'После реорганизации'}</h2>
    <p className="upload-panel__hint">PDF, DOCX или XLSX · до 20 МБ</p>
    <input ref={inputRef} type="file" accept=".pdf,.docx,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" multiple className="sr-only" id={`files-${side}`} onChange={(event) => addFiles(event.target.files)} />
    <Button className="upload-panel__action" type="button" variant="outline" size="lg" onClick={() => inputRef.current?.click()}>+ Выбрать файлы</Button>
    {files.length === 0 ? <p className="upload-panel__hint mt-8">Файлы пока не выбраны</p> : <ul className="file-list" aria-label={`Файлы ${side}`}>
      {files.map((file) => <li className="file-item" key={`${file.name}:${file.size}:${file.lastModified}`}><span className="min-w-0 truncate" title={file.name}>{file.name}</span><Button type="button" size="sm" variant="ghost" aria-label={`Удалить ${file.name}`} onClick={() => onChange(files.filter((item) => item !== file))}>Удалить</Button></li>)}
    </ul>}
  </section>
}
