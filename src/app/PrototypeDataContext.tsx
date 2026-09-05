import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'
import { API_DATA_ENABLED, apiFetch, ifMatch } from '../api/client'
import type {
  DirectoryGroup,
  DirectoryUser,
  ListDefinition,
  NavigationEntry,
  NotificationItem,
  RoleDefinition,
  RuleDefinition,
  UserRole,
} from '../types/ui'
import { parseRuleAction, parseRuleCondition, ruleActionToText, ruleConditionToText, updateRuleData } from './ruleDsl'

const STORAGE_KEY = 'numa.prototype-data.v1'

const defaultUsers: DirectoryUser[] = [
  { id: 'user-kader', name: 'Kader Yao', initials: 'KY', email: 'kader.yao@orgatech.ci', department: 'DSI', title: 'Chef de projet', status: 'Actif', roles: ['configurateur'], groups: ['grp-dsi'], lastLogin: '15/08/2026 · 16:42' },
  { id: 'user-awa', name: 'Awa Kouassi', initials: 'AK', email: 'awa.kouassi@orgatech.ci', department: 'Direction Technique', title: 'Directrice Technique', status: 'Actif', roles: ['validateur'], groups: ['grp-direction'], lastLogin: '15/08/2026 · 15:18' },
  { id: 'user-mariam', name: 'Mariam Diarra', initials: 'MD', email: 'mariam.diarra@orgatech.ci', department: 'Secrétariat général', title: 'Cheffe de service', status: 'Actif', roles: ['gestionnaire', 'validateur'], groups: ['grp-gestionnaires'], lastLogin: '15/08/2026 · 14:05' },
  { id: 'user-sekou', name: 'Sékou Bamba', initials: 'SB', email: 'sekou.bamba@orgatech.ci', department: 'Finance', title: 'Auditeur interne', status: 'Actif', roles: ['auditeur'], groups: ['grp-audit'], lastLogin: '14/08/2026 · 17:31' },
  { id: 'user-fatou', name: 'Fatou Koné', initials: 'FK', email: 'fatou.kone@orgatech.ci', department: 'Ressources humaines', title: 'Assistante RH', status: 'Inactif', roles: ['lecteur'], groups: [], lastLogin: '03/08/2026 · 09:12' },
]

const defaultGroups: DirectoryGroup[] = [
  { id: 'grp-dsi', name: 'NUMA-DSI', description: 'Configuration fonctionnelle et support NUMA', source: 'Active Directory', memberIds: ['user-kader'], roleIds: ['configurateur'] },
  { id: 'grp-direction', name: 'NUMA-Directions', description: 'Validateurs et signataires des directions', source: 'Active Directory', memberIds: ['user-awa'], roleIds: ['validateur'] },
  { id: 'grp-gestionnaires', name: 'Gestionnaires courrier', description: 'Agents chargés de l’enregistrement et du suivi', source: 'NUMA', memberIds: ['user-mariam'], roleIds: ['gestionnaire'] },
  { id: 'grp-audit', name: 'Audit interne', description: 'Consultation du journal selon le périmètre autorisé', source: 'Active Directory', memberIds: ['user-sekou'], roleIds: ['auditeur'] },
]

const defaultRoles: RoleDefinition[] = [
  { id: 'super-admin', label: 'Super administrateur', description: 'Administration technique, restauration et sécurité.', permissions: ['site.manage', 'page.publish', 'list.delete', 'backup.restore', 'audit.read'], protected: true },
  { id: 'admin', label: 'Administrateur', description: 'Sites, pages, listes, modèles et utilisateurs.', permissions: ['site.manage', 'page.create', 'page.edit', 'page.publish', 'list.create', 'list.edit', 'user.manage'] },
  { id: 'configurateur', label: 'Configurateur', description: 'Champs, formulaires, vues, règles et workflows.', permissions: ['list.edit', 'numbering.configure', 'workflow.configure', 'page.edit'] },
  { id: 'gestionnaire', label: 'Gestionnaire', description: 'Création et suivi des éléments métier.', permissions: ['item.create', 'item.read', 'item.edit', 'item.submit'] },
  { id: 'validateur', label: 'Validateur', description: 'Approbation, rejet et signature selon habilitation.', permissions: ['item.read', 'item.approve', 'item.reject', 'signature.sign'] },
  { id: 'utilisateur', label: 'Utilisateur', description: 'Création et consultation selon les droits.', permissions: ['item.create', 'item.read'] },
  { id: 'lecteur', label: 'Lecteur', description: 'Consultation uniquement.', permissions: ['item.read'] },
  { id: 'auditeur', label: 'Auditeur', description: 'Consultation du journal selon le périmètre.', permissions: ['audit.read', 'item.read'] },
]

const defaultNavigation: NavigationEntry[] = [
  { id: 'nav-home', label: 'Accueil', path: '/', visibility: 'Tous les utilisateurs', enabled: true },
  { id: 'nav-mail', label: 'Courriers', path: '/courriers', visibility: 'Utilisateurs autorisés', enabled: true },
  { id: 'nav-tasks', label: 'Mes tâches', path: '/taches', visibility: 'Utilisateurs autorisés', enabled: true },
  { id: 'nav-admin', label: 'Administration', path: '/administration', visibility: 'Administrateurs', enabled: true },
]

const defaultNotifications: NotificationItem[] = [
  { id: 'notif-1', title: 'Signature requise', detail: 'EXT-0040/2026 · échéance aujourd’hui', createdAt: 'Il y a 12 min', kind: 'signature', read: false, path: '/courriers/externes/ext-0040-2026/signature' },
  { id: 'notif-2', title: 'Validation demandée', detail: 'Demande de subvention 2026', createdAt: 'Il y a 48 min', kind: 'validation', read: false, path: '/courriers/externes/ext-0052-2026' },
  { id: 'notif-3', title: 'Échéance proche', detail: 'INT-0187/2026 · demain à 10:00', createdAt: 'Il y a 2 h', kind: 'deadline', read: false, path: '/courriers/internes/int-0187-2026' },
  { id: 'notif-4', title: 'Import terminé', detail: '1 218 courriers externes créés', createdAt: 'Hier', kind: 'system', read: true, path: '/activite' },
]

const defaultLists: ListDefinition[] = [
  { id: 'courriers-externes', name: 'Courriers externes', description: 'Registre annuel des courriers reçus et envoyés.', icon: 'Courrier', periodicity: 'Annuelle', status: 'Publié', version: 12, itemCount: 1482 },
  { id: 'courriers-internes', name: 'Courriers internes', description: 'Notes, décisions et échanges internes.', icon: 'Note', periodicity: 'Annuelle', status: 'Publié', version: 9, itemCount: 1164 },
  { id: 'demandes-achats', name: 'Demandes d’achat', description: 'Demandes avec validation financière.', icon: 'Formulaire', periodicity: 'Aucune', status: 'Brouillon', version: 2, itemCount: 0 },
]

const defaultRules: RuleDefinition[] = [
  { id: 'rule-amount', name: 'Validation DAF au-delà du seuil', scope: 'Demandes d’achat', condition: 'montant > 1 000 000', action: 'Ajouter la validation DAF', status: 'Publié', version: 4 },
  { id: 'rule-confidential', name: 'Accès aux courriers confidentiels', scope: 'Courriers', condition: 'confidentialité = Confidentiel', action: 'Limiter au groupe Direction', status: 'Publié', version: 3 },
  { id: 'rule-attachment', name: 'Justificatif obligatoire', scope: 'Courriers externes', condition: 'priorité = Urgente', action: 'Exiger une pièce jointe', status: 'Brouillon', version: 1 },
]

type PrototypeState = {
  users: DirectoryUser[]
  groups: DirectoryGroup[]
  roles: RoleDefinition[]
  navigationEntries: NavigationEntry[]
  notifications: NotificationItem[]
  lists: ListDefinition[]
  rules: RuleDefinition[]
}

type PrototypeDataContextValue = PrototypeState & {
  loading: boolean
  error: string
  refresh: () => Promise<void>
  addUser: (user: DirectoryUser) => Promise<DirectoryUser>
  updateUser: (id: string, patch: Partial<DirectoryUser>) => Promise<void>
  addGroup: (group: DirectoryGroup) => Promise<DirectoryGroup>
  updateGroup: (id: string, patch: Partial<DirectoryGroup>) => Promise<void>
  updateRolePermissions: (id: UserRole, permissions: string[]) => Promise<void>
  updateNavigation: (entries: NavigationEntry[]) => Promise<void>
  markNotificationRead: (id: string) => Promise<void>
  markAllNotificationsRead: () => Promise<void>
  addList: (list: ListDefinition) => Promise<ListDefinition>
  updateList: (id: string, patch: Partial<ListDefinition>) => Promise<void>
  addRule: (rule: RuleDefinition) => Promise<RuleDefinition>
  updateRule: (id: string, patch: Partial<RuleDefinition>) => Promise<void>
}

const defaultState: PrototypeState = { users: defaultUsers, groups: defaultGroups, roles: defaultRoles, navigationEntries: defaultNavigation, notifications: defaultNotifications, lists: defaultLists, rules: defaultRules }
const PrototypeDataContext = createContext<PrototypeDataContextValue | null>(null)

function loadState(): PrototypeState {
  if (API_DATA_ENABLED) return { ...defaultState, users: [], groups: [], roles: [], notifications: [], lists: [], rules: [] }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultState
    const stored = JSON.parse(raw) as Partial<PrototypeState>
    return {
      users: stored.users ?? defaultUsers,
      groups: stored.groups ?? defaultGroups,
      roles: stored.roles ?? defaultRoles,
      navigationEntries: stored.navigationEntries ?? defaultNavigation,
      notifications: stored.notifications ?? defaultNotifications,
      lists: stored.lists ?? defaultLists,
      rules: stored.rules ?? defaultRules,
    }
  } catch {
    return defaultState
  }
}

type ApiPage<T> = { count: number; next: string | null; results: T[] }
type ApiUser = Omit<DirectoryUser, 'lastLogin'> & { last_login: string; department_code?: string }
type ApiGroup = { id: string; name: string; description: string; source: 'local' | 'directory'; member_ids: string[]; role_ids: UserRole[] }
type ApiRole = { id: UserRole; label: string; description: string; permissions: string[]; protected: boolean }
type ApiNotification = { id: string; title: string; detail: string; created_at: string; kind: NotificationItem['kind']; read: boolean; path: string }
type ApiVersion = { version: number; state: 'draft' | 'published' | 'archived'; data: Record<string, unknown> }
type ApiConfiguration = { id: string; kind: string; slug: string; name: string; description: string; current_version: ApiVersion | null; latest_version: ApiVersion | null }

async function fetchAll<T>(path: string) {
  const separator = path.includes('?') ? '&' : '?'
  const results: T[] = []
  let pageNumber = 1
  while (pageNumber <= 100) {
    const page = await apiFetch<ApiPage<T>>(`${path}${separator}page_size=100&page=${pageNumber}`)
    results.push(...page.results)
    if (!page.next) break
    pageNumber += 1
  }
  return results
}

function humanDate(value: string) {
  if (!value) return 'Jamais'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

function mapApiUser(user: ApiUser): DirectoryUser {
  return { id: user.id, name: user.name, initials: user.initials, email: user.email, department: user.department, title: user.title, status: user.status, roles: user.roles, groups: user.groups, lastLogin: humanDate(user.last_login) }
}

function mapConfiguration(definition: ApiConfiguration): ListDefinition | RuleDefinition | null {
  const version = definition.latest_version ?? definition.current_version
  if (!version) return null
  const data = version.data
  const status = version.state === 'published' ? 'Publié' : version.state === 'archived' ? 'Archivé' : 'Brouillon'
  if (definition.kind === 'list') {
    const periods: Record<string, ListDefinition['periodicity']> = { none: 'Aucune', yearly: 'Annuelle', monthly: 'Mensuelle', quarterly: 'Trimestrielle', custom: 'Personnalisée' }
    return { id: definition.id, name: definition.name, description: definition.description, icon: String(data.icon ?? 'Registre'), periodicity: periods[String(data.periodicity)] ?? 'Aucune', status, version: version.version, itemCount: Number(data.itemCount ?? 0) }
  }
  if (definition.kind === 'rule') {
    const actionValue = Array.isArray(data.actions) ? data.actions[0] : data.action
    return { id: definition.id, name: definition.name, scope: String(data.scope ?? ''), condition: ruleConditionToText(data.condition), action: ruleActionToText(actionValue), status: status === 'Archivé' ? 'Erreur' : status, version: version.version }
  }
  return null
}

async function saveConfiguration(kind: string, slug: string, name: string, data: Record<string, unknown>, publish = true, description = '') {
  const page = await apiFetch<ApiPage<ApiConfiguration>>(`/configurations/?kind=${encodeURIComponent(kind)}&search=${encodeURIComponent(slug)}&page_size=100`)
  let definition = page.results.find((item) => item.slug === slug)
  if (!definition) {
    definition = await apiFetch<ApiConfiguration>('/configurations/', { method: 'POST', body: JSON.stringify({ kind, slug, name, description, data }) })
  } else {
    const latest = definition.latest_version
    if (!latest) throw new Error('La configuration ne possède aucune version.')
    definition = await apiFetch<ApiConfiguration>(`/configurations/${definition.id}/`, { method: 'PATCH', headers: ifMatch(latest.version), body: JSON.stringify({ name, description: description || definition.description, data }) })
  }
  if (publish && definition.latest_version?.state === 'draft') {
    definition = await apiFetch<ApiConfiguration>(`/configurations/${definition.id}/publish/`, { method: 'POST', headers: ifMatch(definition.latest_version.version), body: JSON.stringify({}) })
  }
  return definition
}

export function PrototypeDataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PrototypeState>(loadState)
  const [loading, setLoading] = useState(API_DATA_ENABLED)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!API_DATA_ENABLED) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const refresh = async () => {
    if (!API_DATA_ENABLED) return
    setLoading(true); setError('')
    try {
      const [apiUsers, apiGroups, apiRoles, apiNotifications, configurations] = await Promise.all([
        fetchAll<ApiUser>('/identity/users/').catch(() => []), fetchAll<ApiGroup>('/identity/groups/').catch(() => []),
        fetchAll<ApiRole>('/identity/roles/').catch(() => []), fetchAll<ApiNotification>('/notifications/'),
        fetchAll<ApiConfiguration>('/configurations/').catch(() => []),
      ])
      const navigation = configurations.find((item) => item.kind === 'navigation' && item.slug === 'main-navigation')?.current_version?.data.entries
      const mapped = configurations.map(mapConfiguration).filter((item): item is ListDefinition | RuleDefinition => item !== null)
      setState({
        users: apiUsers.map(mapApiUser),
        groups: apiGroups.map((group) => ({ id: group.id, name: group.name, description: group.description, source: group.source === 'directory' ? 'Active Directory' : 'NUMA', memberIds: group.member_ids, roleIds: group.role_ids })),
        roles: apiRoles,
        navigationEntries: Array.isArray(navigation) ? navigation as NavigationEntry[] : defaultNavigation,
        notifications: apiNotifications.map((item) => ({ id: item.id, title: item.title, detail: item.detail, createdAt: humanDate(item.created_at), kind: item.kind, read: item.read, path: item.path })),
        lists: mapped.filter((item): item is ListDefinition => 'itemCount' in item),
        rules: mapped.filter((item): item is RuleDefinition => 'condition' in item),
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Les données NUMA n’ont pas pu être chargées.')
    } finally { setLoading(false) }
  }

  useEffect(() => { if (API_DATA_ENABLED) void refresh() }, [])

  const value: PrototypeDataContextValue = {
    ...state, loading, error, refresh,
    addUser: async (user) => {
      if (!API_DATA_ENABLED) { setState((current) => ({ ...current, users: [user, ...current.users] })); return user }
      const created = await apiFetch<ApiUser>('/identity/users/', { method: 'POST', body: JSON.stringify({ name: user.name, email: user.email, title: user.title, roles: user.roles, groups: user.groups, active: user.status !== 'Inactif', identity_subject: user.identitySubject }) })
      const mapped = mapApiUser(created)
      setState((current) => ({ ...current, users: [mapped, ...current.users] }))
      return mapped
    },
    updateUser: async (id, patch) => {
      if (API_DATA_ENABLED) await apiFetch(`/identity/users/${id}/`, { method: 'PATCH', body: JSON.stringify({ ...(patch.name !== undefined ? { name: patch.name } : {}), ...(patch.email !== undefined ? { email: patch.email } : {}), ...(patch.title !== undefined ? { title: patch.title } : {}), ...(patch.roles !== undefined ? { roles: patch.roles } : {}), ...(patch.groups !== undefined ? { groups: patch.groups } : {}), ...(patch.status !== undefined ? { active: patch.status === 'Actif' } : {}) }) })
      setState((current) => ({ ...current, users: current.users.map((user) => user.id === id ? { ...user, ...patch } : user) }))
    },
    addGroup: async (group) => {
      if (!API_DATA_ENABLED) { setState((current) => ({ ...current, groups: [group, ...current.groups] })); return group }
      const created = await apiFetch<ApiGroup>('/identity/groups/', { method: 'POST', body: JSON.stringify({ name: group.name, description: group.description, source: 'local', member_ids: group.memberIds, role_ids: group.roleIds }) })
      const mapped: DirectoryGroup = { id: created.id, name: created.name, description: created.description, source: 'NUMA', memberIds: created.member_ids, roleIds: created.role_ids }
      setState((current) => ({ ...current, groups: [mapped, ...current.groups] })); return mapped
    },
    updateGroup: async (id, patch) => {
      if (API_DATA_ENABLED) await apiFetch(`/identity/groups/${id}/`, { method: 'PATCH', body: JSON.stringify({ ...(patch.name !== undefined ? { name: patch.name } : {}), ...(patch.description !== undefined ? { description: patch.description } : {}), ...(patch.memberIds !== undefined ? { member_ids: patch.memberIds } : {}), ...(patch.roleIds !== undefined ? { role_ids: patch.roleIds } : {}) }) })
      setState((current) => ({ ...current, groups: current.groups.map((group) => group.id === id ? { ...group, ...patch } : group) }))
    },
    updateRolePermissions: async (id, permissions) => {
      if (API_DATA_ENABLED) await apiFetch(`/identity/roles/${id}/`, { method: 'PATCH', body: JSON.stringify({ permissions }) })
      setState((current) => ({ ...current, roles: current.roles.map((role) => role.id === id ? { ...role, permissions } : role) }))
    },
    updateNavigation: async (navigationEntries) => {
      if (API_DATA_ENABLED) await saveConfiguration('navigation', 'main-navigation', 'Navigation principale', { entries: navigationEntries })
      setState((current) => ({ ...current, navigationEntries }))
    },
    markNotificationRead: async (id) => {
      if (API_DATA_ENABLED) await apiFetch(`/notifications/${id}/read/`, { method: 'POST', body: JSON.stringify({}) })
      setState((current) => ({ ...current, notifications: current.notifications.map((item) => item.id === id ? { ...item, read: true } : item) }))
    },
    markAllNotificationsRead: async () => {
      if (API_DATA_ENABLED) await apiFetch('/notifications/read-all/', { method: 'POST', body: JSON.stringify({}) })
      setState((current) => ({ ...current, notifications: current.notifications.map((item) => ({ ...item, read: true })) }))
    },
    addList: async (list) => {
      if (!API_DATA_ENABLED) { setState((current) => ({ ...current, lists: [list, ...current.lists] })); return list }
      const definition = await saveConfiguration('list', list.id, list.name, { icon: list.icon, periodicity: { Aucune: 'none', Annuelle: 'yearly', Mensuelle: 'monthly', Trimestrielle: 'quarterly', Personnalisée: 'custom' }[list.periodicity], registry: 'custom', columns: [] }, false, list.description)
      const mapped = { ...list, id: definition.id, version: definition.latest_version?.version ?? 1 }
      setState((current) => ({ ...current, lists: [mapped, ...current.lists] })); return mapped
    },
    updateList: async (id, patch) => {
      const current = state.lists.find((item) => item.id === id)
      if (API_DATA_ENABLED && current) {
        const detail = await apiFetch<ApiConfiguration>(`/configurations/${id}/`)
        if (!detail.latest_version) throw new Error('Version de liste introuvable.')
        await apiFetch(`/configurations/${id}/`, { method: 'PATCH', headers: ifMatch(detail.latest_version.version), body: JSON.stringify({ name: patch.name ?? current.name, description: patch.description ?? current.description, data: { ...detail.latest_version.data, ...patch } }) })
      }
      setState((value) => ({ ...value, lists: value.lists.map((list) => list.id === id ? { ...list, ...patch } : list) }))
    },
    addRule: async (rule) => {
      if (!API_DATA_ENABLED) { setState((current) => ({ ...current, rules: [rule, ...current.rules] })); return rule }
      const slug = `rule-${Date.now()}`
      const definition = await saveConfiguration('rule', slug, rule.name, { scope: rule.scope, condition: parseRuleCondition(rule.condition), events: ['submit'], actions: [parseRuleAction(rule.action)] }, rule.status === 'Publié')
      const mapped = { ...rule, id: definition.id, version: definition.latest_version?.version ?? 1 }
      setState((current) => ({ ...current, rules: [mapped, ...current.rules] })); return mapped
    },
    updateRule: async (id, patch) => {
      const current = state.rules.find((item) => item.id === id)
      if (API_DATA_ENABLED && current) {
        const detail = await apiFetch<ApiConfiguration>(`/configurations/${id}/`)
        if (!detail.latest_version) throw new Error('Version de règle introuvable.')
        const merged = { ...current, ...patch }
        let updated = await apiFetch<ApiConfiguration>(`/configurations/${id}/`, { method: 'PATCH', headers: ifMatch(detail.latest_version.version), body: JSON.stringify({ name: merged.name, data: updateRuleData(detail.latest_version.data, merged) }) })
        const draft = mapConfiguration(updated) as RuleDefinition
        setState((value) => ({ ...value, rules: value.rules.map((rule) => rule.id === id ? draft : rule) }))
        if (merged.status === 'Publié' && updated.latest_version?.state === 'draft') updated = await apiFetch<ApiConfiguration>(`/configurations/${id}/publish/`, { method: 'POST', headers: ifMatch(updated.latest_version.version), body: JSON.stringify({}) })
        const mapped = mapConfiguration(updated) as RuleDefinition
        setState((value) => ({ ...value, rules: value.rules.map((rule) => rule.id === id ? mapped : rule) }))
        return
      }
      setState((value) => ({ ...value, rules: value.rules.map((rule) => rule.id === id ? { ...rule, ...patch } : rule) }))
    },
  }

  return <PrototypeDataContext.Provider value={value}>{children}</PrototypeDataContext.Provider>
}

export function usePrototypeData() {
  const context = useContext(PrototypeDataContext)
  if (!context) throw new Error('usePrototypeData must be used within PrototypeDataProvider')
  return context
}
