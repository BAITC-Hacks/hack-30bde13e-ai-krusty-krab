import type { Analysis, CreateAnalysisInput, Document, Finding, OrgFunction, Side } from '@/types/analysis'

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
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || `Ошибка API: ${response.status}`)
  }
  return response.json() as Promise<T>
}

type BackendAnalysis = { id: string; status: string; created_at: string }
type BackendDocument = { id: string; filename: string; side: string }
type Source = { document_id: string; document_name: string; page: number | null;
  sheet: string | null; section: string | null; paragraph: number | null; text: string }
type ServiceResult = {
  summary?: { before_departments: number; after_departments: number } | string
  departments?: { id: string; name: string; side: string }[]
  department_matches?: { before_id: string | null; after_id: string | null; relation: string }[]
  functions?: { id: string; text: string; side: string; department: string }[]
  findings?: { id: string; type: Finding['type']; severity: Finding['severity']; confidence: number;
    title: string; explanation: string; evidence: Source[]; function_ids: string[] }[]
}

const statusMap: Record<string, Analysis['status']> = {
  CREATED: 'queued', UPLOADING: 'queued', PROCESSING: 'processing',
  COMPLETED: 'completed', FAILED: 'failed',
}

function adapt(row: BackendAnalysis, files: BackendDocument[], result?: ServiceResult): Analysis {
  const documents: Document[] = files.map((file) => ({
    id: file.id, name: file.filename, side: file.side.toLowerCase() as Side,
  }))
  const departments = result?.departments ?? []
  const rawFunctions = result?.functions ?? []
  const matches = result?.department_matches ?? []
  const findings = result?.findings ?? []
  const documentSides = new Map(documents.map((document) => [document.id, document.side]))
  const departmentNames = new Map(departments.map((department) => [department.id, department.name]))
  const changes = new Map(matches.flatMap((match) => {
    const type = match.relation === 'UNCHANGED' ? 'preserved' :
      match.relation === 'CREATED' ? 'created' : match.relation === 'REMOVED' ? 'deleted' :
        ['RENAMED', 'TRANSFORMED'].includes(match.relation) ? 'reorganized' : undefined
    return type ? [match.before_id, match.after_id].filter((id): id is string => id !== null)
      .map((id) => [id, type] as const) : []
  }))
  const functions: OrgFunction[] = rawFunctions.map((item) => ({
    id: item.id, name: item.text, side: item.side.toLowerCase() as Side,
    departmentId: item.department, departmentName: departmentNames.get(item.department) ?? 'Не указано',
  }))
  const functionById = new Map(functions.map((item) => [item.id, item]))

  return {
    id: row.id, createdAt: row.created_at,
    status: statusMap[row.status] ?? 'failed',
    documents, demo: typeof result?.summary === 'string',
    ...(result ? {
      summary: {
        beforeDepartments: typeof result.summary === 'object' ? result.summary.before_departments : 0,
        afterDepartments: typeof result.summary === 'object' ? result.summary.after_departments : 0,
        preserved: matches.filter((item) => item.relation === 'UNCHANGED').length,
        reorganized: matches.filter((item) => ['RENAMED', 'TRANSFORMED'].includes(item.relation)).length,
        created: matches.filter((item) => item.relation === 'CREATED').length,
        deleted: matches.filter((item) => item.relation === 'REMOVED').length,
        functionLoss: findings.filter((item) => item.type === 'FUNCTION_LOSS').length,
        functionDuplication: findings.filter((item) => item.type === 'FUNCTION_DUPLICATION').length,
        responsibilityConflict: findings.filter((item) => item.type === 'RESPONSIBILITY_CONFLICT').length,
      },
      departments: departments.map((item) => ({ id: item.id, name: item.name,
        side: item.side.toLowerCase() as Side, changeType: changes.get(item.id) })),
      functions,
      findings: findings.map((item) => {
        const related = functionById.get(item.function_ids[0])
        return { id: item.id, type: item.type, severity: item.severity, confidence: item.confidence,
          title: item.title, explanation: item.explanation, function: related?.name,
          department: related?.departmentName, evidence: item.evidence.map((source) => ({
            documentId: source.document_id, documentName: source.document_name,
            side: documentSides.get(source.document_id) ?? 'before',
            page: source.page ?? undefined,
            section: [source.sheet, source.section, source.paragraph && `Абзац ${source.paragraph}`]
              .filter(Boolean).join(' · ') || undefined,
            text: source.text,
          })),
        }
      }),
    } : {}),
  }
}

async function load(row: BackendAnalysis): Promise<Analysis> {
  const files = await request<BackendDocument[]>(`/analyses/${row.id}/documents`)
  const result = row.status === 'COMPLETED'
    ? await request<ServiceResult>(`/analyses/${row.id}/result`) : undefined
  return adapt(row, files, result)
}

export const analysisApi = {
  async list(): Promise<Analysis[]> {
    if (!isMockMode) return Promise.all((await request<BackendAnalysis[]>('/analyses')).map(load))
    const analyses = readMock().map(completeMock)
    writeMock(analyses)
    return analyses.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },

  async get(id: string): Promise<Analysis> {
    if (!isMockMode) return load(await request<BackendAnalysis>(`/analyses/${encodeURIComponent(id)}`))
    const analyses = readMock()
    const index = analyses.findIndex((analysis) => analysis.id === id)
    if (index === -1) throw new Error('Анализ не найден')
    analyses[index] = completeMock(analyses[index])
    writeMock(analyses)
    return analyses[index]
  },

  async create(input: CreateAnalysisInput): Promise<Analysis> {
    if (!isMockMode) {
      const row = await request<BackendAnalysis>('/analyses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `Анализ ${new Date().toLocaleString('ru-RU')}` }),
      })
      for (const [side, files] of [['before', input.before], ['after', input.after]] as const) {
        for (const file of files) {
          const form = new FormData()
          form.set('side', side)
          form.set('file', file)
          await request(`/analyses/${row.id}/documents`, { method: 'POST', body: form })
        }
      }
      await request(`/analyses/${row.id}/run`, { method: 'POST' })
      return load(await request<BackendAnalysis>(`/analyses/${row.id}`))
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
