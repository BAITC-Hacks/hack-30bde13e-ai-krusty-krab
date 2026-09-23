import { Badge } from '@/components/ui/badge'
import { StateMessage } from '@/components/StateMessage'
import { sideLabel } from '@/lib/labels'
import type { Department } from '@/types/analysis'

const changeLabel = { preserved: 'Сохранено', reorganized: 'Реорганизовано', created: 'Создано', deleted: 'Удалено' }

export function DepartmentsList({ departments }: { departments: Department[] }) {
  if (!departments.length) return <StateMessage>Подразделения пока не найдены.</StateMessage>
  return <ul className="divide-y rounded-lg border bg-white">
    {departments.map((department) => <li key={department.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
      <span className="font-medium">{department.name}</span>
      <span className="flex gap-2"><Badge variant="outline">{sideLabel[department.side]}</Badge>{department.changeType && <Badge variant="secondary">{changeLabel[department.changeType]}</Badge>}</span>
    </li>)}
  </ul>
}
