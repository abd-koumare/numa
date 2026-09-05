import { templateContext } from './templateContext'

describe('document template context', () => {
  it('provides nested variables to the document renderer', () => {
    expect(templateContext({ subject: 'Demande', 'sender.name': 'Marie', 'sender.service': 'Achats' }))
      .toEqual({ subject: 'Demande', sender: { name: 'Marie', service: 'Achats' } })
  })

  it('rejects conflicting scalar and nested declarations in either order', () => {
    expect(() => templateContext({ sender: 'Marie', 'sender.name': 'Marie' })).toThrow(/incompatibles/)
    expect(() => templateContext({ 'sender.name': 'Marie', sender: 'Marie' })).toThrow(/incompatibles/)
  })

  it('rejects prototype paths and empty path components', () => {
    expect(() => templateContext({ 'sender.__proto__.polluted': 'yes' })).toThrow(/invalide/)
    expect(() => templateContext({ 'sender..name': 'Marie' })).toThrow(/invalide/)
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false)
  })
})
