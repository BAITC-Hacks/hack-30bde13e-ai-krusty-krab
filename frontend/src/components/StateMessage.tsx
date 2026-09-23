import { Card, CardContent } from '@/components/ui/card'

export function StateMessage({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'error' }) {
  return (
    <Card className={tone === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-dashed'}>
      <CardContent className="py-8 text-sm">{children}</CardContent>
    </Card>
  )
}
