export type Side = 'before' | 'after'
export type AnalysisStatus = 'queued' | 'processing' | 'completed' | 'failed'
export type FindingType = 'FUNCTION_LOSS' | 'FUNCTION_DUPLICATION' | 'RESPONSIBILITY_CONFLICT'
export type Severity = 'low' | 'medium' | 'high'

export interface Document {
  id: string
  name: string
  side: Side
}

export interface Evidence {
  documentId: string
  documentName: string
  side: Side
  page?: number
  section?: string
  text: string
}

export interface Finding {
  id: string
  type: FindingType
  severity: Severity
  confidence: number
  title: string
  explanation: string
  department?: string
  function?: string
  status?: string
  evidence: Evidence[]
}

export interface Department {
  id: string
  name: string
  side: Side
  changeType?: 'preserved' | 'reorganized' | 'created' | 'deleted'
  mappedDepartmentId?: string
}

export interface OrgFunction {
  id: string
  name: string
  side: Side
  departmentId: string
  departmentName: string
}

export interface AnalysisSummary {
  beforeDepartments: number
  afterDepartments: number
  preserved: number
  reorganized: number
  created: number
  deleted: number
  functionLoss: number
  functionDuplication: number
  responsibilityConflict: number
}

export interface Analysis {
  id: string
  createdAt: string
  status: AnalysisStatus
  error?: string
  documents: Document[]
  summary?: AnalysisSummary
  departments?: Department[]
  functions?: OrgFunction[]
  findings?: Finding[]
}

export interface CreateAnalysisInput {
  before: File[]
  after: File[]
}
