import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react'
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
  addUser: (user: DirectoryUser) => void
  updateUser: (id: string, patch: Partial<DirectoryUser>) => void
  addGroup: (group: DirectoryGroup) => void
  updateGroup: (id: string, patch: Partial<DirectoryGroup>) => void
  updateRolePermissions: (id: UserRole, permissions: string[]) => void
  updateNavigation: (entries: NavigationEntry[]) => void
  markNotificationRead: (id: string) => void
  markAllNotificationsRead: () => void
  addList: (list: ListDefinition) => void
  updateList: (id: string, patch: Partial<ListDefinition>) => void
  addRule: (rule: RuleDefinition) => void
  updateRule: (id: string, patch: Partial<RuleDefinition>) => void
}

const defaultState: PrototypeState = { users: defaultUsers, groups: defaultGroups, roles: defaultRoles, navigationEntries: defaultNavigation, notifications: defaultNotifications, lists: defaultLists, rules: defaultRules }
const PrototypeDataContext = createContext<PrototypeDataContextValue | null>(null)

function loadState(): PrototypeState {
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

export function PrototypeDataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PrototypeState>(loadState)
  useEffect(() => window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)), [state])

  const value = useMemo<PrototypeDataContextValue>(() => ({
    ...state,
    addUser: (user) => setState((current) => ({ ...current, users: [user, ...current.users] })),
    updateUser: (id, patch) => setState((current) => ({ ...current, users: current.users.map((user) => user.id === id ? { ...user, ...patch } : user) })),
    addGroup: (group) => setState((current) => ({ ...current, groups: [group, ...current.groups] })),
    updateGroup: (id, patch) => setState((current) => ({ ...current, groups: current.groups.map((group) => group.id === id ? { ...group, ...patch } : group) })),
    updateRolePermissions: (id, permissions) => setState((current) => ({ ...current, roles: current.roles.map((role) => role.id === id ? { ...role, permissions } : role) })),
    updateNavigation: (navigationEntries) => setState((current) => ({ ...current, navigationEntries })),
    markNotificationRead: (id) => setState((current) => ({ ...current, notifications: current.notifications.map((item) => item.id === id ? { ...item, read: true } : item) })),
    markAllNotificationsRead: () => setState((current) => ({ ...current, notifications: current.notifications.map((item) => ({ ...item, read: true })) })),
    addList: (list) => setState((current) => ({ ...current, lists: [list, ...current.lists] })),
    updateList: (id, patch) => setState((current) => ({ ...current, lists: current.lists.map((list) => list.id === id ? { ...list, ...patch } : list) })),
    addRule: (rule) => setState((current) => ({ ...current, rules: [rule, ...current.rules] })),
    updateRule: (id, patch) => setState((current) => ({ ...current, rules: current.rules.map((rule) => rule.id === id ? { ...rule, ...patch } : rule) })),
  }), [state])

  return <PrototypeDataContext.Provider value={value}>{children}</PrototypeDataContext.Provider>
}

export function usePrototypeData() {
  const context = useContext(PrototypeDataContext)
  if (!context) throw new Error('usePrototypeData must be used within PrototypeDataProvider')
  return context
}
