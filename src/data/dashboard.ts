import type {
  ActivityItem,
  ChartPeriod,
  ChartSeries,
  RegistrySummary,
  SessionUser,
  TaskItem,
} from '../types/ui'

export const currentUser: SessionUser = {
  name: 'Kader Yao',
  initials: 'KY',
  role: 'configurateur',
  roleLabel: 'Configurateur',
  organization: 'ORGATECH · DSI',
}

const summaryMetrics: RegistrySummary['metrics'] = [
  { label: 'à traiter', value: 12, tone: 'primary' },
  { label: 'en validation', value: 8, tone: 'warning' },
  { label: 'urgents', value: 3, tone: 'error' },
]

export const registries: RegistrySummary[] = [
  {
    id: 'internal',
    label: 'Courriers internes',
    path: '/courriers/internes',
    metrics: summaryMetrics,
  },
  {
    id: 'external',
    label: 'Courriers externes',
    path: '/courriers/externes',
    metrics: summaryMetrics,
  },
]

export const tasks: TaskItem[] = [
  {
    id: 'task-1',
    reference: 'EXT-0042/2026',
    title: 'Demande de partenariat technique',
    detail: 'Validation Chef de service — Société KORHOGO BTP',
    relativeTime: 'Aujourd’hui',
    status: 'En validation',
  },
  {
    id: 'task-2',
    reference: 'INT-0187/2026',
    title: 'Note de service — Congés août',
    detail: 'Signature requise — Direction Générale',
    relativeTime: 'Aujourd’hui',
    status: 'À traiter',
  },
  {
    id: 'task-3',
    reference: 'EXT-0039/2026',
    title: 'Réclamation facture n°2288',
    detail: 'Motif du rejet à compléter',
    relativeTime: 'Hier',
    status: 'Rejeté',
  },
  {
    id: 'task-4',
    reference: 'DT/0011/2026',
    title: 'Bon d’intervention — Site B',
    detail: 'Validation DAF — montant > 1 000 000',
    relativeTime: '12 août',
    status: 'En validation',
  },
]

export const activities: ActivityItem[] = [
  {
    id: 'activity-1',
    title: 'A. Kouassi a signé EXT-0040/2026',
    actor: 'Signature terminée',
    relativeTime: 'Il y a 24 min',
    kind: 'success',
  },
  {
    id: 'activity-2',
    title: 'M. Diarra a validé EXT-0041/2026',
    actor: 'Validation Chef de service',
    relativeTime: 'Il y a 1 h',
    kind: 'success',
  },
  {
    id: 'activity-3',
    title: 'S. Bamba a rejeté EXT-0039/2026',
    actor: 'Pièce justificative manquante',
    relativeTime: 'Il y a 3 h',
    kind: 'info',
  },
  {
    id: 'activity-4',
    title: 'K. Yao a soumis EXT-0042/2026',
    actor: 'Soumis au Chef de service',
    relativeTime: 'Ce matin, 09:20',
    kind: 'assignment',
  },
]

export const chartData: Record<ChartPeriod, ChartSeries> = {
  week: {
    labels: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
    internal: [4, 6, 3, 5, 7, 2, 3],
    external: [5, 4, 6, 3, 8, 4, 2],
  },
  month: {
    labels: ['Sem. 1', 'Sem. 2', 'Sem. 3', 'Sem. 4'],
    internal: [28, 35, 22, 31],
    external: [34, 29, 38, 26],
  },
  year: {
    labels: ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'],
    internal: [42, 38, 51, 45, 39, 48, 52, 47, 44, 50, 46, 53],
    external: [39, 44, 41, 48, 52, 46, 50, 45, 49, 53, 47, 55],
  },
}
