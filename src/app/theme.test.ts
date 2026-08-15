import { numaTheme } from './theme'

describe('NUMA theme', () => {
  it('uses the Markdown brand tokens', () => {
    expect(numaTheme.palette.primary.main).toBe('#123E7C')
    expect(numaTheme.palette.primary.dark).toBe('#0B2447')
    expect(numaTheme.palette.accent.main).toBe('#20C4C7')
    expect(numaTheme.palette.background.default).toBe('#F6F8FC')
  })

  it('keeps internal and external business colors distinct', () => {
    expect(numaTheme.palette.business.internal).toBe('#6D5DD3')
    expect(numaTheme.palette.business.external).toBe('#169B62')
  })

  it('uses the locally bundled NUMA font families', () => {
    expect(numaTheme.fontFamilies.heading).toContain('Sora')
    expect(numaTheme.fontFamilies.body).toContain('Public Sans')
    expect(numaTheme.fontFamilies.mono).toContain('IBM Plex Mono')
    expect(numaTheme.typography.fontFamily).not.toContain('Inter')
  })

  it('allows content links to grow without losing the standard action minimum', () => {
    const buttonRoot = numaTheme.components?.MuiButton?.styleOverrides?.root
    expect(buttonRoot).toMatchObject({ minHeight: 40, height: 'fit-content' })
  })
})
