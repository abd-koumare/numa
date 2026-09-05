export type FieldDefinition = { key: string; label: string; type: string; required?: boolean; options?: { value: string; label: string }[]; visible_when?: unknown; expression?: unknown; target_list?: string; [key: string]: unknown }
export function fieldValue(values: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => current && typeof current === 'object' && Object.hasOwn(current, key) ? (current as Record<string, unknown>)[key] : undefined, values)
}
export function evaluateCondition(value: unknown, values: Record<string, unknown>): boolean {
  if (!value || typeof value !== 'object') return false
  const node = value as Record<string, unknown>
  if (node.operator === 'and') return Array.isArray(node.operands) && node.operands.every((operand) => evaluateCondition(operand, values))
  if (node.operator === 'or') return Array.isArray(node.operands) && node.operands.some((operand) => evaluateCondition(operand, values))
  if (node.operator === 'not') return !evaluateCondition(node.operand, values)
  const left = fieldValue(values, String(node.field ?? ''))
  const right = node.value
  if (node.operator === 'exists') return left !== undefined && left !== null && left !== ''
  if (node.operator === 'eq') return left === right
  if (node.operator === 'neq') return left !== right
  if (node.operator === 'in') return Array.isArray(right) && right.includes(left)
  if (node.operator === 'not_in') return Array.isArray(right) && !right.includes(left)
  if (node.operator === 'contains') return typeof left === 'string' ? left.includes(String(right)) : Array.isArray(left) && left.includes(right)
  if (left == null || left === '' || right == null || right === '' || !Number.isFinite(Number(left)) || !Number.isFinite(Number(right))) return false
  return ({ gt: Number(left) > Number(right), gte: Number(left) >= Number(right), lt: Number(left) < Number(right), lte: Number(left) <= Number(right) } as Record<string, boolean>)[String(node.operator)] ?? false
}
export function evaluateCalculation(expression: unknown, values: Record<string, unknown>, depth = 0): unknown {
  if (depth > 20) return null
  if (expression == null || typeof expression !== 'object') return expression
  const node = expression as Record<string, unknown>
  if (typeof node.field === 'string') return fieldValue(values, node.field) ?? null
  const operands = Array.isArray(node.operands) ? node.operands.map((item) => evaluateCalculation(item, values, depth + 1)) : []
  if (node.operator === 'coalesce') return operands.find((item) => item != null && item !== '') ?? null
  if (operands.length < 2 || operands.some((item) => item == null || item === '' || !Number.isFinite(Number(item)))) return null
  const numbers = operands.map(Number)
  const result = node.operator === 'add' ? numbers.reduce((a, b) => a + b) : node.operator === 'subtract' ? numbers.slice(1).reduce((a, b) => a - b, numbers[0]) : node.operator === 'multiply' ? numbers.reduce((a, b) => a * b) : node.operator === 'divide' ? numbers.slice(1).reduce((a, b) => a / b, numbers[0]) : NaN
  return Number.isFinite(result) ? result : null
}
export function formValues(fields: FieldDefinition[], values: Record<string, unknown>) {
  const normalized = { ...values }
  for (const field of fields) {
    if (field.type === 'computed') normalized[field.key] = evaluateCalculation(field.expression, normalized)
    if (field.visible_when && !evaluateCondition(field.visible_when, normalized)) delete normalized[field.key]
  }
  return normalized
}
