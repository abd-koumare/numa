import { useMemo, useState } from 'react'
import BackupOutlined from '@mui/icons-material/BackupOutlined'
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline'
import CodeOutlined from '@mui/icons-material/CodeOutlined'
import DownloadOutlined from '@mui/icons-material/DownloadOutlined'
import Search from '@mui/icons-material/Search'
import {
  Alert, Box, Button, Card, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, InputAdornment, LinearProgress, MenuItem, Snackbar, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material'
import { apiFetch, apiFetchBlob } from '../api/client'
import {
  createBackup, createWebhook, type AuditEvent, type BackupJob, useAuditEvents, useBackups,
  useOperationsStatus, useWebhooks, verifyBackup,
} from '../api/operations'

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value))
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url)
}

export function CompleteAuditPage() {
  const { data, loading, error } = useAuditEvents()
  const [query, setQuery] = useState('')
  const [action, setAction] = useState('')
  const [selected, setSelected] = useState<AuditEvent | null>(null)
  const [integrity, setIntegrity] = useState<{ valid: boolean; checked: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const events = useMemo(() => data.results.filter((event) => `${event.actor_name} ${event.resource_id} ${event.action}`.toLowerCase().includes(query.toLowerCase()) && (!action || event.action === action)), [action, data.results, query])
  const verify = async () => { setBusy(true); try { setIntegrity(await apiFetch('/audit-events/verify/')) } finally { setBusy(false) } }
  const exportAudit = async () => {
    const content = ['Date;Acteur;Action;Type;Ressource;Request ID', ...events.map((event) => [event.created_at, event.actor_name, event.action, event.resource_type, event.resource_id, event.request_id].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(';'))].join('\n')
    download(new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' }), 'numa-audit-page.csv')
  }
  return <Box sx={{ maxWidth: 1300, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 2.5 }}><Box><Typography component="h1" variant="h1">Journal d’audit</Typography><Typography variant="body2" color="text.secondary">Chaîne immuable, acteur, requête et état avant/après.</Typography></Box><Stack direction="row" spacing={1}><Button variant="outlined" startIcon={<CheckCircleOutline />} disabled={busy} onClick={() => void verify()}>Vérifier la chaîne</Button><Button variant="outlined" startIcon={<DownloadOutlined />} onClick={() => void exportAudit()}>Exporter la page</Button></Stack></Stack>
    {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}{integrity ? <Alert severity={integrity.valid ? 'success' : 'error'} sx={{ mb: 2 }}>{integrity.valid ? `Chaîne intègre · ${integrity.checked} événements contrôlés.` : 'La chaîne d’audit présente une rupture.'}</Alert> : null}
    <Card sx={{ mb: 2 }}><Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' }, gap: 1.5 }}><TextField size="small" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Acteur, action ou ressource…" slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search /></InputAdornment> } }} /><TextField select size="small" label="Action" value={action} onChange={(event) => setAction(event.target.value)}><MenuItem value="">Toutes</MenuItem>{[...new Set(data.results.map((event) => event.action))].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField></Box></Card>
    {loading ? <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress /></Box> : <Card><Stack divider={<Divider flexItem />}>{events.map((event) => <Button key={event.id} color="inherit" onClick={() => setSelected(event)} sx={{ p: 2, textAlign: 'left', justifyContent: 'stretch' }}><Box sx={{ width: '100%', display: 'grid', gridTemplateColumns: { xs: '1fr', md: '180px 180px 220px 1fr auto' }, gap: 1.5 }}><Typography variant="caption">{formatDate(event.created_at)}</Typography><Typography variant="body2" fontWeight={700}>{event.actor_name}</Typography><Typography variant="body2" sx={{ fontFamily: 'IBM Plex Mono, monospace' }}>{event.action}</Typography><Typography variant="body2">{event.resource_type} · {event.resource_id}</Typography><Chip label={event.integrity_valid ? 'Chaîné' : 'À vérifier'} color={event.integrity_valid ? 'success' : 'warning'} size="small" /></Box></Button>)}</Stack></Card>}
    <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} fullWidth maxWidth="md"><DialogTitle>Détail immuable</DialogTitle>{selected ? <DialogContent><Stack direction="row" spacing={1} flexWrap="wrap"><Chip label={selected.action} color="primary" /><Chip label={selected.actor_name} /><Chip label={formatDate(selected.created_at)} /></Stack><Typography sx={{ mt: 2 }}><strong>Ressource :</strong> {selected.resource_type} · {selected.resource_id}</Typography><Typography><strong>Requête :</strong> {selected.request_id || 'tâche système'} · IP {selected.ip_address ?? 'interne'}</Typography><Box component="pre" sx={{ p: 2, mt: 2, bgcolor: 'background.default', overflow: 'auto', fontSize: 12 }}>{JSON.stringify(selected.metadata, null, 2)}</Box><Alert severity="info" sx={{ mt: 2 }}>Empreinte : {selected.event_hash}</Alert></DialogContent> : null}<DialogActions><Button onClick={() => setSelected(null)}>Fermer</Button></DialogActions></Dialog>
  </Box>
}

function backupStatus(job: BackupJob) { return job.status === 'complete' ? 'Réussie' : job.status === 'failed' ? 'Échouée' : job.status === 'running' ? 'En cours' : 'En attente' }

export function CompleteBackupsPage() {
  const { data, loading, error, reload } = useBackups()
  const [destination, setDestination] = useState<BackupJob['destination']>('both')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const launch = async () => { setBusy('create'); try { await createBackup(destination); setMessage('Sauvegarde placée dans la file d’exécution.'); reload() } catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Création impossible.') } finally { setBusy('') } }
  const verify = async (job: BackupJob) => { setBusy(job.id); try { const result = await verifyBackup(job.id); setMessage(`Intégrité vérifiée · ${result.sha256.slice(0, 16)}…`) } catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Vérification impossible.') } finally { setBusy('') } }
  const downloadBackup = async (job: BackupJob) => { setBusy(job.id); try { const result = await apiFetchBlob(`/backups/${job.id}/download/`); download(result.blob, result.filename ?? `numa-${job.id}.numa`) } catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Téléchargement impossible.') } finally { setBusy('') } }
  return <Box sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 2.5 }}><Box><Typography component="h1" variant="h1">Sauvegardes et restauration</Typography><Typography variant="body2" color="text.secondary">Base PostgreSQL et versions documentaires, paquet AES‑256‑GCM vérifié.</Typography></Box><Stack direction="row" spacing={1}><TextField select size="small" label="Destination" value={destination} onChange={(event) => setDestination(event.target.value as BackupJob['destination'])}><MenuItem value="both">Local + S3</MenuItem><MenuItem value="local">Local</MenuItem><MenuItem value="s3">S3</MenuItem></TextField><Button variant="contained" startIcon={<BackupOutlined />} disabled={busy === 'create'} onClick={() => void launch()}>Lancer une sauvegarde</Button></Stack></Stack>
    {error || actionError ? <Alert severity="error" sx={{ mb: 2 }}>{actionError || error}</Alert> : null}<Alert severity="info" sx={{ mb: 2 }}>La restauration est volontairement exécutée hors ligne avec le script administrateur : arrêt contrôlé, sauvegarde de sécurité, restauration, migrations et vérifications.</Alert>
    {loading ? <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress /></Box> : <Card><Box sx={{ p: 2.5 }}><Typography component="h2" variant="h2">Historique</Typography></Box><Divider /><Stack divider={<Divider flexItem />}>{data.results.map((job) => <Box key={job.id} sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '190px 100px 120px 1fr auto' }, gap: 1.5, alignItems: 'center' }}><Typography variant="body2" fontWeight={700}>{formatDate(job.created_at)}</Typography><Typography>{job.destination}</Typography><Typography>{job.size ? `${(job.size / 1024 / 1024).toFixed(1)} Mo` : '—'}</Typography><Box><Chip label={backupStatus(job)} size="small" color={job.status === 'complete' ? 'success' : job.status === 'failed' ? 'error' : 'info'} />{job.error ? <Typography variant="caption" color="error" display="block">{job.error}</Typography> : null}</Box><Stack direction="row"><Button size="small" disabled={job.status !== 'complete' || busy === job.id || !job.location.includes('local:')} onClick={() => void verify(job)}>Vérifier</Button><Button size="small" startIcon={<DownloadOutlined />} disabled={job.status !== 'complete' || busy === job.id || !job.location.includes('local:')} onClick={() => void downloadBackup(job)}>Télécharger</Button></Stack></Box>)}</Stack>{!data.results.length ? <Box sx={{ p: 4 }}><Typography color="text.secondary">Aucune sauvegarde lancée.</Typography></Box> : null}</Card>}
    <Snackbar open={Boolean(message)} autoHideDuration={4000} onClose={() => setMessage('')}><Alert severity="success" variant="filled">{message}</Alert></Snackbar>
  </Box>
}

export function CompleteOperationsPage() {
  const { data: status, loading, error, reload } = useOperationsStatus()
  const { data: webhooks, reload: reloadWebhooks } = useWebhooks()
  const [tab, setTab] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [webhook, setWebhook] = useState({ name: '', url: '', events: 'correspondence.submit', secret: '' })
  const [message, setMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const saveWebhook = async () => { try { await createWebhook({ name: webhook.name, url: webhook.url, events: webhook.events.split(',').map((value) => value.trim()).filter(Boolean), secret: webhook.secret, active: true }); setDialogOpen(false); setMessage('Webhook enregistré.'); reloadWebhooks() } catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Enregistrement impossible.') } }
  const services = status ? [['API', 'ok', `NUMA ${status.version}`], ['PostgreSQL', status.database.status, `${(status.database.size / 1024 / 1024).toFixed(1)} Mo`], ['Stockage documents', status.storage.status, `${status.counts.documents} versions`], ['Celery / Redis', status.cache.status, `${status.counts.pending_tasks} tâches métier en attente`]] : []
  return <Box sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}><Stack direction="row" justifyContent="space-between"><Box><Typography component="h1" variant="h1">État de la plateforme</Typography><Typography variant="body2" color="text.secondary">Services, compteurs, intégrations et documentation.</Typography></Box><Button onClick={reload}>Actualiser</Button></Stack>{error || actionError ? <Alert severity="error" sx={{ my: 2 }}>{actionError || error}</Alert> : null}<Card sx={{ my: 2 }}><Tabs value={tab} onChange={(_, value: number) => setTab(value)} variant="scrollable"><Tab label="Services" /><Tab label="Capacité" /><Tab label="Intégrations" /><Tab label="API" /></Tabs></Card>
    {loading ? <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress /></Box> : null}
    {tab === 0 && !loading ? <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>{services.map(([name, state, detail]) => <Card key={name} sx={{ p: 2.5 }}><Stack direction="row" justifyContent="space-between"><Typography component="h2" variant="h3">{name}</Typography><Chip label={state === 'ok' ? 'Opérationnel' : 'Dégradé'} color={state === 'ok' ? 'success' : 'warning'} size="small" /></Stack><Typography variant="body2" color="text.secondary">{detail}</Typography></Card>)}</Box> : null}
    {tab === 1 && status ? <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3,1fr)' }, gap: 2 }}>{Object.entries(status.counts).map(([name, value]) => <Card key={name} sx={{ p: 2.5 }}><Typography variant="overline">{name.replaceAll('_', ' ')}</Typography><Typography variant="h1">{value.toLocaleString('fr-FR')}</Typography><LinearProgress variant="determinate" value={Math.min(100, Math.log10(value + 1) * 20)} sx={{ mt: 1 }} /></Card>)}</Box> : null}
    {tab === 2 ? <Stack spacing={1.5}><Button variant="contained" sx={{ alignSelf: 'flex-start' }} onClick={() => setDialogOpen(true)}>Ajouter un webhook</Button>{webhooks.results.map((item) => <Card key={item.id} sx={{ p: 2 }}><Stack direction="row" justifyContent="space-between"><Box><Typography fontWeight={700}>{item.name}</Typography><Typography variant="body2" color="text.secondary">{item.url}</Typography><Typography variant="caption">{item.events.join(', ')}</Typography></Box><Chip label={item.active ? 'Actif' : 'Inactif'} color={item.active ? 'success' : 'default'} /></Stack></Card>)}</Stack> : null}
    {tab === 3 ? <Card sx={{ p: 3 }}><CodeOutlined color="primary" sx={{ fontSize: 48 }} /><Typography component="h2" variant="h2">API REST NUMA</Typography><Typography color="text.secondary">OpenAPI v3 · Bearer OIDC · `/api/v1`.</Typography><Stack direction="row" spacing={1} sx={{ mt: 2 }}><Button component="a" href="/api/docs/" target="_blank" variant="contained">Documentation interactive</Button><Button component="a" href="/api/schema/" startIcon={<DownloadOutlined />}>Schéma OpenAPI</Button></Stack></Card> : null}
    <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm"><DialogTitle>Ajouter un webhook</DialogTitle><DialogContent><Stack spacing={2} sx={{ mt: 1 }}><TextField required label="Nom" value={webhook.name} onChange={(event) => setWebhook((value) => ({ ...value, name: event.target.value }))} /><TextField required label="URL HTTPS" value={webhook.url} onChange={(event) => setWebhook((value) => ({ ...value, url: event.target.value }))} /><TextField label="Événements séparés par des virgules" value={webhook.events} onChange={(event) => setWebhook((value) => ({ ...value, events: event.target.value }))} /><TextField type="password" label="Secret HMAC" value={webhook.secret} onChange={(event) => setWebhook((value) => ({ ...value, secret: event.target.value }))} /></Stack></DialogContent><DialogActions><Button onClick={() => setDialogOpen(false)}>Annuler</Button><Button variant="contained" disabled={!webhook.name || !webhook.url} onClick={() => void saveWebhook()}>Enregistrer</Button></DialogActions></Dialog>
    <Snackbar open={Boolean(message)} autoHideDuration={3500} onClose={() => setMessage('')}><Alert severity="success" variant="filled">{message}</Alert></Snackbar>
  </Box>
}
