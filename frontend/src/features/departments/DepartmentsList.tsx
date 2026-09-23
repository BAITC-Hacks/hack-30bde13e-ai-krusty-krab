import { StateMessage } from '@/components/StateMessage'
import { sideLabel } from '@/lib/labels'
import type { Department } from '@/types/analysis'

const changeLabel = { preserved: 'Сохранено', reorganized: 'Реорганизовано', created: 'Создано', deleted: 'Удалено' }

export function DepartmentsList({ departments }: { departments: Department[] }) {
  if (!departments.length) return <StateMessage>Подразделения пока не найдены.</StateMessage>
  return <ul className="data-list">
    {departments.map((department) => <li key={department.id} className="data-row"><span className="data-row__name">{department.name}</span><span className="flex flex-wrap items-center justify-end gap-3"><span className="section-count">{sideLabel[department.side]}</span>{department.changeType && <span className="status-pill">{changeLabel[department.changeType]}</span>}</span></li>)}
  </ul>
}
