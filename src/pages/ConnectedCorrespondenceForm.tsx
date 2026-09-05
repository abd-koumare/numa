import { useEffect, useState } from 'react'
import { Alert, Box, Button, Card, Chip, CircularProgress, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { Link as RouterLink, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../api/client'
import { getCorrespondence, saveCorrespondenceDraft, submitCorrespondence, uploadCorrespondenceDocument, type ApiCorrespondence } from '../api/correspondences'
import { DynamicFields } from '../components/DynamicFields'
import { formValues, type FieldDefinition } from '../app/formRuntime'

type RuntimeForm = { form: { fields?: FieldDefinition[] }; form_version: string | null; workflow: { steps?: { key: string; label: string }[] } }
const fixedFields = new Set(['sender', 'origin_reference', 'received_at', 'subject', 'direction', 'responsible_service', 'priority', 'confidentiality', 'summary', 'attachments'])
export function ConnectedCorrespondenceForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [registry, setRegistry] = useState<'internal' | 'external'>(params.get('type') === 'interne' || location.pathname.includes('/internes/') ? 'internal' : 'external')
  const [item, setItem] = useState<ApiCorrespondence | null>(null)
  const [runtime, setRuntime] = useState<RuntimeForm | null>(null)
  const [values, setValues] = useState<Record<string, unknown>>({ received_at: new Date().toISOString().slice(0, 10), priority: 'normal', confidentiality: 'standard', channel: 'email' })
  const [files, setFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const base = `/courriers/${registry === 'internal' ? 'internes' : 'externes'}`
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setRuntime(null); setError('')
    const load = async () => {
      const existing = id ? await getCorrespondence(id) : null
      const actualRegistry = existing?.registry ?? registry
      const form = await apiFetch<RuntimeForm>(`/runtime/forms/courriers-${actualRegistry === 'internal' ? 'internes' : 'externes'}/${existing ? `?item=${existing.id}` : ''}`, { signal: controller.signal })
      if (controller.signal.aborted) return
      setItem(existing); setRuntime(form)
      if (existing) setValues({ ...existing.custom_data, ...existing, direction: existing.direction_code, responsible_service: existing.responsible_service_code })
    }
    load().catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Chargement impossible.') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [id, registry])
  const save = async (submit: boolean) => {
    if (!runtime) return
    setBusy(true); setError(''); setMessage('')
    try {
      const normalized = formValues(runtime.form.fields ?? [], values)
      const draft = await saveCorrespondenceDraft({
        registry, sender: String(normalized.sender ?? ''), origin_reference: String(normalized.origin_reference ?? ''), received_at: String(normalized.received_at ?? ''),
        channel: String(values.channel ?? 'email'), subject: String(normalized.subject ?? ''), direction_code: String(normalized.direction ?? ''), responsible_service_code: String(normalized.responsible_service ?? ''),
        priority: String(normalized.priority ?? 'normal'), confidentiality: String(normalized.confidentiality ?? 'standard'), due_at: String(values.due_at ?? '') || null, summary: String(normalized.summary ?? ''),
        custom_data: Object.fromEntries((runtime.form.fields ?? []).filter((field) => !fixedFields.has(field.key) && Object.hasOwn(normalized, field.key)).map((field) => [field.key, normalized[field.key]])),
      }, item?.id, item?.etag ?? item?.row_version)
      setItem(draft)
      let currentEtag: string | number = draft.etag || draft.row_version
      for (let index = 0; index < files.length; index++) {
        const result = await uploadCorrespondenceDocument(draft.id, files[index], currentEtag)
        currentEtag = result.etag || result.row_version
        setItem((current) => current ? { ...current, etag: String(currentEtag), row_version: result.row_version } : current)
        setFiles((current) => current.slice(1))
      }
      if (submit) {
        const result = await submitCorrespondence(draft.id)
        navigate(`${base}/${result.id}`)
      } else {
        setMessage('Brouillon enregistré.')
        if (!id) navigate(`${base}/${draft.id}/modifier`, { replace: true })
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.') } finally { setBusy(false) }
  }
  return <Box sx={{ maxWidth: 1150, mx: 'auto', p: { xs: 2, md: 3 } }}><Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}><Typography component="h1" variant="h1">{id ? 'Modifier le courrier' : 'Nouveau courrier'}</Typography><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><Button component={RouterLink} to={base}>Annuler</Button><Button disabled={loading || busy || !runtime} variant="outlined" onClick={() => void save(false)}>Enregistrer le brouillon</Button>{!item || item.status === 'draft' || item.status === 'to_process' ? <Button disabled={loading || busy || !runtime} variant="contained" onClick={() => void save(true)}>Soumettre</Button> : null}</Stack></Stack>{error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}{message ? <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert> : null}{loading ? <CircularProgress aria-label="Chargement du formulaire" /> : runtime ? <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 280px' }, gap: 2 }}><Card sx={{ p: 3 }}><Stack spacing={2}>{!item ? <TextField label="Type de courrier" select value={registry} onChange={(event) => setRegistry(event.target.value as 'internal' | 'external')}><MenuItem value="external">Courrier externe</MenuItem><MenuItem value="internal">Courrier interne</MenuItem></TextField> : null}<DynamicFields fields={runtime.form.fields ?? []} values={values} onChange={setValues} onFiles={(added) => setFiles((current) => [...current, ...added])} /><TextField label="Canal de réception" select value={values.channel ?? 'email'} onChange={(event) => setValues({ ...values, channel: event.target.value })}>{[['email', 'Courriel'], ['paper', 'Courrier papier'], ['portal', 'Portail'], ['hand', 'Remise en main propre']].map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}</TextField><TextField type="date" label="Échéance de traitement" value={values.due_at ?? ''} onChange={(event) => setValues({ ...values, due_at: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} />{!(runtime.form.fields ?? []).some((field) => field.type === 'file') ? <Button component="label">Ajouter des documents<input hidden multiple type="file" aria-label="Pièces jointes" onChange={(event) => setFiles((current) => [...current, ...Array.from(event.target.files ?? [])])} /></Button> : null}{files.map((file, index) => <Chip key={index} label={file.name} onDelete={() => setFiles((current) => current.filter((_, i) => i !== index))} />)}{item?.documents.map((document) => <Typography key={document.id} variant="body2">{document.filename} · {document.scan_status_label}</Typography>)}</Stack></Card><Card sx={{ p: 2, alignSelf: 'start' }}><Typography variant="h3">Workflow associé</Typography><Stack spacing={1} sx={{ mt: 2 }}>{runtime.workflow.steps?.map((step) => <Chip key={step.key} label={step.label} variant="outlined" />)}</Stack><Alert severity="info" sx={{ mt: 2 }}>Les calculs, règles et documents sont vérifiés par le serveur. Les documents doivent être déclarés sains avant soumission.</Alert></Card></Box> : null}</Box>
}
