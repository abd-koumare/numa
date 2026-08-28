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
  | 'Annulé'
  | 'Signé'
  | 'Enregistré'
  | 'Archivé'

export type Priority = 'Basse' | 'Normale' | 'Haute' | 'Urgente'

export type SessionUser = {
  name: string
  initials: string
  role: UserRole
  roleLabel: string
  organization: string
  capabilities?: string[]
  accessPending?: boolean
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
  faviconDataUrl: string | null
  primaryColor: string
  accentColor: string
  bannerUrl: string
  fontFamily: 'NUMA' | 'Organisation'
  footerText: string
  defaultHome: 'dashboard' | 'tasks' | 'correspondence'
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

export type DirectoryUserStatus = 'Actif' | 'Inactif' | 'Invitation en attente'

export type DirectoryUser = {
  id: string
  name: string
  initials: string
  email: string
  department: string
  title: string
  status: DirectoryUserStatus
  roles: UserRole[]
  groups: string[]
  lastLogin: string
  identitySubject?: string
}

export type DirectoryGroup = {
  id: string
  name: string
  description: string
  source: 'Active Directory' | 'NUMA'
  memberIds: string[]
  roleIds: UserRole[]
}

export type RoleDefinition = {
  id: UserRole
  label: string
  description: string
  permissions: string[]
  protected?: boolean
}

export type NavigationEntry = {
  id: string
  label: string
  path: string
  visibility: 'Tous les utilisateurs' | 'Utilisateurs autorisés' | 'Administrateurs'
  enabled: boolean
}

export type NotificationItem = {
  id: string
  title: string
  detail: string
  createdAt: string
  kind: 'validation' | 'signature' | 'system' | 'deadline'
  read: boolean
  path: string
}

export type ListDefinition = {
  id: string
  name: string
  description: string
  icon: string
  periodicity: 'Aucune' | 'Annuelle' | 'Mensuelle' | 'Trimestrielle' | 'Personnalisée'
  status: 'Publié' | 'Brouillon' | 'Archivé'
  version: number
  itemCount: number
}

export type RuleDefinition = {
  id: string
  name: string
  scope: string
  condition: string
  action: string
  status: 'Publié' | 'Brouillon' | 'Erreur'
  version: number
}
