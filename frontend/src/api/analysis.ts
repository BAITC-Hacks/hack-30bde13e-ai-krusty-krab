import type { Analysis, CreateAnalysisInput } from '@/types/analysis'

const apiUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, '')
export const isMockMode = !apiUrl

const storageKey = 'hackalem-analyses'
const mockDelay = 1200

function readMock(): Analysis[] {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || '[]') as Analysis[]
  } catch {
    return []
  }
}

function writeMock(analyses: Analysis[]) {
  localStorage.setItem(storageKey, JSON.stringify(analyses))
}

function completeMock(analysis: Analysis): Analysis {
  if (analysis.status !== 'processing' || Date.now() - Date.parse(analysis.createdAt) < mockDelay) return analysis
  return {
    ...analysis,
    status: 'completed',
    summary: {
      beforeDepartments: 0, afterDepartments: 0, preserved: 0, reorganized: 0,
      created: 0, deleted: 0, functionLoss: 0, functionDuplication: 0, responsibilityConflict: 0,
    },
    departments: [], functions: [], findings: [],
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, options)
  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(message || `Ошибка API: ${response.status}`)
  }
  return response.json() as Promise<T>
}

export const analysisApi = {
  async list(): Promise<Analysis[]> {
    if (!isMockMode) return request<Analysis[]>('/analyses')
    const analyses = readMock().map(completeMock)
    writeMock(analyses)
    return analyses.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },

  async get(id: string): Promise<Analysis> {
    if (!isMockMode) return request<Analysis>(`/analyses/${encodeURIComponent(id)}`)
    const analyses = readMock()
    const index = analyses.findIndex((analysis) => analysis.id === id)
    if (index === -1) throw new Error('Анализ не найден')
    analyses[index] = completeMock(analyses[index])
    writeMock(analyses)
    return analyses[index]
  },

  async create(input: CreateAnalysisInput): Promise<Analysis> {
    if (!isMockMode) {
      const form = new FormData()
      input.before.forEach((file) => form.append('beforeFiles', file))
      input.after.forEach((file) => form.append('afterFiles', file))
      return request<Analysis>('/analyses', { method: 'POST', body: form })
    }
    const analysis: Analysis = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      status: 'processing',
      documents: [
        ...input.before.map((file) => ({ id: crypto.randomUUID(), name: file.name, side: 'before' as const })),
        ...input.after.map((file) => ({ id: crypto.randomUUID(), name: file.name, side: 'after' as const })),
      ],
    }
    writeMock([analysis, ...readMock()])
    return analysis
  },
}
