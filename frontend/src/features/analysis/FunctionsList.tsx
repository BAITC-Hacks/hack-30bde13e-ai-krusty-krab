import { Badge } from '@/components/ui/badge'
import { StateMessage } from '@/components/StateMessage'
import { sideLabel } from '@/lib/labels'
import type { OrgFunction } from '@/types/analysis'

export function FunctionsList({ functions }: { functions: OrgFunction[] }) {
  if (!functions.length) return <StateMessage>Функции пока не найдены.</StateMessage>
  return <ul className="divide-y rounded-lg border bg-white">
    {functions.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
      <div><p className="font-medium">{item.name}</p><p className="text-sm text-muted-foreground">{item.departmentName}</p></div>
      <Badge variant="outline">{sideLabel[item.side]}</Badge>
    </li>)}
  </ul>
}
