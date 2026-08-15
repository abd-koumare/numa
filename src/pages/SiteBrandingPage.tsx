import { type ChangeEvent, useState } from 'react'
import CloudUploadOutlined from '@mui/icons-material/CloudUploadOutlined'
import RestartAlt from '@mui/icons-material/RestartAlt'
import SaveOutlined from '@mui/icons-material/SaveOutlined'
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Divider,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { BrandLogo } from '../components/BrandLogo'
import { useSiteSettings } from '../app/SiteSettingsContext'
import type { SiteBrandingSettings } from '../types/ui'

const MAX_LOGO_SIZE = 2 * 1024 * 1024

export function SiteBrandingPage() {
  const { branding, saveBranding, resetLogo } = useSiteSettings()
  const [draft, setDraft] = useState<SiteBrandingSettings>(branding)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const chooseLogo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const extension = file.name.split('.').pop()?.toLocaleLowerCase()
    const inferredMime = extension === 'svg' ? 'image/svg+xml' : extension === 'png' ? 'image/png' : null
    const mimeType = file.type === 'image/png' || file.type === 'image/svg+xml' ? file.type : inferredMime
    if (!mimeType) {
      setError('Format non pris en charge. Choisissez un fichier PNG ou SVG.')
      return
    }
    if (file.size > MAX_LOGO_SIZE) {
      setError('Le logo dépasse la taille maximale autorisée de 2 Mo.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setDraft((current) => ({
        ...current,
        logoDataUrl: String(reader.result),
        logoFileName: file.name,
        logoMimeType: mimeType,
      }))
      setError('')
    }
    reader.onerror = () => setError('Le fichier n’a pas pu être lu. Réessayez avec un autre logo.')
    reader.readAsDataURL(file)
  }

  const save = () => {
    saveBranding({
      ...draft,
      organizationName: draft.organizationName.trim(),
      applicationName: draft.applicationName.trim(),
    })
    setMessage('Identité visuelle enregistrée')
  }

  const restoreNuma = () => {
    resetLogo()
    setDraft((current) => ({ ...current, logoDataUrl: null, logoFileName: null, logoMimeType: null }))
    setError('')
    setMessage('Logo NUMA restauré')
  }

  const logoSource = draft.logoDataUrl ?? '/numa-logo.svg'
  const logoAlt = draft.logoDataUrl ? `Logo ${draft.organizationName || 'entreprise'}` : 'NUMA'

  return (
    <Box sx={{ maxWidth: 1180, mx: 'auto', px: { xs: 2, sm: 3, lg: 4 }, py: { xs: 3, md: 4 } }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'flex-start' }} spacing={2} sx={{ mb: 2.5 }}>
        <Box>
          <Typography component="h1" variant="h1">Identité visuelle</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            Personnalisez la marque affichée aux utilisateurs de votre organisation.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<SaveOutlined />} disabled={!draft.organizationName.trim() || !draft.applicationName.trim()} onClick={save}>
          Enregistrer
        </Button>
      </Stack>

      <Alert severity="info" sx={{ mb: 2.5 }}>
        Le logo personnalisé remplace le logo NUMA dans la navigation et la connexion. PNG ou SVG, 2 Mo maximum. Les SVG devront être assainis par le futur backend avant stockage définitif.
      </Alert>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.1fr) minmax(360px, .9fr)' }, gap: 2.5, alignItems: 'start' }}>
        <Card>
          <Box sx={{ p: 2.5 }}>
            <Typography component="h2" variant="h2">Informations de marque</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Ces libellés accompagnent le logo dans les espaces institutionnels.</Typography>
          </Box>
          <Divider />
          <Stack spacing={2} sx={{ p: 2.5 }}>
            <TextField required label="Nom de l’organisation" value={draft.organizationName} onChange={(event) => setDraft((current) => ({ ...current, organizationName: event.target.value }))} />
            <TextField required label="Nom affiché de l’application" value={draft.applicationName} onChange={(event) => setDraft((current) => ({ ...current, applicationName: event.target.value }))} />
            <Box>
              <Typography variant="body2" fontWeight={700}>Logo de l’entreprise</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }}>
                <Button component="label" variant="outlined" startIcon={<CloudUploadOutlined />}>
                  {draft.logoDataUrl ? 'Remplacer le logo' : 'Importer un logo'}
                  <input aria-label="Choisir un logo PNG ou SVG" hidden type="file" accept=".png,.svg,image/png,image/svg+xml" onChange={chooseLogo} />
                </Button>
                {draft.logoDataUrl ? <Button color="error" onClick={() => setDraft((current) => ({ ...current, logoDataUrl: null, logoFileName: null, logoMimeType: null }))}>Retirer</Button> : null}
                <Button startIcon={<RestartAlt />} onClick={restoreNuma}>Restaurer NUMA</Button>
              </Stack>
              {draft.logoFileName ? <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.5 }}><Chip label={draft.logoMimeType === 'image/svg+xml' ? 'SVG' : 'PNG'} size="small" color="success" variant="outlined" /><Typography variant="caption" color="text.secondary">{draft.logoFileName}</Typography></Stack> : null}
              {error ? <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert> : null}
            </Box>
          </Stack>
        </Card>

        <Stack spacing={2}>
          <Card>
            <Box sx={{ p: 2.5 }}><Typography component="h2" variant="h2">Aperçu</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Navigation principale</Typography></Box>
            <Divider />
            <Box sx={{ p: 2.5, bgcolor: 'background.default' }}>
              <Box sx={{ minHeight: 78, display: 'flex', alignItems: 'center', gap: 2, px: 2.5, py: 1.5, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
                <Box component="img" data-testid="branding-preview-logo" src={logoSource} alt={logoAlt} sx={{ display: 'block', width: 150, height: 52, objectFit: 'contain', objectPosition: 'left center' }} />
                <Divider orientation="vertical" flexItem />
                <Box><Typography fontWeight={700}>{draft.applicationName || 'Application'}</Typography><Typography variant="caption" color="text.secondary">{draft.organizationName || 'Organisation'}</Typography></Box>
              </Box>
            </Box>
          </Card>
          <Card sx={{ p: 2.5 }}>
            <Typography component="h2" variant="h3">Logo actuellement publié</Typography>
            <BrandLogo testId="published-brand-logo" sx={{ width: 150, height: 56, mt: 2 }} />
            <Typography variant="caption" color="text.secondary">Les modifications de l’aperçu deviennent visibles après enregistrement.</Typography>
          </Card>
        </Stack>
      </Box>

      <Snackbar open={Boolean(message)} autoHideDuration={3500} onClose={() => setMessage('')} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity="success" variant="filled" onClose={() => setMessage('')}>{message}</Alert>
      </Snackbar>
    </Box>
  )
}
