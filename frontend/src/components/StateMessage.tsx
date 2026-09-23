export function StateMessage({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'error' }) {
  return <div className={`state-panel ${tone === 'error' ? 'state-panel--error' : ''}`}>{children}</div>
}
