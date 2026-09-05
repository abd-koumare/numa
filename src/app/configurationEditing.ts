import type { ConfigurationKind } from '../api/configurations'

export const defaultChoices: Record<string, { value: string; label: string }[]> = {
  priority: [{ value: 'low', label: 'Basse' }, { value: 'normal', label: 'Normale' }, { value: 'high', label: 'Haute' }, { value: 'urgent', label: 'Urgente' }],
  confidentiality: [{ value: 'standard', label: 'Standard' }, { value: 'restricted', label: 'Restreint' }, { value: 'confidential', label: 'Confidentiel' }],
}
export const defaultBindings: Record<string, Record<string, unknown>> = {
  'courriers-externes': { form: 'correspondence-form', workflow: 'correspondence-validation', numbering: 'correspondence-numbering', rules: ['confidential-access', 'urgent-attachment'], signature_policy: 'default-signature-policy' },
  'courriers-internes': { form: 'correspondence-form', workflow: 'correspondence-validation', numbering: 'correspondence-numbering', rules: ['confidential-access', 'urgent-attachment'], signature_policy: 'default-signature-policy' },
}
export function slugify(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100)
}
export function configurationPath(kind: ConfigurationKind, id: string) {
  const segments: Partial<Record<ConfigurationKind, string>> = { page: 'pages', workflow: 'workflows', template: 'templates', form: 'formulaires', list: 'listes', rule: 'regles' }
  return segments[kind] ? `/administration/${segments[kind]}/${id}` : '/administration'
}
export function configurationDefaults(kind: ConfigurationKind): Record<string, unknown> {
  if (kind === 'form') return { fields: [{ key: 'subject', label: 'Objet', type: 'text', required: true }] }
  if (kind === 'workflow') return { steps: [{ key: 'review', label: 'Vérification', kind: 'validation', actor: 'responsible-service', due_days: 2 }] }
  if (kind === 'page') return { blocks: [{ type: 'heading', text: 'Bienvenue' }, { type: 'text', text: 'Votre espace de travail.' }] }
  if (kind === 'list') return { registry: 'custom', periodicity: 'none', columns: ['subject'] }
  if (kind === 'view') return { columns: ['subject'], filters: [], ordering: [] }
  if (kind === 'rule') return { condition: { operator: 'eq', field: 'priority', value: 'urgent' }, events: ['submit'], actions: [{ type: 'require_attachment' }] }
  return {}
}
