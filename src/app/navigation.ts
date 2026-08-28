import type { NavGroup, RouteContext } from '../types/ui'

export const navigation: NavGroup[] = [
  { label: 'Accueil', path: '/', icon: 'home' },
  {
    label: 'Courriers',
    path: '/courriers',
    icon: 'mail',
    children: [
      { label: 'Vue d’ensemble', path: '/courriers', icon: 'mail' },
      { label: 'Courriers internes', path: '/courriers/internes', icon: 'mail' },
      { label: 'Courriers externes', path: '/courriers/externes', icon: 'mail' },
      { label: 'Archives', path: '/archives', icon: 'archive' },
      { label: 'Mes tâches', path: '/taches', icon: 'tasks' },
    ],
  },
  {
    label: 'Administration',
    path: '/administration',
    icon: 'settings',
    permissions: ['configuration.read'],
    children: [
      { label: 'Vue d’ensemble', path: '/administration', icon: 'settings' },
      { label: 'Identité visuelle', path: '/administration/site', icon: 'settings', permissions: ['system.manage'] },
      { label: 'Navigation', path: '/administration/navigation', icon: 'settings', permissions: ['configuration.manage'] },
      { label: 'Utilisateurs', path: '/administration/utilisateurs', icon: 'settings', permissions: ['identity.read'] },
      { label: 'Fournisseurs d’identité', path: '/administration/fournisseurs-identite', icon: 'settings', permissions: ['identity.manage'] },
      { label: 'Groupes', path: '/administration/groupes', icon: 'settings', permissions: ['identity.read'] },
      { label: 'Rôles et permissions', path: '/administration/roles', icon: 'settings', permissions: ['identity.read'] },
      { label: 'Listes', path: '/administration/listes', icon: 'mail', permissions: ['configuration.read'] },
      { label: 'Règles métier', path: '/administration/regles', icon: 'workflow', permissions: ['configuration.read'] },
      { label: 'Pages', path: '/administration/pages', icon: 'page' },
      { label: 'Templates', path: '/administration/templates', icon: 'template' },
      { label: 'Workflows', path: '/administration/workflows', icon: 'workflow' },
      { label: 'Audit', path: '/administration/audit', icon: 'audit', permissions: ['audit.read'] },
      { label: 'Sauvegardes', path: '/administration/sauvegardes', icon: 'backup', permissions: ['backup.manage'] },
      { label: 'Exploitation', path: '/administration/exploitation', icon: 'settings', permissions: ['system.manage'] },
      { label: 'Cycles et instances', path: '/administration/instances', icon: 'archive' },
      { label: 'Politiques de signature', path: '/administration/signatures', icon: 'settings' },
      { label: 'Paramètres système', path: '/administration/parametres', icon: 'settings' },
      { label: 'États système', path: '/administration/etats-systeme', icon: 'settings' },
    ],
  },
]

export const routeContexts: RouteContext[] = [
  { path: '/', breadcrumbs: ['Accueil'], context: 'Tableau de bord' },
  { path: '/courriers/nouveau', breadcrumbs: ['Courriers', 'Nouveau courrier'], context: 'Création' },
  { path: '/courriers/externes/:id/signature', breadcrumbs: ['Courriers', 'Externes', 'Courrier', 'Signature'], context: 'Signature · version 3' },
  { path: '/courriers/externes/:id', breadcrumbs: ['Courriers', 'Externes', 'Courrier'], context: 'Workflow · étape 4/7' },
  { path: '/courriers/externes/import', breadcrumbs: ['Courriers', 'Externes', 'Import'], context: 'Étape 1/7' },
  { path: '/courriers/internes/:id/signature', breadcrumbs: ['Courriers', 'Internes', 'Courrier', 'Signature'], context: 'Signature · version 3' },
  { path: '/courriers/internes/:id', breadcrumbs: ['Courriers', 'Internes', 'Courrier'], context: 'Workflow · étape 4/7' },
  { path: '/courriers/internes/import', breadcrumbs: ['Courriers', 'Internes', 'Import'], context: 'Étape 1/7' },
  { path: '/courriers/internes', breadcrumbs: ['Courriers', 'Internes'], context: 'Interne 2026 · Active' },
  { path: '/courriers/externes', breadcrumbs: ['Courriers', 'Externes'], context: 'Externe 2026 · Active' },
  { path: '/courriers', breadcrumbs: ['Courriers'], context: 'Registres actifs' },
  { path: '/archives', breadcrumbs: ['Courriers', 'Archives'], context: 'Consultation' },
  { path: '/taches', breadcrumbs: ['Courriers', 'Mes tâches'], context: 'Actions requises' },
  { path: '/activite', breadcrumbs: ['Accueil', 'Activité'], context: 'Journal récent' },
  { path: '/notifications', breadcrumbs: ['Accueil', 'Notifications'], context: 'Centre de notifications' },
  { path: '/recherche', breadcrumbs: ['Recherche'], context: 'Recherche globale' },
  { path: '/profil', breadcrumbs: ['Profil'], context: 'Préférences personnelles' },
  { path: '/administration/site', breadcrumbs: ['Administration', 'Identité visuelle'], context: 'Personnalisation du site' },
  { path: '/administration/navigation', breadcrumbs: ['Administration', 'Navigation'], context: 'Menu configurable' },
  { path: '/administration/utilisateurs/nouveau', breadcrumbs: ['Administration', 'Utilisateurs', 'Ajouter'], context: 'Annuaire d’entreprise' },
  { path: '/administration/utilisateurs/:id', breadcrumbs: ['Administration', 'Utilisateurs', 'Fiche'], context: 'Rôles et périmètres' },
  { path: '/administration/utilisateurs', breadcrumbs: ['Administration', 'Utilisateurs'], context: 'Annuaire et accès' },
  { path: '/administration/fournisseurs-identite', breadcrumbs: ['Administration', 'Fournisseurs d’identité'], context: 'OIDC · SAML · LDAP · AD' },
  { path: '/administration/groupes', breadcrumbs: ['Administration', 'Groupes'], context: 'Groupes et membres' },
  { path: '/administration/permissions', breadcrumbs: ['Administration', 'Rôles', 'Permissions'], context: 'Matrice RBAC' },
  { path: '/administration/roles', breadcrumbs: ['Administration', 'Rôles'], context: 'Profils d’autorisation' },
  { path: '/administration/listes/nouvelle', breadcrumbs: ['Administration', 'Listes', 'Nouvelle'], context: 'Assistant de création' },
  { path: '/administration/listes/:id/formulaire', breadcrumbs: ['Administration', 'Listes', 'Formulaire'], context: 'Field & Form Builder' },
  { path: '/administration/listes/:id', breadcrumbs: ['Administration', 'Listes', 'Configuration'], context: 'List Builder' },
  { path: '/administration/listes', breadcrumbs: ['Administration', 'Listes'], context: 'Mode configuration' },
  { path: '/administration/regles/:id', breadcrumbs: ['Administration', 'Règles', 'Éditeur'], context: 'Rule Builder' },
  { path: '/administration/regles', breadcrumbs: ['Administration', 'Règles'], context: 'Catalogue' },
  { path: '/administration/pages/:id', breadcrumbs: ['Administration', 'Pages', 'Éditeur'], context: 'Page Builder' },
  { path: '/administration/pages', breadcrumbs: ['Administration', 'Pages'], context: 'Page Builder' },
  { path: '/administration/templates', breadcrumbs: ['Administration', 'Templates'], context: 'Catalogue' },
  { path: '/administration/workflows', breadcrumbs: ['Administration', 'Workflows'], context: 'Mode configuration' },
  { path: '/administration/audit', breadcrumbs: ['Administration', 'Audit'], context: 'Journal complet' },
  { path: '/administration/sauvegardes', breadcrumbs: ['Administration', 'Sauvegardes'], context: 'Super administrateur' },
  { path: '/administration/exploitation', breadcrumbs: ['Administration', 'Exploitation'], context: 'État des services' },
  { path: '/administration/instances', breadcrumbs: ['Administration', 'Cycles et instances'], context: 'Bascule annuelle' },
  { path: '/administration/signatures', breadcrumbs: ['Administration', 'Signatures'], context: 'Politiques et habilitations' },
  { path: '/administration/parametres', breadcrumbs: ['Administration', 'Paramètres système'], context: 'Configuration globale' },
  { path: '/administration/etats-systeme', breadcrumbs: ['Administration', 'États système'], context: 'Référence UI' },
  { path: '/administration', breadcrumbs: ['Administration'], context: 'Mode configuration' },
]

export function getRouteContext(pathname: string): RouteContext {
  const matches = (routePath: string) => {
    if (routePath === '/') return pathname === '/'
    if (!routePath.includes(':')) return pathname === routePath || pathname.startsWith(`${routePath}/`)
    const routeSegments = routePath.split('/').filter(Boolean)
    const pathSegments = pathname.split('/').filter(Boolean)
    return pathSegments.length >= routeSegments.length && routeSegments.every((segment, index) => segment.startsWith(':') || segment === pathSegments[index])
  }

  return (
    routeContexts
      .filter((route) => matches(route.path))
      .sort((a, b) => b.path.length - a.path.length)[0] ?? {
      path: pathname,
      breadcrumbs: ['NUMA'],
      context: 'Application',
    }
  )
}
