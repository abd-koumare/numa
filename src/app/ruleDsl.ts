type RuleCondition = {
  operator: string
  field?: string
  value?: unknown
  operands?: RuleCondition[]
  operand?: RuleCondition
}

export type RuleAction = Record<string, unknown> & { type: string }

const operatorFromText: Record<string, string> = {
  '=': 'eq',
  '!=': 'neq',
  '>': 'gt',
  '>=': 'gte',
  '<': 'lt',
  '<=': 'lte',
}

const operatorToText: Record<string, string> = {
  eq: '=',
  neq: '!=',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  contains: 'contient',
  in: 'est dans',
  not_in: "n’est pas dans",
  exists: 'existe',
}

function normalized(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('fr')
}

function normalizeField(value: string) {
  const key = normalized(value).replace(/[ -]+/g, '_')
  const aliases: Record<string, string> = {
    montant: 'amount',
    priorite: 'priority',
    confidentialite: 'confidentiality',
    objet: 'subject',
    expediteur: 'sender',
    resume: 'summary',
    service_responsable: 'responsible_service',
  }
  return aliases[key] ?? key
}

function normalizeValue(value: string): unknown {
  const clean = value.trim()
  if (clean.startsWith('"')) return JSON.parse(clean)
  if (clean.startsWith("'") && clean.endsWith("'")) return clean.slice(1, -1)
  if (clean === 'true') return true
  if (clean === 'false') return false
  if (clean === 'null') return null
  const compactNumber = clean.replace(/[\s\u00a0]/g, '').replace(',', '.')
  if (/^-?\d+(?:\.\d+)?$/.test(compactNumber)) return Number(compactNumber)
  const aliases: Record<string, string | boolean> = {
    urgente: 'urgent',
    haute: 'high',
    normale: 'normal',
    basse: 'low',
    confidentiel: 'confidential',
    confidentielle: 'confidential',
    restreint: 'restricted',
    restreinte: 'restricted',
    standard: 'standard',
    oui: true,
    non: false,
    vrai: true,
    faux: false,
  }
  return aliases[normalized(clean)] ?? clean
}

export function parseRuleCondition(value: string): RuleCondition {
  if (value.trim().startsWith('{')) {
    const condition = JSON.parse(value) as RuleCondition
    if (!condition || typeof condition !== 'object' || typeof condition.operator !== 'string') {
      throw new Error('La condition JSON doit contenir un opérateur.')
    }
    return condition
  }
  const match = value.trim().match(/^(.+?)\s*(>=|<=|!=|=|>|<)\s*(.+)$/)
  if (!match) throw new Error('La condition doit suivre le format « champ opérateur valeur », par exemple « priorité = Urgente ».')
  const field = normalizeField(match[1])
  if (!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/.test(field)
    || (!/^["']/.test(match[3]) && /(?:\s(?:ET|OU)\s|[=<>])/.test(match[3]))) {
    throw new Error('Utilisez une condition simple ou le DSL JSON pour une condition composée.')
  }
  return {
    operator: operatorFromText[match[2]],
    field,
    value: normalizeValue(match[3]),
  }
}

export function ruleConditionToText(value: unknown): string {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return ''
  const condition = value as RuleCondition
  if (!condition.field || !operatorFromText[operatorToText[condition.operator]]
    || normalizeField(condition.field) !== condition.field
    || Object.keys(condition).some((key) => !['operator', 'field', 'value'].includes(key))
    || (condition.value !== null && typeof condition.value === 'object')) return JSON.stringify(value, null, 2)
  const operator = operatorToText[condition.operator] ?? condition.operator
  const displayValue = JSON.stringify(condition.value)
  return `${condition.field} ${operator} ${displayValue}`
}

export function parseRuleAction(value: string): RuleAction {
  if (value.trim().startsWith('{')) {
    const action = JSON.parse(value) as RuleAction
    if (!action || typeof action !== 'object' || typeof action.type !== 'string') throw new Error('L’action JSON doit contenir un type.')
    return action
  }
  const action = normalized(value)
  if (/^(exiger|rendre obligatoire) (une |la )?(piece jointe|justificatif)$/.test(action)) return { type: 'require_attachment' }
  if (/^(limiter|restreindre) au service responsable$/.test(action)) return { type: 'restrict_to_responsible_service' }
  if (action.startsWith('exiger le champ ')) return { type: 'require_field', field: normalizeField(value.trim().slice('exiger le champ '.length)) }
  if (/^ajouter (une etape|une validation)/.test(action)) {
    return {
      type: 'add_workflow_step',
      step: { key: 'rule-approval', label: value.trim(), kind: 'approval', actor: 'role:validateur', due_days: 2 },
    }
  }
  if (/^(creer une tache|assigner une tache)/.test(action)) {
    return { type: 'assign_task', label: value.trim(), kind: 'processing', actor: 'responsible-service', due_days: 0 }
  }
  if (action.startsWith('notifier')) return { type: 'notify', recipient: 'responsible-service', title: value.trim() }
  throw new Error('Action inconnue : utilisez une action proposée ou le DSL JSON.')
}

export function ruleActionToText(value: unknown): string {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return ''
  const action = value as RuleAction
  if (Object.keys(action).length === 1 && action.type === 'require_attachment') return 'Exiger une pièce jointe'
  if (Object.keys(action).length === 1 && action.type === 'restrict_to_responsible_service') return 'Limiter au service responsable'
  return JSON.stringify(action, null, 2)
}

export function updateRuleData(data: Record<string, unknown>, edit: { scope: string; condition: string; action: string }) {
  const actions = Array.isArray(data.actions) ? data.actions : data.action ? [data.action] : []
  return {
    ...data,
    scope: edit.scope,
    condition: edit.condition === ruleConditionToText(data.condition) ? data.condition : parseRuleCondition(edit.condition),
    actions: edit.action === ruleActionToText(actions[0]) ? actions : [parseRuleAction(edit.action), ...actions.slice(1)],
  }
}
