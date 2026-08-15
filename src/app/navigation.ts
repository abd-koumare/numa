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
    permissions: ['site.manage'],
    children: [
      { label: 'Vue d’ensemble', path: '/administration', icon: 'settings' },
      { label: 'Identité visuelle', path: '/administration/site', icon: 'settings' },
      { label: 'Listes', path: '/administration/listes', icon: 'mail' },
      { label: 'Pages', path: '/administration/pages', icon: 'page' },
      { label: 'Templates', path: '/administration/templates', icon: 'template' },
      { label: 'Workflows', path: '/administration/workflows', icon: 'workflow' },
      { label: 'Audit', path: '/administration/audit', icon: 'audit' },
      { label: 'Sauvegardes', path: '/administration/sauvegardes', icon: 'backup' },
      { label: 'Exploitation', path: '/administration/exploitation', icon: 'settings' },
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
  { path: '/recherche', breadcrumbs: ['Recherche'], context: 'Recherche globale' },
  { path: '/profil', breadcrumbs: ['Profil'], context: 'Préférences personnelles' },
  { path: '/administration/site', breadcrumbs: ['Administration', 'Identité visuelle'], context: 'Personnalisation du site' },
  { path: '/administration/listes', breadcrumbs: ['Administration', 'Listes'], context: 'Mode configuration' },
  { path: '/administration/pages', breadcrumbs: ['Administration', 'Pages'], context: 'Page Builder' },
  { path: '/administration/templates', breadcrumbs: ['Administration', 'Templates'], context: 'Catalogue' },
  { path: '/administration/workflows', breadcrumbs: ['Administration', 'Workflows'], context: 'Mode configuration' },
  { path: '/administration/audit', breadcrumbs: ['Administration', 'Audit'], context: 'Journal complet' },
  { path: '/administration/sauvegardes', breadcrumbs: ['Administration', 'Sauvegardes'], context: 'Super administrateur' },
  { path: '/administration/exploitation', breadcrumbs: ['Administration', 'Exploitation'], context: 'État des services' },
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
