import { ConnectedCorrespondenceForm } from './ConnectedCorrespondenceForm'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import ArrowBack from '@mui/icons-material/ArrowBack'
import AttachFileOutlined from '@mui/icons-material/AttachFileOutlined'
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline'
import CloudUploadOutlined from '@mui/icons-material/CloudUploadOutlined'
import SaveOutlined from '@mui/icons-material/SaveOutlined'
import SendOutlined from '@mui/icons-material/SendOutlined'
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Divider,
  FormControlLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Snackbar,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material'
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { formatCorrespondenceReference, useSiteSettings } from '../app/SiteSettingsContext'
import { API_DATA_ENABLED, apiFetch } from '../api/client'
import { getCorrespondence, saveCorrespondenceDraft, submitCorrespondence, uploadCorrespondenceDocument, type ApiCorrespondence, type Paginated } from '../api/correspondences'

const workflowLabels = ['Brouillon', 'Chef de service', 'Direction', 'Signature', 'Enregistrement']
const responsibleServices = [
  ['DSI', 'Direction des systèmes d’information'],
  ['DT', 'Direction technique'],
  ['RH', 'Ressources humaines'],
  ['FIN', 'Direction financière'],
  ['SG', 'Secrétariat général'],
]

export function CorrespondenceFormPage() {
  return API_DATA_ENABLED ? <ConnectedCorrespondenceForm /> : <DemoCorrespondenceFormPage />
}

function DemoCorrespondenceFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const editing = Boolean(id)
  const [searchParams] = useSearchParams()
  const [saved, setSaved] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [apiError, setApiError] = useState('')
  const [saving, setSaving] = useState(false)
  const [submittedId, setSubmittedId] = useState(id ?? 'ext-0042-2026')
  const [submittedReference, setSubmittedReference] = useState('')
  const submitIntent = useRef<'draft' | 'submit'>('submit')
  const [type, setType] = useState(searchParams.get('type') === 'interne' ? 'interne' : 'externe')
  const [serviceCode, setServiceCode] = useState('DSI')
  const [existingItem, setExistingItem] = useState<ApiCorrespondence | null>(null)
  const [organizationUnits, setOrganizationUnits] = useState(responsibleServices.map(([code, name]) => ({ code, name })))
  const [initialLoading, setInitialLoading] = useState(editing && API_DATA_ENABLED)
  const { numbering } = useSiteSettings()
  const simulatedReference = formatCorrespondenceReference(numbering, serviceCode, { type: type.toLocaleUpperCase('fr'), direction: 'DT' })
  const registryPath = type === 'interne' ? '/courriers/internes' : '/courriers/externes'
  const returnPath = editing ? `${registryPath}/${id}` : registryPath

  useEffect(() => {
    if (!API_DATA_ENABLED) return
    const controller = new AbortController()
    apiFetch<Paginated<{ code: string; name: string }>>('/organization-units/?active=true&page_size=100', { signal: controller.signal })
      .then((response) => setOrganizationUnits(response.results))
      .catch(() => undefined)
    if (editing && id) {
      getCorrespondence(id)
        .then((item) => {
          if (controller.signal.aborted) return
          setExistingItem(item)
          setType(item.registry === 'internal' ? 'interne' : 'externe')
          setServiceCode(item.responsible_service_code)
        })
        .catch((reason: unknown) => {
          if (!controller.signal.aborted) setApiError(reason instanceof Error ? reason.message : 'Impossible de charger le courrier.')
        })
        .finally(() => {
          if (!controller.signal.aborted) setInitialLoading(false)
        })
    }
    return () => controller.abort()
  }, [editing, id])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!API_DATA_ENABLED) {
      submitIntent.current === 'draft' ? setSaved(true) : setSubmitted(true)
      return
    }
    setSaving(true)
    setApiError('')
    const values = new FormData(event.currentTarget)
    const priorityCodes: Record<string, string> = { Basse: 'low', Normale: 'normal', Haute: 'high', Urgente: 'urgent' }
    const confidentialityCodes: Record<string, string> = { Standard: 'standard', Restreint: 'restricted', Confidentiel: 'confidential' }
    try {
      const draft = await saveCorrespondenceDraft({
        registry: type === 'interne' ? 'internal' : 'external',
        sender: String(values.get('sender') ?? ''),
        origin_reference: String(values.get('origin_reference') ?? ''),
        received_at: String(values.get('received_at') ?? ''),
        channel: String(values.get('channel') ?? 'email'),
        subject: String(values.get('subject') ?? ''),
        direction_code: String(values.get('direction_code') ?? ''),
        responsible_service_code: serviceCode,
        priority: priorityCodes[String(values.get('priority'))] ?? 'normal',
        confidentiality: confidentialityCodes[String(values.get('confidentiality'))] ?? 'standard',
        due_at: String(values.get('due_at') ?? '') || null,
        summary: String(values.get('summary') ?? ''),
      }, editing ? id : undefined, editing ? (existingItem?.etag || existingItem?.row_version) : undefined)
      setSubmittedId(draft.id)
      let currentEtag: string | number = draft.etag || draft.row_version
      for (const file of files) {
        const upload = await uploadCorrespondenceDocument(draft.id, file, currentEtag)
        currentEtag = upload.etag || upload.row_version
      }
      if (submitIntent.current === 'draft') {
        setSaved(true)
      } else if (editing) {
        setExistingItem({ ...draft, etag: String(currentEtag), row_version: Number(String(currentEtag).replaceAll('"', '')) })
        setSubmitted(true)
      } else {
        const result = await submitCorrespondence(draft.id)
        setSubmittedReference(result.reference ?? '')
        setSubmitted(true)
      }
    } catch (reason) {
      setApiError(reason instanceof Error ? reason.message : 'Impossible d’enregistrer le courrier.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box key={existingItem?.updated_at ?? (editing ? 'loading' : 'new')} component="form" onSubmit={handleSubmit} sx={{ maxWidth: 1240, mx: 'auto', px: { xs: 2, sm: 3, lg: 4 }, py: { xs: 3, md: 4 } }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'flex-start' }} spacing={2.5} sx={{ mb: 3 }}>
        <Box>
          <Button component={RouterLink} to={returnPath} startIcon={<ArrowBack />} sx={{ px: 0, mb: 1 }}>
            Retour au registre
          </Button>
          <Stack direction="row" alignItems="center" spacing={1.25} flexWrap="wrap">
            <Typography component="h1" variant="h1">{editing ? 'Modifier le courrier' : 'Nouveau courrier'}</Typography>
            <Chip label={editing ? 'Version en modification' : 'Brouillon non enregistré'} size="small" variant="outlined" />
          </Stack>
          <Typography color="text.secondary" variant="body2" sx={{ mt: 0.75 }}>
            {editing ? `Référence ${id} · toute modification documentaire créera une nouvelle version.` : 'Les champs marqués d’un astérisque sont obligatoires. Le numéro sera généré à la soumission.'}
          </Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ '& .MuiButton-root': { width: { xs: '100%', sm: 'auto' } } }}>
          <Button component={RouterLink} to={returnPath} variant="outlined">Annuler</Button>
          <Button type="submit" disabled={saving} variant="outlined" startIcon={<SaveOutlined />} onClick={() => { submitIntent.current = 'draft' }}>Enregistrer le brouillon</Button>
          <Button type="submit" disabled={saving} variant="contained" startIcon={<SendOutlined />} onClick={() => { submitIntent.current = 'submit' }}>{saving ? 'Enregistrement…' : editing ? 'Enregistrer les modifications' : 'Soumettre'}</Button>
        </Stack>
      </Stack>

      <Alert severity="info" sx={{ mb: 2.5 }}>
        Le workflow proposé dépend du type de courrier, de la direction et du niveau de confidentialité. Il reste visible avant soumission.
      </Alert>
      {initialLoading ? <Alert severity="info" sx={{ mb: 2.5 }}>Chargement du courrier…</Alert> : null}
      {apiError ? <Alert severity="error" sx={{ mb: 2.5 }} onClose={() => setApiError('')}>{apiError}</Alert> : null}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 2fr) 340px' }, gap: 2.5, alignItems: 'start' }}>
        <Stack spacing={2.5}>
          <Card>
            <Box sx={{ p: 2.5 }}>
              <Typography component="h2" variant="h2">Identification</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Nature, provenance et classement du courrier.</Typography>
            </Box>
            <Divider />
            <Box sx={{ p: 2.5 }}>
              <Typography component="label" variant="body2" fontWeight={700}>Type de courrier *</Typography>
              <RadioGroup row name="registry" value={type} onChange={(event) => setType(event.target.value)} sx={{ mb: 2 }}>
                <FormControlLabel value="externe" control={<Radio />} label="Courrier externe" />
                <FormControlLabel value="interne" control={<Radio />} label="Courrier interne" />
              </RadioGroup>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
                <TextField name="sender" required label={type === 'externe' ? 'Expéditeur' : 'Service émetteur'} defaultValue={existingItem?.sender ?? (type === 'externe' ? 'Société KORHOGO BTP' : 'Direction générale')} />
                <TextField name="origin_reference" label="Référence d’origine" placeholder="Ex. KBT/DG/2026-118" defaultValue={existingItem?.origin_reference ?? ''} />
                <TextField name="received_at" required label="Date de réception" type="date" defaultValue={existingItem?.received_at ?? '2026-08-13'} slotProps={{ inputLabel: { shrink: true } }} />
                <TextField name="channel" label="Canal de réception" select defaultValue={existingItem?.channel ?? 'email'}>
                  <MenuItem value="email">Courriel</MenuItem><MenuItem value="paper">Courrier papier</MenuItem><MenuItem value="portal">Portail</MenuItem><MenuItem value="hand">Remise en main propre</MenuItem>
                </TextField>
                <TextField name="subject" required label="Objet" defaultValue={existingItem?.subject ?? 'Demande de partenariat technique'} sx={{ gridColumn: { sm: '1 / -1' } }} />
                <TextField name="direction_code" required label="Direction destinataire" select defaultValue={existingItem?.direction_code ?? 'DT'}>
                  {organizationUnits.map((unit) => <MenuItem key={unit.code} value={unit.code}>{unit.code} — {unit.name}</MenuItem>)}
                </TextField>
                <TextField required label="Service responsable" select value={serviceCode} onChange={(event) => setServiceCode(event.target.value)}>
                  {organizationUnits.map((unit) => <MenuItem key={unit.code} value={unit.code}>{unit.code} — {unit.name}</MenuItem>)}
                </TextField>
                <TextField name="priority" required label="Priorité" select defaultValue={existingItem?.priority_label ?? 'Haute'}>
                  {['Basse', 'Normale', 'Haute', 'Urgente'].map((priority) => <MenuItem key={priority} value={priority}>{priority}</MenuItem>)}
                </TextField>
                <TextField name="confidentiality" label="Confidentialité" select defaultValue={existingItem?.confidentiality_label ?? 'Standard'}>
                  {['Standard', 'Restreint', 'Confidentiel'].map((level) => <MenuItem key={level} value={level}>{level}</MenuItem>)}
                </TextField>
                <TextField name="due_at" label="Échéance de traitement" type="date" defaultValue={existingItem?.due_at ?? '2026-08-20'} slotProps={{ inputLabel: { shrink: true } }} />
                <TextField name="summary" label="Résumé / instructions" multiline minRows={4} defaultValue={existingItem?.summary ?? 'Étudier la proposition et préparer un avis technique avant transmission à la Direction générale.'} sx={{ gridColumn: { sm: '1 / -1' } }} />
              </Box>
            </Box>
          </Card>

          <Card>
            <Box sx={{ p: 2.5 }}>
              <Typography component="h2" variant="h2">Documents</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>PDF, Word ou image · 25 Mo maximum par fichier.</Typography>
            </Box>
            <Divider />
            <Box sx={{ p: 2.5 }}>
              <Button component="label" variant="outlined" startIcon={<CloudUploadOutlined />} sx={{ width: { xs: '100%', sm: 'auto' } }}>
                Ajouter des fichiers
                <input hidden multiple type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={(event) => setFiles((current) => [...current, ...Array.from(event.target.files ?? [])])} />
              </Button>
              <Stack spacing={1} sx={{ mt: 2 }}>
                {files.map((file, index) => (
                  <Stack key={`${file.name}-${index}`} direction="row" alignItems="center" justifyContent="space-between" spacing={1.5} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
                    <Stack direction="row" alignItems="center" spacing={1}><AttachFileOutlined color="action" /><Box><Typography variant="body2" fontWeight={700}>{file.name}</Typography><Typography variant="caption" color="text.secondary">Version 1 · Analyse antivirus à la soumission</Typography></Box></Stack>
                    <Button type="button" color="error" size="small" onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}>Retirer</Button>
                  </Stack>
                ))}
              </Stack>
            </Box>
          </Card>
        </Stack>

        <Stack spacing={2.5} sx={{ position: { lg: 'sticky' }, top: { lg: 112 } }}>
          <Card>
            <Box sx={{ p: 2.5 }}>
              <Typography component="h2" variant="h3">Numérotation</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Référence simulée, attribuée définitivement à la soumission.</Typography>
              <Typography data-testid="creation-numbering-preview" sx={{ mt: 1.5, fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, color: 'primary.main', overflowWrap: 'anywhere' }}>{simulatedReference}</Typography>
              <Chip label={`Compteur ${serviceCode} partagé`} size="small" variant="outlined" sx={{ mt: 1.25 }} />
            </Box>
          </Card>
          <Card>
            <Box sx={{ p: 2.5 }}>
              <Typography component="h2" variant="h3">Workflow proposé</Typography>
              <Stepper activeStep={0} orientation="vertical" sx={{ mt: 2 }}>
                {workflowLabels.map((label, index) => <Step key={label} completed={false}><StepLabel optional={index === 3 ? <Typography variant="caption">Selon habilitation</Typography> : undefined}>{label}</StepLabel></Step>)}
              </Stepper>
            </Box>
          </Card>
          <Card>
            <Box sx={{ p: 2.5 }}>
              <Typography component="h2" variant="h3">Avant la soumission</Typography>
              <Stack spacing={1.25} sx={{ mt: 1.5 }}>
                {['Les champs obligatoires sont renseignés', 'Au moins un document est joint', 'Le destinataire et le workflow sont confirmés'].map((label, index) => (
                  <Stack key={label} direction="row" spacing={1} alignItems="flex-start"><CheckCircleOutline color={index < 2 ? 'success' : 'disabled'} fontSize="small" /><Typography variant="body2">{label}</Typography></Stack>
                ))}
              </Stack>
            </Box>
          </Card>
        </Stack>
      </Box>

      <Snackbar open={saved} autoHideDuration={3500} onClose={() => setSaved(false)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity="success" variant="filled" onClose={() => setSaved(false)}>Brouillon enregistré à 15:42</Alert>
      </Snackbar>
      <Snackbar open={submitted} onClose={() => setSubmitted(false)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity="success" variant="filled" action={<Button color="inherit" onClick={() => navigate(`${registryPath}/${submittedId}`)}>Ouvrir la fiche</Button>}>
          <Box><span>{editing ? 'Modifications enregistrées' : 'Courrier soumis au Chef de service'}</span><Typography variant="caption" display="block" color="inherit">{editing ? 'Une nouvelle trace a été ajoutée à l’historique.' : `Référence attribuée : ${submittedReference || simulatedReference}`}</Typography></Box>
        </Alert>
      </Snackbar>
    </Box>
  )
}
