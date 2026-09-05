/** Convert declared dotted variables to the nested context expected by the API. */
export function templateContext(values: Record<string, string>): Record<string, unknown> {
  const context: Record<string, unknown> = Object.create(null)
  for (const [path, value] of Object.entries(values)) {
    const parts = path.split('.')
    if (parts.some((part) => !part || ['__proto__', 'constructor', 'prototype'].includes(part))) {
      throw new Error(`Variable invalide : ${path}`)
    }
    let current = context
    for (const part of parts.slice(0, -1)) {
      if (Object.hasOwn(current, part) && typeof current[part] !== 'object') {
        throw new Error(`Variables incompatibles : ${path}`)
      }
      current[part] ??= Object.create(null)
      current = current[part] as Record<string, unknown>
    }
    const key = parts[parts.length - 1]
    if (Object.hasOwn(current, key)) throw new Error(`Variables incompatibles : ${path}`)
    current[key] = value
  }
  return context
}
