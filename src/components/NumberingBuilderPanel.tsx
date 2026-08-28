import { useEffect, useMemo, useRef, useState } from 'react'
import SaveOutlined from '@mui/icons-material/SaveOutlined'
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import {
  formatCorrespondenceReference,
  useSiteSettings,
  validateNumberingFormat,
} from '../app/SiteSettingsContext'
import type { NumberingSettings } from '../types/ui'
import { API_DATA_ENABLED, apiFetch } from '../api/client'

const variableTokens = ['{SERVICE}', '{SEQUENCE:0000}', '{ANNEE}', '{DIRECTION}', '{TYPE}', '{LISTE}']
const serviceOptions = [
  ['DSI', 'Direction des systèmes d’information'],
  ['RH', 'Ressources humaines'],
  ['FIN', 'Direction financière'],
  ['SG', 'Secrétariat général'],
]

export function NumberingBuilderPanel() {
  const { numbering, updateNumbering } = useSiteSettings()
  const [draft, setDraft] = useState<NumberingSettings>(numbering)
  const [sampleService, setSampleService] = useState('DSI')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const formatInput = useRef<HTMLInputElement>(null)
  const errors = useMemo(() => validateNumberingFormat(draft.format), [draft.format])
  const localPreview = formatCorrespondenceReference(draft, sampleService)
  const [preview, setPreview] = useState(localPreview)
  const [previewSequence, setPreviewSequence] = useState(draft.nextSequence)

  useEffect(() => setDraft(numbering), [numbering])
  useEffect(() => {
    if (!API_DATA_ENABLED) { setPreview(localPreview); setPreviewSequence(draft.nextSequence); return }
    if (errors.length) { setPreview('Format invalide'); return }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      apiFetch<{ reference: string; sequence: number }>('/numbering/preview/', {
        method: 'POST', signal: controller.signal,
        body: JSON.stringify({ registry: 'external', service_code: sampleService, direction_code: 'DT', settings: draft }),
      }).then((result) => { setPreview(result.reference); setPreviewSequence(result.sequence) })
        .catch((reason) => { if (!controller.signal.aborted) setSaveError(reason instanceof Error ? reason.message : 'Aperçu indisponible.') })
    }, 250)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [draft, errors.length, localPreview, sampleService])

  const insertVariable = (token: string) => {
    const input = formatInput.current
    const start = input?.selectionStart ?? draft.format.length
    const end = input?.selectionEnd ?? start
    const format = `${draft.format.slice(0, start)}${token}${draft.format.slice(end)}`
    setDraft((current) => ({ ...current, format }))
    requestAnimationFrame(() => {
      input?.focus()
      input?.setSelectionRange(start + token.length, start + token.length)
    })
  }

  const save = async () => {
    if (errors.length) return
    setSaving(true)
    setSaveError('')
    try {
      await updateNumbering(draft)
      setSaved(true)
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : 'La numérotation n’a pas pu être enregistrée.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box sx={{ p: { xs: 2, md: 2.5 } }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.15fr) minmax(320px, .85fr)' }, gap: 2.5, alignItems: 'start' }}>
        <Stack spacing={2.25}>
          <Box>
            <TextField
              fullWidth
              required
              inputRef={formatInput}
              label="Format du numéro"
              value={draft.format}
              error={Boolean(errors.length)}
              onChange={(event) => { setDraft((current) => ({ ...current, format: event.target.value })); setSaved(false) }}
              helperText="Composez la référence avec les variables autorisées."
            />
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>Insérer une variable</Typography>
            <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ mt: 0.75 }}>
              {variableTokens.map((token) => <Button key={token} size="small" variant="outlined" onClick={() => insertVariable(token)} sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }}>{token}</Button>)}
            </Stack>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <TextField select label="Portée du compteur" value={draft.counterScope} onChange={(event) => setDraft((current) => ({ ...current, counterScope: event.target.value as NumberingSettings['counterScope'] }))}>
              <MenuItem value="global">Globale</MenuItem>
              <MenuItem value="year">Par année</MenuItem>
              <MenuItem value="list">Par liste</MenuItem>
              <MenuItem value="instance">Par instance</MenuItem>
              <MenuItem value="direction-year">Par direction et année</MenuItem>
              <MenuItem value="service-year">Par service et année</MenuItem>
              <MenuItem value="type-year">Par type et année</MenuItem>
            </TextField>
            <TextField select label="Remise à zéro" value={draft.resetPeriod} onChange={(event) => setDraft((current) => ({ ...current, resetPeriod: event.target.value as NumberingSettings['resetPeriod'] }))}>
              <MenuItem value="yearly">Chaque année</MenuItem>
              <MenuItem value="monthly">Chaque mois</MenuItem>
              <MenuItem value="never">Jamais</MenuItem>
            </TextField>
            <TextField select label="Moment d’attribution" value={draft.assignmentTrigger} onChange={(event) => setDraft((current) => ({ ...current, assignmentTrigger: event.target.value as NumberingSettings['assignmentTrigger'] }))}>
              <MenuItem value="creation">À la création</MenuItem>
              <MenuItem value="submission">À la soumission</MenuItem>
              <MenuItem value="validation">À la validation</MenuItem>
              <MenuItem value="signature">À la signature</MenuItem>
              <MenuItem value="registration">À l’enregistrement définitif</MenuItem>
            </TextField>
            <TextField select label="Numéros annulés" value={draft.cancelledNumberPolicy} onChange={(event) => setDraft((current) => ({ ...current, cancelledNumberPolicy: event.target.value as 'keep' }))}>
              <MenuItem value="keep">Conserver les trous et journaliser</MenuItem>
            </TextField>
          </Box>

          <FormControlLabel
            control={<Switch checked={draft.sharedAcrossRegistries} onChange={(event) => setDraft((current) => ({ ...current, sharedAcrossRegistries: event.target.checked }))} />}
            label="Partager la séquence du service entre les courriers internes et externes"
          />

          {errors.length ? <Alert severity="error"><Stack spacing={0.5}>{errors.map((error) => <Typography key={error} variant="body2">{error}</Typography>)}</Stack></Alert> : null}
          {saveError ? <Alert severity="error">{saveError}</Alert> : null}
          {saved ? <Alert severity="success">Configuration enregistrée. Elle sera utilisée pour les prochaines attributions.</Alert> : null}
          <Box><Button variant="contained" startIcon={<SaveOutlined />} disabled={saving || Boolean(errors.length)} onClick={() => void save()}>{saving ? 'Enregistrement…' : 'Enregistrer la numérotation'}</Button></Box>
        </Stack>

        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflow: 'hidden' }}>
          <Box sx={{ p: 2.25 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
              <Box><Typography component="h3" variant="h3">Simulation</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Prochain numéro, sans réserver la séquence.</Typography></Box>
              <Chip label="Aperçu" size="small" color="primary" variant="outlined" />
            </Stack>
          </Box>
          <Divider />
          <Stack spacing={2} sx={{ p: 2.25, bgcolor: 'background.default' }}>
            <TextField select size="small" label="Service responsable" value={sampleService} onChange={(event) => setSampleService(event.target.value)}>
              {serviceOptions.map(([code, label]) => <MenuItem key={code} value={code}>{code} — {label}</MenuItem>)}
            </TextField>
            <Box sx={{ p: 2.25, bgcolor: 'background.paper', border: '1px solid', borderColor: errors.length ? 'error.main' : 'divider', borderRadius: 1.25 }}>
              <Typography variant="caption" color="text.secondary">Référence simulée</Typography>
              <Typography data-testid="numbering-preview" sx={{ mt: 0.5, fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, fontSize: { xs: 19, sm: 23 }, overflowWrap: 'anywhere' }}>{preview}</Typography>
            </Box>
            <Typography variant="caption" color="text.secondary">Prochaine séquence : {previewSequence}. Une attribution réelle sera transactionnelle et ne réutilisera jamais un numéro annulé.</Typography>
          </Stack>
        </Box>
      </Box>
    </Box>
  )
}
