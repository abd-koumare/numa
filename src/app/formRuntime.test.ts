import { evaluateCalculation, evaluateCondition, fieldValue, formValues, type FieldDefinition } from './formRuntime'

describe('published form values', () => {
  it('recomputes totals and excludes hidden answers without changing the entered draft', () => {
    const fields: FieldDefinition[] = [
      { key: 'total', label: 'Total', type: 'computed', expression: { operator: 'multiply', operands: [{ field: 'quantity' }, { field: 'price' }] } },
      { key: 'reason', label: 'Justification', type: 'text', visible_when: { operator: 'eq', field: 'priority', value: 'urgent' } },
    ]
    const draft = { quantity: 4, price: 25, total: 999, priority: 'normal', reason: 'Ancienne réponse' }
    expect(formValues(fields, draft)).toEqual({ quantity: 4, price: 25, total: 100, priority: 'normal' })
    expect(draft.reason).toBe('Ancienne réponse')
    expect(formValues(fields, { ...draft, priority: 'urgent' }).reason).toBe('Ancienne réponse')
  })

  it('supports compound conditions and nested references', () => {
    const condition = { operator: 'and', operands: [
      { operator: 'in', field: 'priority', value: ['high', 'urgent'] },
      { operator: 'gte', field: 'purchase.amount', value: 100 },
      { operator: 'not', operand: { operator: 'exists', field: 'approval' } },
    ] }
    expect(evaluateCondition(condition, { priority: 'urgent', purchase: { amount: 150 } })).toBe(true)
    expect(evaluateCondition(condition, { priority: 'urgent', purchase: { amount: 150 }, approval: 'done' })).toBe(false)
    expect(fieldValue({}, 'constructor')).toBeUndefined()
  })

  it('leaves unavailable or invalid calculations empty instead of displaying infinity', () => {
    const divide = { operator: 'divide', operands: [{ field: 'amount' }, { field: 'quantity' }] }
    expect(evaluateCalculation(divide, { amount: 100, quantity: 0 })).toBeNull()
    expect(evaluateCalculation(divide, { amount: 100 })).toBeNull()
    expect(evaluateCalculation({ operator: 'coalesce', operands: [{ field: 'amount' }, 0] }, {})).toBe(0)
  })
})
