import { parseRuleAction, parseRuleCondition, ruleActionToText, ruleConditionToText, updateRuleData } from './ruleDsl'

describe('rule DSL adapter', () => {
  it('turns a French condition into the executable structured DSL', () => {
    expect(parseRuleCondition('priorité = Urgente')).toEqual({
      operator: 'eq',
      field: 'priority',
      value: 'urgent',
    })
    expect(parseRuleCondition('montant > 1 000 000')).toEqual({
      operator: 'gt',
      field: 'amount',
      value: 1_000_000,
    })
  })

  it('maps readable actions to supported runtime actions', () => {
    expect(parseRuleAction('Exiger une pièce jointe')).toEqual({ type: 'require_attachment' })
    expect(parseRuleAction('Notifier le responsable')).toEqual({
      type: 'notify',
      recipient: 'responsible-service',
      title: 'Notifier le responsable',
    })
  })

  it('renders existing structured rules in a readable form', () => {
    expect(ruleConditionToText({ operator: 'eq', field: 'confidentiality', value: 'confidential' }))
      .toBe('confidentiality = "confidential"')
    expect(ruleActionToText({ type: 'restrict_to_responsible_service' }))
      .toBe('Limiter au service responsable')
  })

  it('rejects free text that cannot be executed', () => {
    expect(() => parseRuleCondition('quand le courrier est urgent')).toThrow(/champ opérateur valeur/)
    expect(() => parseRuleCondition('priorité = Urgente ET montant > 100')).toThrow()
    expect(() => parseRuleAction('Supprimer tous les courriers')).toThrow(/Action inconnue/)
  })

  it('preserves types, literal values and nested field paths when reopening a condition', () => {
    for (const value of ['0012', 'oui', 'Urgente', 'a "quoted" title', true, false, null, 123]) {
      const condition = { operator: 'eq', field: 'custom_fields.reference', value }
      expect(parseRuleCondition(ruleConditionToText(condition))).toEqual(condition)
    }
  })

  it('round-trips compound conditions and actions without losing runtime options', () => {
    const condition = { operator: 'and', operands: [
      { operator: 'exists', field: 'sender' },
      { operator: 'in', field: 'priority', value: ['urgent', 'high'] },
    ] }
    const action = { type: 'add_workflow_step', workflow: 'finance-approval', after: 'review' }
    expect(parseRuleCondition(ruleConditionToText(condition))).toEqual(condition)
    expect(parseRuleAction(ruleActionToText(action))).toEqual(action)
  })

  it('preserves additional actions, events and options when an existing rule is edited', () => {
    const data = {
      scope: 'Courriers externes', events: ['create', 'sign'], priority: 10,
      condition: { operator: 'eq', field: 'priority', value: 'urgent' },
      actions: [
        { type: 'notify', recipient: 'creator', title: 'À vérifier' },
        { type: 'require_field', field: 'summary' },
      ],
    }
    const edit = { scope: data.scope, condition: ruleConditionToText(data.condition), action: ruleActionToText(data.actions[0]) }
    expect(updateRuleData(data, edit)).toEqual(data)
    expect(updateRuleData(data, { ...edit, action: 'Exiger une pièce jointe' })).toEqual({
      ...data, actions: [{ type: 'require_attachment' }, data.actions[1]],
    })
  })
})
