export type UserRole =
  | 'super-admin'
  | 'admin'
  | 'configurateur'
  | 'gestionnaire'
  | 'validateur'
  | 'utilisateur'
  | 'lecteur'
  | 'auditeur'

export type NavItem = {
  label: string
  path: string
  icon?: 'home' | 'mail' | 'archive' | 'tasks' | 'settings' | 'page' | 'template' | 'workflow' | 'audit' | 'backup'
  permissions?: string[]
}

export type NavGroup = NavItem & {
  children?: NavItem[]
}

export type RouteContext = {
  path: string
  breadcrumbs: string[]
  context: string
}

export type BusinessStatus =
  | 'À traiter'
  | 'En validation'
  | 'Validé'
  | 'Brouillon'
  | 'Rejeté'
  | 'Signé'

export type Priority = 'Basse' | 'Normale' | 'Haute' | 'Urgente'

export type SessionUser = {
  name: string
  initials: string
  role: UserRole
  roleLabel: string
  organization: string
}

export type Metric = {
  label: string
  value: number
  tone: 'primary' | 'warning' | 'error'
}

export type RegistrySummary = {
  id: 'internal' | 'external'
  label: string
  path: string
  metrics: Metric[]
}

export type TaskItem = {
  id: string
  reference: string
  title: string
  detail: string
  relativeTime: string
  status: BusinessStatus
}

export type ActivityItem = {
  id: string
  title: string
  actor: string
  relativeTime: string
  kind: 'success' | 'info' | 'attachment' | 'assignment'
}

export type ChartPeriod = 'week' | 'month' | 'year'

export type ChartSeries = {
  labels: string[]
  internal: number[]
  external: number[]
}

export type Confidentiality = 'Standard' | 'Restreint' | 'Confidentiel'

export type Correspondence = {
  id: string
  reference: string
  receivedAt: string
  subject: string
  sender: string
  direction: string
  priority: Priority
  status: BusinessStatus
  confidentiality: Confidentiality
  attachmentCount: number
}

export type DocumentVersion = {
  id: string
  version: number
  fileName: string
  mimeType: string
  size: string
  createdAt: string
  author: string
  sha256: string
  status: 'Active' | 'Remplacée' | 'Signée'
}

export type WorkflowStep = {
  id: string
  label: string
  actor: string
  status: 'Terminée' | 'En cours' | 'À venir' | 'Rejetée'
  completedAt?: string
  comment?: string
}

export type SignatureLevel = 'electronic-validation' | 'graphic' | 'digital'
export type SignatureStatus = 'requested' | 'processing' | 'verified' | 'failed' | 'cancelled'

export type SiteBrandingSettings = {
  organizationName: string
  applicationName: string
  logoDataUrl: string | null
  logoFileName: string | null
  logoMimeType: 'image/png' | 'image/svg+xml' | null
}

export type CounterScope =
  | 'global'
  | 'year'
  | 'list'
  | 'instance'
  | 'direction-year'
  | 'service-year'
  | 'type-year'

export type NumberingSettings = {
  format: string
  counterScope: CounterScope
  resetPeriod: 'yearly' | 'monthly' | 'never'
  sharedAcrossRegistries: boolean
  assignmentTrigger: 'creation' | 'submission' | 'validation' | 'signature' | 'registration'
  cancelledNumberPolicy: 'keep'
  nextSequence: number
}

export type SignatureProof = {
  id: string
  documentVersionId: string
  level: SignatureLevel
  status: SignatureStatus
  signer: string
  signerRole: string
  signedAt: string
  documentHash: string
  certificate?: string
  timestamp?: string
  ipAddress: string
}

export type WorkflowTask = {
  id: string
  reference: string
  subject: string
  requester: string
  requestedAt: string
  dueAt: string
  kind: 'Validation' | 'Signature' | 'Traitement'
  priority: Priority
  status: 'À faire' | 'En retard' | 'Terminée'
}
