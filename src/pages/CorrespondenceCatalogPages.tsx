import { useEffect, useMemo, useState } from 'react'
import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined'
import ArrowForward from '@mui/icons-material/ArrowForward'
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined'
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { Link as RouterLink, useParams } from 'react-router-dom'
import { externalCorrespondences } from '../data/correspondences'
import { internalCorrespondences } from '../data/internalCorrespondences'
import { StatusChip } from '../components/StatusChip'
import { API_DATA_ENABLED, apiFetch } from '../api/client'
import { mapCorrespondence, type ApiCorrespondence, type Paginated } from '../api/correspondences'
import { transitionListInstance, type ListInstance, useListInstances } from '../api/operations'

export function CorrespondenceOverviewPage() {
  const { data, error } = useListInstances('active')
  const demoRegistries = [{ title: 'Courriers externes', color: '#169B62', path: '/courriers/externes', count: 428, prefix: 'EXT', detail: '12 en validation · 34 signés ce mois' }, { title: 'Courriers internes', color: '#6D5DD3', path: '/courriers/internes', count: 312, prefix: 'INT', detail: '8 en validation · 21 signés ce mois' }]
  const registries = API_DATA_ENABLED ? data.results.filter((item) => item.registry !== 'custom').map((item) => ({ title: item.registry === 'internal' ? 'Courriers internes' : 'Courriers externes', color: item.registry === 'internal' ? '#6D5DD3' : '#169B62', path: item.registry === 'internal' ? '/courriers/internes' : '/courriers/externes', count: item.item_count, prefix: item.registry === 'internal' ? 'INT' : 'EXT', detail: `${item.label} · données de votre périmètre`, period: item.period_key })) : demoRegistries.map((item) => ({ ...item, period: '2026' }))
  return (
    <Box sx={{ maxWidth: 1240, mx: 'auto', px: { xs: 2, sm: 3, lg: 4 }, py: { xs: 3, md: 4 } }}>
      <Typography component="h1" variant="h1">Courriers</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 3 }}>Vue consolidée des instances annuelles et des activités courrier.</Typography>
      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}<Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 2.5 }}>
        {registries.map((registry) => <Card key={registry.title} sx={{ overflow: 'hidden' }}><Box sx={{ height: 5, bgcolor: registry.color }} /><Box sx={{ p: 3 }}><Stack direction="row" justifyContent="space-between" alignItems="flex-start"><Box><Typography component="h2" variant="h2">{registry.title}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Instance {registry.period} · compteur {registry.prefix}</Typography></Box><Chip label="Active" color="success" size="small" variant="outlined" /></Stack><Typography variant="h1" sx={{ mt: 3 }}>{registry.count}</Typography><Typography variant="body2" color="text.secondary">courriers actifs</Typography><Typography variant="body2" sx={{ mt: 2 }}>{registry.detail}</Typography><Button component={RouterLink} to={registry.path} endIcon={<ArrowForward />} sx={{ mt: 2, px: 0 }}>Ouvrir le registre</Button></Box></Card>)}
      </Box>
      <Card sx={{ mt: 2.5, p: 3 }}><Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" spacing={2}><Box><Typography component="h2" variant="h2">Cycle annuel</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Les compteurs Interne et Externe restent indépendants. La prochaine instance sera préparée avant le 1er janvier 2027.</Typography></Box><Button component={RouterLink} to="/archives" variant="outlined" startIcon={<ArchiveOutlined />}>Consulter les archives</Button></Stack></Card>
    </Box>
  )
}

export function ArchivesPage() {
  const { data, error, reload } = useListInstances()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [selected, setSelected] = useState<ListInstance | null>(null)
  const [actionError, setActionError] = useState('')
  const [message, setMessage] = useState('')
  const demoArchives = [{ year: '2025', internal: 1164, external: 1482, closed: '05/01/2026', instances: [] as ListInstance[] }, { year: '2024', internal: 1089, external: 1398, closed: '04/01/2025', instances: [] as ListInstance[] }, { year: '2023', internal: 954, external: 1210, closed: '03/01/2024', instances: [] as ListInstance[] }]
  const archives = useMemo(() => {
    if (!API_DATA_ENABLED) return demoArchives
    const grouped = new Map<string, { year: string; internal: number; external: number; closed: string; instances: ListInstance[] }>()
    data.results.filter((item) => ['closed', 'archived', 'reopened'].includes(item.status) && item.registry !== 'custom').forEach((item) => {
      const group = grouped.get(item.period_key) ?? { year: item.period_key, internal: 0, external: 0, closed: '—', instances: [] }
      if (item.registry === 'internal') group.internal += item.item_count
      if (item.registry === 'external') group.external += item.item_count
      group.instances.push(item)
      if (item.closed_at) group.closed = new Intl.DateTimeFormat('fr-FR').format(new Date(item.closed_at))
      grouped.set(item.period_key, group)
    })
    return [...grouped.values()].sort((a, b) => b.year.localeCompare(a.year))
  }, [data.results])
  const openReopen = (archive: typeof archives[number]) => { const instance = archive.instances.find((item) => item.status === 'closed'); setSelected(instance ?? null); setDialogOpen(true); setReason('') }
  const reopen = async () => {
    if (!API_DATA_ENABLED) { setDialogOpen(false); setMessage('Demande de réouverture enregistrée.'); return }
    if (!selected) return
    setActionError('')
    try { await transitionListInstance(selected, 'reopen', reason); setDialogOpen(false); setMessage(`${selected.label} rouverte de manière auditée.`); reload() }
    catch (failure) { setActionError(failure instanceof Error ? failure.message : 'Réouverture impossible.') }
  }
  return <Box sx={{ maxWidth: 1120, mx: 'auto', px: { xs: 2, sm: 3, lg: 4 }, py: { xs: 3, md: 4 } }}><Typography component="h1" variant="h1">Archives des courriers</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 2.5 }}>Instances annuelles clôturées, conservées en lecture seule.</Typography>{error || actionError ? <Alert severity="error" sx={{ mb: 2 }}>{actionError || error}</Alert> : null}<Alert severity="info" sx={{ mb: 2.5 }}>La réouverture est exceptionnelle, limitée aux utilisateurs habilités et exige une justification auditée.</Alert><Stack spacing={1.5}>{archives.map((archive) => <Card key={archive.year} sx={{ p: 2.5 }}><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'auto 1fr auto' }, gap: 2, alignItems: 'center' }}><Box sx={{ display: 'grid', placeItems: 'center', width: 60, height: 60, borderRadius: 1.5, bgcolor: 'primary.main', color: 'white' }}><CalendarMonthOutlined /><Typography variant="caption" fontWeight={700}>{archive.year}</Typography></Box><Box><Typography component="h2" variant="h3">Instances {archive.year}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{archive.internal} internes · {archive.external} externes · clôturées le {archive.closed}</Typography></Box><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><Button component={RouterLink} to={`/archives/${archive.year}`} variant="outlined">Consulter</Button>{!API_DATA_ENABLED || archive.instances.some((item) => item.status === 'closed') ? <Button color="warning" onClick={() => openReopen(archive)}>Réouvrir</Button> : null}</Stack></Box></Card>)}</Stack>{!archives.length ? <Alert severity="info">Aucune instance clôturée.</Alert> : null}<Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm"><DialogTitle>Réouvrir une instance clôturée</DialogTitle><DialogContent><Alert severity="warning" sx={{ mb: 2 }}>La réouverture autorise temporairement les écritures et sera enregistrée dans l’audit.</Alert><TextField autoFocus fullWidth required multiline minRows={4} label="Justification" value={reason} onChange={(event) => setReason(event.target.value)} /></DialogContent><DialogActions><Button onClick={() => setDialogOpen(false)}>Annuler</Button><Button variant="contained" color="warning" disabled={!reason.trim()} onClick={() => void reopen()}>Confirmer la réouverture</Button></DialogActions></Dialog><Snackbar open={Boolean(message)} autoHideDuration={3500} onClose={() => setMessage('')}><Alert severity="success" variant="filled">{message}</Alert></Snackbar></Box>
}

export function ArchivedInstancePage() {
  const { year = '2025' } = useParams()
  const { data: instances } = useListInstances()
  const fallbackItems = [...externalCorrespondences.slice(0, 5), ...internalCorrespondences.slice(0, 4)]
  const [items, setItems] = useState(fallbackItems)
  const [error, setError] = useState('')
  const instanceIds = useMemo(() => instances.results.filter((item) => item.period_key === year && item.registry !== 'custom').map((item) => item.id), [instances.results, year])
  useEffect(() => {
    if (!API_DATA_ENABLED || !instanceIds.length) return
    let active = true
    Promise.all(instanceIds.map((id) => apiFetch<Paginated<ApiCorrespondence>>(`/correspondences/?list_instance=${id}&page_size=100&ordering=-received_at`)))
      .then((pages) => { if (active) setItems(pages.flatMap((page) => page.results).map(mapCorrespondence)) })
      .catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : 'Chargement des archives impossible.') })
    return () => { active = false }
  }, [instanceIds.join(',')])
  return <Box sx={{ maxWidth: 1150, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}><Button component={RouterLink} to="/archives">Retour aux archives</Button><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'flex-start' }} spacing={2} sx={{ mt: 1, mb: 2.5 }}><Box><Typography component="h1" variant="h1">Archives {year}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Registres Interne et Externe clôturés · consultation en lecture seule.</Typography></Box><Chip label="Lecture seule" color="warning" variant="outlined" /></Stack>{error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}<Alert severity="info" sx={{ mb: 2 }}>Les références affichées restent rattachées à leur instance {year}. Aucune création ou modification n’est autorisée tant que l’instance est clôturée.</Alert><Card><Stack divider={<Divider flexItem />}>{items.map((item) => <Box key={item.id} sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '150px 1fr auto' }, gap: 2, alignItems: 'center' }}><Typography sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}>{API_DATA_ENABLED ? item.reference : item.reference.replace('2026', year)}</Typography><Box><Typography variant="body2" fontWeight={700}>{item.subject}</Typography><Typography variant="caption" color="text.secondary">{item.sender} · {item.direction}</Typography></Box><StatusChip status={item.status} /></Box>)}</Stack>{!items.length ? <Box sx={{ p: 3 }}><Typography color="text.secondary">Aucun courrier dans ces instances.</Typography></Box> : null}</Card></Box>
}
