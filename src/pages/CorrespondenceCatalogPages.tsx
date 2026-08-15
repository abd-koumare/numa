import { useState } from 'react'
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
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { Link as RouterLink, useParams } from 'react-router-dom'
import { externalCorrespondences } from '../data/correspondences'
import { internalCorrespondences } from '../data/internalCorrespondences'
import { StatusChip } from '../components/StatusChip'

export function CorrespondenceOverviewPage() {
  return (
    <Box sx={{ maxWidth: 1240, mx: 'auto', px: { xs: 2, sm: 3, lg: 4 }, py: { xs: 3, md: 4 } }}>
      <Typography component="h1" variant="h1">Courriers</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 3 }}>Vue consolidée des instances annuelles et des activités courrier.</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 2.5 }}>
        {[{ title: 'Courriers externes', color: '#169B62', path: '/courriers/externes', count: 428, prefix: 'EXT', detail: '12 en validation · 34 signés ce mois' }, { title: 'Courriers internes', color: '#6D5DD3', path: '/courriers/internes', count: 312, prefix: 'INT', detail: '8 en validation · 21 signés ce mois' }].map((registry) => <Card key={registry.title} sx={{ overflow: 'hidden' }}><Box sx={{ height: 5, bgcolor: registry.color }} /><Box sx={{ p: 3 }}><Stack direction="row" justifyContent="space-between" alignItems="flex-start"><Box><Typography component="h2" variant="h2">{registry.title}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Instance 2026 · compteur {registry.prefix}</Typography></Box><Chip label="Active" color="success" size="small" variant="outlined" /></Stack><Typography variant="h1" sx={{ mt: 3 }}>{registry.count}</Typography><Typography variant="body2" color="text.secondary">courriers actifs</Typography><Typography variant="body2" sx={{ mt: 2 }}>{registry.detail}</Typography><Button component={RouterLink} to={registry.path} endIcon={<ArrowForward />} sx={{ mt: 2, px: 0 }}>Ouvrir le registre</Button></Box></Card>)}
      </Box>
      <Card sx={{ mt: 2.5, p: 3 }}><Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" spacing={2}><Box><Typography component="h2" variant="h2">Cycle annuel</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Les compteurs Interne et Externe restent indépendants. La prochaine instance sera préparée avant le 1er janvier 2027.</Typography></Box><Button component={RouterLink} to="/archives" variant="outlined" startIcon={<ArchiveOutlined />}>Consulter les archives</Button></Stack></Card>
    </Box>
  )
}

export function ArchivesPage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [reason, setReason] = useState('')
  const archives = [{ year: 2025, internal: 1164, external: 1482, closed: '05/01/2026' }, { year: 2024, internal: 1089, external: 1398, closed: '04/01/2025' }, { year: 2023, internal: 954, external: 1210, closed: '03/01/2024' }]
  return <Box sx={{ maxWidth: 1120, mx: 'auto', px: { xs: 2, sm: 3, lg: 4 }, py: { xs: 3, md: 4 } }}><Typography component="h1" variant="h1">Archives des courriers</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 2.5 }}>Instances annuelles clôturées, conservées en lecture seule.</Typography><Alert severity="info" sx={{ mb: 2.5 }}>La réouverture est exceptionnelle, limitée aux utilisateurs habilités et exige une justification auditée.</Alert><Stack spacing={1.5}>{archives.map((archive) => <Card key={archive.year} sx={{ p: 2.5 }}><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'auto 1fr auto' }, gap: 2, alignItems: 'center' }}><Box sx={{ display: 'grid', placeItems: 'center', width: 60, height: 60, borderRadius: 1.5, bgcolor: 'primary.main', color: 'white' }}><CalendarMonthOutlined /><Typography variant="caption" fontWeight={700}>{archive.year}</Typography></Box><Box><Typography component="h2" variant="h3">Instances {archive.year}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{archive.internal} internes · {archive.external} externes · clôturées le {archive.closed}</Typography></Box><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><Button component={RouterLink} to={`/archives/${archive.year}`} variant="outlined">Consulter</Button>{archive.year === 2025 ? <Button color="warning" onClick={() => setDialogOpen(true)}>Demander la réouverture</Button> : null}</Stack></Box></Card>)}</Stack><Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm"><DialogTitle>Demander la réouverture de l’instance 2025</DialogTitle><DialogContent><Alert severity="warning" sx={{ mb: 2 }}>La demande sera soumise à un Super administrateur et enregistrée dans l’audit.</Alert><TextField autoFocus fullWidth required multiline minRows={4} label="Justification" value={reason} onChange={(event) => setReason(event.target.value)} /></DialogContent><DialogActions><Button onClick={() => setDialogOpen(false)}>Annuler</Button><Button variant="contained" color="warning" disabled={!reason.trim()} onClick={() => setDialogOpen(false)}>Envoyer la demande</Button></DialogActions></Dialog></Box>
}

export function ArchivedInstancePage() {
  const { year = '2025' } = useParams()
  const items = [...externalCorrespondences.slice(0, 5), ...internalCorrespondences.slice(0, 4)]
  return <Box sx={{ maxWidth: 1150, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}><Button component={RouterLink} to="/archives">Retour aux archives</Button><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'flex-start' }} spacing={2} sx={{ mt: 1, mb: 2.5 }}><Box><Typography component="h1" variant="h1">Archives {year}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Registres Interne et Externe clôturés · consultation en lecture seule.</Typography></Box><Chip label="Lecture seule" color="warning" variant="outlined" /></Stack><Alert severity="info" sx={{ mb: 2 }}>Les références affichées sont replacées dans le contexte de l’instance {year}. Aucune création ou modification n’est autorisée.</Alert><Card><Stack divider={<Divider flexItem />}>{items.map((item) => <Box key={item.id} sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '150px 1fr auto' }, gap: 2, alignItems: 'center' }}><Typography sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}>{item.reference.replace('2026', year)}</Typography><Box><Typography variant="body2" fontWeight={700}>{item.subject}</Typography><Typography variant="caption" color="text.secondary">{item.sender} · {item.direction}</Typography></Box><StatusChip status={item.status} /></Box>)}</Stack></Card></Box>
}
