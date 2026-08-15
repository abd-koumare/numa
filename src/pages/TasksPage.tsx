import { useMemo, useState } from 'react'
import ArrowForward from '@mui/icons-material/ArrowForward'
import AssignmentTurnedInOutlined from '@mui/icons-material/AssignmentTurnedInOutlined'
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline'
import DrawOutlined from '@mui/icons-material/DrawOutlined'
import Schedule from '@mui/icons-material/Schedule'
import Search from '@mui/icons-material/Search'
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Divider,
  InputAdornment,
  MenuItem,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { PriorityBadge } from '../components/PriorityBadge'
import { workflowTasks } from '../data/correspondenceDetail'

type TaskView = 'active' | 'late' | 'completed'

export function TasksPage() {
  const [view, setView] = useState<TaskView>('active')
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState('')
  const [completedIds, setCompletedIds] = useState<string[]>([])
  const [message, setMessage] = useState('')

  const items = useMemo(() => workflowTasks.filter((task) => {
    const status = completedIds.includes(task.id) ? 'Terminée' : task.status
    const viewMatches = view === 'active' ? status === 'À faire' || status === 'En retard' : view === 'late' ? status === 'En retard' : status === 'Terminée'
    const queryMatches = `${task.reference} ${task.subject} ${task.requester}`.toLocaleLowerCase('fr').includes(query.toLocaleLowerCase('fr'))
    return viewMatches && queryMatches && (!kind || task.kind === kind)
  }), [completedIds, kind, query, view])

  const complete = (id: string) => {
    setCompletedIds((current) => [...current, id])
    setMessage('Tâche validée et workflow mis à jour.')
  }

  return (
    <Box sx={{ maxWidth: 1240, mx: 'auto', px: { xs: 2, sm: 3, lg: 4 }, py: { xs: 3, md: 4 } }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'flex-start' }} spacing={2} sx={{ mb: 2.5 }}>
        <Box><Typography component="h1" variant="h1">Mes tâches</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>Validations, signatures et traitements qui nécessitent votre action.</Typography></Box>
        <Stack direction="row" spacing={1}><Chip icon={<Schedule />} label="1 en retard" color="error" variant="outlined" /><Chip icon={<AssignmentTurnedInOutlined />} label="3 actives" color="primary" variant="outlined" /></Stack>
      </Stack>

      <Card sx={{ mb: 2.5 }}>
        <Tabs value={view} onChange={(_, value: TaskView) => setView(value)} aria-label="Vues des tâches" variant="scrollable" scrollButtons="auto" sx={{ px: 1.5 }}><Tab value="active" label="À faire" /><Tab value="late" label="En retard" /><Tab value="completed" label="Terminées" /></Tabs><Divider />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(240px, 2fr) 1fr' }, gap: 1.5 }}><TextField size="small" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Numéro, objet ou demandeur…" slotProps={{ htmlInput: { 'aria-label': 'Rechercher dans les tâches' }, input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> } }} /><TextField select size="small" label="Type d’action" value={kind} onChange={(event) => setKind(event.target.value)}><MenuItem value="">Tous</MenuItem><MenuItem value="Validation">Validation</MenuItem><MenuItem value="Signature">Signature</MenuItem><MenuItem value="Traitement">Traitement</MenuItem></TextField></Box>
      </Card>

      {items.length ? <Stack spacing={1.5}>{items.map((task) => {
        const isSignature = task.kind === 'Signature'
        const detailId = task.reference.replace('EXT-', 'ext-').replace('/', '-').toLocaleLowerCase()
        return <Card component="article" key={task.id} sx={{ p: 2.5, borderLeft: '4px solid', borderLeftColor: task.status === 'En retard' ? 'error.main' : 'primary.main' }}><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.7fr) minmax(180px, .7fr) auto' }, gap: 2, alignItems: 'center' }}><Box><Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap"><Typography sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, fontWeight: 700, color: 'primary.main' }}>{task.reference}</Typography><Chip label={task.kind} size="small" variant="outlined" /><PriorityBadge priority={task.priority} /></Stack><Typography component="h2" variant="h3" sx={{ mt: 1 }}>{task.subject}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Demandée par {task.requester} · {task.requestedAt}</Typography></Box><Box><Typography variant="caption" color="text.secondary">Échéance</Typography><Typography variant="body2" fontWeight={700} color={task.status === 'En retard' ? 'error.main' : 'text.primary'}>{task.dueAt}</Typography></Box><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>{isSignature ? <Button component={RouterLink} to="/courriers/externes/ext-0040-2026/signature" variant="contained" startIcon={<DrawOutlined />}>Signer</Button> : <Button variant="contained" startIcon={<CheckCircleOutline />} onClick={() => complete(task.id)}>Valider</Button>}<Button component={RouterLink} to={`/courriers/externes/${detailId}`} variant="outlined" endIcon={<ArrowForward />}>Consulter</Button></Stack></Box></Card>
      })}</Stack> : <Card sx={{ p: 5, textAlign: 'center' }}><AssignmentTurnedInOutlined sx={{ fontSize: 48, color: 'success.main' }} /><Typography component="h2" variant="h2" sx={{ mt: 1 }}>Aucune tâche dans cette vue</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Vous êtes à jour ou aucun résultat ne correspond aux filtres.</Typography></Card>}
      <Alert severity="info" sx={{ mt: 2.5 }}>Les actions de validation, rejet, délégation et signature sont toutes journalisées avec leur acteur et leur horodatage.</Alert>
      <Snackbar open={Boolean(message)} autoHideDuration={3500} onClose={() => setMessage('')} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}><Alert severity="success" variant="filled">{message}</Alert></Snackbar>
    </Box>
  )
}
