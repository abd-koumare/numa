import { useMemo, useState } from 'react'
import ArrowForward from '@mui/icons-material/ArrowForward'
import AssignmentTurnedInOutlined from '@mui/icons-material/AssignmentTurnedInOutlined'
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline'
import DrawOutlined from '@mui/icons-material/DrawOutlined'
import PersonAddAltOutlined from '@mui/icons-material/PersonAddAltOutlined'
import Search from '@mui/icons-material/Search'
import {
  Alert, Box, Button, Card, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, InputAdornment, MenuItem, Snackbar, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { API_DATA_ENABLED } from '../api/client'
import { actOnTask, assignTask, type ApiTask, useTasks } from '../api/operations'
import { usePrototypeData } from '../app/PrototypeDataContext'
import { workflowTasks } from '../data/correspondenceDetail'
import type { Priority } from '../types/ui'
import { PriorityBadge } from '../components/PriorityBadge'

type TaskView = 'active' | 'late' | 'completed'
type DisplayTask = {
  id: string; reference: string; subject: string; requester: string; requestedAt: string; dueAt: string
  kind: 'Validation' | 'Signature' | 'Traitement'; priority: Priority; status: 'À faire' | 'En retard' | 'Terminée'
  registry: 'internal' | 'external'; correspondenceId: string; api?: ApiTask
}

const priorityLabels: Record<ApiTask['priority'], Priority> = { low: 'Basse', normal: 'Normale', high: 'Haute', urgent: 'Urgente' }

function formatDate(value: string | null) {
  if (!value) return 'Sans échéance'
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function apiDisplayTask(task: ApiTask): DisplayTask {
  const late = Boolean(task.due_at && new Date(task.due_at) < new Date() && !['completed', 'rejected', 'cancelled'].includes(task.status))
  return {
    id: task.id, reference: task.reference ?? 'Brouillon', subject: task.subject, requester: task.requester,
    requestedAt: formatDate(task.created_at), dueAt: formatDate(task.due_at),
    kind: task.kind === 'signature' ? 'Signature' : task.kind === 'validation' ? 'Validation' : 'Traitement',
    priority: priorityLabels[task.priority], status: task.status === 'completed' ? 'Terminée' : late ? 'En retard' : 'À faire',
    registry: task.registry, correspondenceId: task.correspondence_id, api: task,
  }
}

export function TasksPage() {
  const { data, loading, error, reload } = useTasks()
  const { users } = usePrototypeData()
  const [view, setView] = useState<TaskView>('active')
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState('')
  const [message, setMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [processingId, setProcessingId] = useState('')
  const [delegatedTask, setDelegatedTask] = useState<DisplayTask | null>(null)
  const [delegateTo, setDelegateTo] = useState('')
  const [delegationReason, setDelegationReason] = useState('')
  const source: DisplayTask[] = API_DATA_ENABLED
    ? data.results.map(apiDisplayTask)
    : workflowTasks.map((task) => ({ ...task, registry: 'external', correspondenceId: task.reference.replaceAll('/', '-').toLowerCase() }))
  const items = useMemo(() => source.filter((task) => {
    const viewMatches = view === 'active' ? task.status !== 'Terminée' : view === 'late' ? task.status === 'En retard' : task.status === 'Terminée'
    const text = `${task.reference} ${task.subject} ${task.requester}`.toLocaleLowerCase('fr')
    return viewMatches && text.includes(query.toLocaleLowerCase('fr')) && (!kind || task.kind === kind)
  }), [kind, query, source, view])
  const activeCount = source.filter((task) => task.status !== 'Terminée').length
  const lateCount = source.filter((task) => task.status === 'En retard').length

  const complete = async (task: DisplayTask) => {
    if (!task.api) { setMessage('Tâche validée et workflow mis à jour.'); return }
    setProcessingId(task.id); setActionError('')
    try {
      await actOnTask(task.api, 'validate')
      setMessage('Tâche validée et workflow mis à jour.'); reload()
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : 'La tâche n’a pas pu être validée.') }
    finally { setProcessingId('') }
  }

  const delegate = async () => {
    if (!delegatedTask || !delegateTo) return
    setProcessingId(delegatedTask.id); setActionError('')
    try {
      if (delegatedTask.api) await assignTask(delegatedTask.id, delegateTo, delegationReason)
      setMessage('Tâche déléguée et action journalisée.'); setDelegatedTask(null); setDelegationReason(''); reload()
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : 'La délégation a échoué.') }
    finally { setProcessingId('') }
  }

  return <Box sx={{ maxWidth: 1240, mx: 'auto', px: { xs: 2, sm: 3, lg: 4 }, py: { xs: 3, md: 4 } }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 2.5 }}>
      <Box><Typography component="h1" variant="h1">Mes tâches</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>Validations, signatures et traitements nécessitant votre action.</Typography></Box>
      <Stack direction="row" spacing={1}><Chip label={`${lateCount} en retard`} color={lateCount ? 'error' : 'default'} variant="outlined" /><Chip label={`${activeCount} actives`} color="primary" variant="outlined" /></Stack>
    </Stack>
    {error || actionError ? <Alert severity="error" sx={{ mb: 2 }}>{actionError || error}</Alert> : null}
    <Card sx={{ mb: 2.5 }}><Tabs value={view} onChange={(_, value: TaskView) => setView(value)} variant="scrollable"><Tab value="active" label="À faire" /><Tab value="late" label="En retard" /><Tab value="completed" label="Terminées" /></Tabs><Divider />
      <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr' }, gap: 1.5 }}><TextField size="small" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Numéro, objet ou demandeur…" slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search /></InputAdornment> } }} /><TextField select size="small" label="Type" value={kind} onChange={(event) => setKind(event.target.value)}><MenuItem value="">Tous</MenuItem><MenuItem value="Validation">Validation</MenuItem><MenuItem value="Signature">Signature</MenuItem><MenuItem value="Traitement">Traitement</MenuItem></TextField></Box>
    </Card>
    {loading ? <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress /></Box> : items.length ? <Stack spacing={1.5}>{items.map((task) => {
      const basePath = `/courriers/${task.registry === 'internal' ? 'internes' : 'externes'}/${task.correspondenceId}`
      return <Card key={task.id} sx={{ p: 2.5, borderLeft: '4px solid', borderLeftColor: task.status === 'En retard' ? 'error.main' : 'primary.main' }}><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.7fr) minmax(180px, .7fr) auto' }, gap: 2, alignItems: 'center' }}>
        <Box><Stack direction="row" spacing={1} alignItems="center"><Typography sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, fontWeight: 700, color: 'primary.main' }}>{task.reference}</Typography><Chip label={task.kind} size="small" variant="outlined" /><PriorityBadge priority={task.priority} /></Stack><Typography component="h2" variant="h3" sx={{ mt: 1 }}>{task.subject}</Typography><Typography variant="body2" color="text.secondary">Demandée par {task.requester} · {task.requestedAt}</Typography></Box>
        <Box><Typography variant="caption" color="text.secondary">Échéance</Typography><Typography variant="body2" fontWeight={700} color={task.status === 'En retard' ? 'error.main' : 'text.primary'}>{task.dueAt}</Typography></Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>{task.status !== 'Terminée' && task.kind === 'Signature' ? <Button component={RouterLink} to={`${basePath}/signature`} variant="contained" startIcon={<DrawOutlined />}>Signer</Button> : null}{task.status !== 'Terminée' && task.kind !== 'Signature' ? <Button variant="contained" disabled={processingId === task.id} startIcon={processingId === task.id ? <CircularProgress size={18} /> : <CheckCircleOutline />} onClick={() => void complete(task)}>Valider</Button> : null}{task.status !== 'Terminée' ? <Button variant="outlined" startIcon={<PersonAddAltOutlined />} onClick={() => { setDelegatedTask(task); setDelegateTo(users[0]?.id ?? '') }}>Déléguer</Button> : null}<Button component={RouterLink} to={basePath} variant="outlined" endIcon={<ArrowForward />}>Consulter</Button></Stack>
      </Box></Card>
    })}</Stack> : <Card sx={{ p: 5, textAlign: 'center' }}><AssignmentTurnedInOutlined sx={{ fontSize: 48, color: 'success.main' }} /><Typography component="h2" variant="h2">Aucune tâche dans cette vue</Typography></Card>}
    <Snackbar open={Boolean(message)} autoHideDuration={3500} onClose={() => setMessage('')}><Alert severity="success" variant="filled">{message}</Alert></Snackbar>
    <Dialog open={Boolean(delegatedTask)} onClose={() => setDelegatedTask(null)} fullWidth maxWidth="sm"><DialogTitle>Déléguer la tâche</DialogTitle><DialogContent><Alert severity="info" sx={{ mb: 2 }}>La délégation conserve le demandeur initial et sera inscrite dans l’historique.</Alert><Stack spacing={2}><TextField select label="Nouveau responsable" value={delegateTo} onChange={(event) => setDelegateTo(event.target.value)}>{users.filter((user) => user.status === 'Actif').map((user) => <MenuItem key={user.id} value={user.id}>{user.name} · {user.department}</MenuItem>)}</TextField><TextField multiline minRows={3} required label="Motif" value={delegationReason} onChange={(event) => setDelegationReason(event.target.value)} /></Stack></DialogContent><DialogActions><Button onClick={() => setDelegatedTask(null)}>Annuler</Button><Button variant="contained" disabled={!delegateTo || !delegationReason.trim() || Boolean(processingId)} onClick={() => void delegate()}>Confirmer</Button></DialogActions></Dialog>
  </Box>
}
