import { alpha, createTheme } from '@mui/material/styles'

declare module '@mui/material/styles' {
  interface Theme {
    fontFamilies: {
      heading: string
      body: string
      mono: string
    }
  }

  interface ThemeOptions {
    fontFamilies?: {
      heading: string
      body: string
      mono: string
    }
  }

  interface Palette {
    accent: Palette['primary']
    business: {
      internal: string
      internalLight: string
      external: string
      externalLight: string
    }
  }

  interface PaletteOptions {
    accent?: PaletteOptions['primary']
    business?: {
      internal: string
      internalLight: string
      external: string
      externalLight: string
    }
  }
}

const primary = '#123E7C'

export const numaTheme = createTheme({
  fontFamilies: {
    heading: 'Sora, system-ui, sans-serif',
    body: '"Public Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    mono: '"IBM Plex Mono", "SFMono-Regular", Consolas, monospace',
  },
  palette: {
    mode: 'light',
    primary: { main: primary, dark: '#0B2447', contrastText: '#FFFFFF' },
    accent: { main: '#20C4C7', dark: '#087E8B', contrastText: '#0B2447' },
    background: { default: '#F6F8FC', paper: '#FFFFFF' },
    text: { primary: '#172033', secondary: '#64748B', disabled: '#94A3B8' },
    divider: '#E2E8F0',
    success: { main: '#16A34A' },
    warning: { main: '#D97706' },
    error: { main: '#DC2626' },
    info: { main: '#2563EB' },
    business: {
      internal: '#6D5DD3',
      internalLight: '#F0EDFF',
      external: '#169B62',
      externalLight: '#EAF8F1',
    },
  },
  typography: {
    fontFamily: '"Public Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h1: { fontFamily: 'Sora, system-ui, sans-serif', fontSize: '1.75rem', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.025em' },
    h2: { fontFamily: 'Sora, system-ui, sans-serif', fontSize: '1.35rem', fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.02em' },
    h3: { fontFamily: 'Sora, system-ui, sans-serif', fontSize: '1rem', fontWeight: 700, lineHeight: 1.35 },
    button: { fontWeight: 600, textTransform: 'none' },
    body1: { lineHeight: 1.6 },
    body2: { lineHeight: 1.5 },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        '*': { boxSizing: 'border-box' },
        html: { minHeight: '100%', backgroundColor: '#F6F8FC' },
        body: { minHeight: '100%', margin: 0, backgroundColor: '#F6F8FC' },
        '#root': { minHeight: '100vh' },
        '::selection': { backgroundColor: alpha('#20C4C7', 0.25) },
        ':focus-visible': { outline: `3px solid ${alpha('#2563EB', 0.42)}`, outlineOffset: 2 },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { minHeight: 40, borderRadius: 8, paddingInline: 16 },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: { border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)' },
      },
    },
    MuiChip: {
      styleOverrides: { root: { fontWeight: 600 } },
    },
  },
})
