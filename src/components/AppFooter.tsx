import { Box, Stack, Typography } from '@mui/material'
import { useSiteSettings } from '../app/SiteSettingsContext'

export const UI_VERSION = '0.3.0'

export function AppFooter({ variant = 'default' }: { variant?: 'default' | 'inverse' }) {
  const { branding } = useSiteSettings()
  const inverse = variant === 'inverse'
  return (
    <Box component="footer" data-testid="app-footer" sx={{ width: '100%', flexShrink: 0, color: inverse ? 'rgba(255,255,255,.72)' : 'text.disabled' }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        spacing={0.75}
        sx={{ maxWidth: 1400, mx: 'auto', px: { xs: 2, sm: 3, lg: 4 }, py: 2.5, borderTop: '1px solid', borderColor: inverse ? 'rgba(255,255,255,.16)' : 'divider' }}
      >
        <Typography variant="caption" color="inherit">© 2026 NUMA — {branding.footerText}</Typography>
        <Typography variant="caption" color="inherit">Prototype UI v{UI_VERSION}</Typography>
      </Stack>
    </Box>
  )
}
