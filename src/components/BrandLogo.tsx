import { Box, type SxProps, type Theme } from '@mui/material'
import { useSiteSettings } from '../app/SiteSettingsContext'

type BrandLogoProps = {
  sx?: SxProps<Theme>
  testId?: string
}

export function BrandLogo({ sx, testId = 'brand-logo' }: BrandLogoProps) {
  const { branding } = useSiteSettings()
  return (
    <Box
      component="img"
      data-testid={testId}
      src={branding.logoDataUrl ?? '/numa-logo.svg'}
      alt={branding.logoDataUrl ? `Logo ${branding.organizationName}` : 'NUMA'}
      sx={[
        { display: 'block', objectFit: 'contain', objectPosition: 'left center' },
        ...(Array.isArray(sx) ? sx : [sx]),
      ] as SxProps<Theme>}
    />
  )
}
