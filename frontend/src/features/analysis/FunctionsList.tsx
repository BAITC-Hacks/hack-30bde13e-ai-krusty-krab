import { StateMessage } from '@/components/StateMessage'
import { sideLabel } from '@/lib/labels'
import type { OrgFunction } from '@/types/analysis'

export function FunctionsList({ functions }: { functions: OrgFunction[] }) {
  if (!functions.length) return <StateMessage>Функции пока не найдены.</StateMessage>
  return <ul className="data-list">
    {functions.map((item) => <li key={item.id} className="data-row"><div><p className="data-row__name">{item.name}</p><p className="data-row__sub">{item.departmentName}</p></div><span className="section-count">{sideLabel[item.side]}</span></li>)}
  </ul>
}
