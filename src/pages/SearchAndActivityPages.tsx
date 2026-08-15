import { useMemo, useState } from 'react'
import AttachFileOutlined from '@mui/icons-material/AttachFileOutlined'
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline'
import HistoryOutlined from '@mui/icons-material/HistoryOutlined'
import Search from '@mui/icons-material/Search'
import {
  Avatar,
  Box,
  Button,
  Card,
  Chip,
  Divider,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import { externalCorrespondences } from '../data/correspondences'
import { internalCorrespondences } from '../data/internalCorrespondences'

export function GlobalSearchPage() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const type = params.get('type') ?? 'all'
  const status = params.get('status') ?? ''
  const from = params.get('from') ?? ''
  const [advanced, setAdvanced] = useState(Boolean(status || from))
  const allItems = useMemo(() => [...externalCorrespondences, ...internalCorrespondences], [])
  const results = useMemo(() => allItems.filter((item) => {
    const matches = `${item.reference} ${item.subject} ${item.sender} ${item.direction}`.toLocaleLowerCase('fr').includes(query.toLocaleLowerCase('fr'))
    const itemType = item.id.startsWith('int-') ? 'internal' : 'external'
    return matches && (type === 'all' || type === itemType || (type === 'documents' && item.attachmentCount > 0)) && (!status || item.status === status) && (!from || item.receivedAt >= from)
  }), [allItems, from, query, status, type])
  const update = (key: string, value: string) => { const next = new URLSearchParams(params); value ? next.set(key, value) : next.delete(key); setParams(next, { replace: true }) }
  return <Box sx={{ maxWidth: 1100, mx: 'auto', px: { xs: 2, sm: 3 }, py: { xs: 3, md: 4 } }}><Typography component="h1" variant="h1">Recherche globale</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2.5 }}>Retrouvez un numéro, un objet, un expéditeur ou le contenu indexé d’un document.</Typography><Card sx={{ p: 2, mb: 2.5 }}><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 2fr) 1fr auto' }, gap: 1.5 }}><TextField autoFocus value={query} onChange={(event) => update('q', event.target.value)} placeholder="Rechercher dans NUMA…" slotProps={{ htmlInput: { 'aria-label': 'Recherche globale détaillée' }, input: { startAdornment: <InputAdornment position="start"><Search /></InputAdornment> } }} /><TextField select label="Périmètre" value={type} onChange={(event) => update('type', event.target.value)}><MenuItem value="all">Tout NUMA</MenuItem><MenuItem value="external">Courriers externes</MenuItem><MenuItem value="internal">Courriers internes</MenuItem><MenuItem value="documents">Documents</MenuItem></TextField><Button onClick={() => setAdvanced((value) => !value)} aria-expanded={advanced}>Filtres avancés</Button></Box>{advanced ? <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, mt: 2 }}><TextField select label="Statut" value={status} onChange={(event) => update('status', event.target.value)}><MenuItem value="">Tous</MenuItem>{['À traiter', 'En validation', 'Validé', 'Brouillon', 'Rejeté', 'Signé'].map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}</TextField><TextField type="date" label="Depuis le" value={from} onChange={(event) => update('from', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} /></Box> : null}</Card><Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{query ? `${results.length} résultat${results.length > 1 ? 's' : ''} pour « ${query} »` : 'Saisissez un terme pour commencer.'}</Typography><Stack spacing={1.25}>{results.map((item) => { const internal = item.id.startsWith('int-'); return <Card component={RouterLink} to={`/courriers/${internal ? 'internes' : 'externes'}/${item.id}`} key={item.id} sx={{ p: 2.25, textDecoration: 'none', color: 'inherit', '&:hover': { borderColor: 'primary.light' } }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}><Box><Stack direction="row" spacing={1} alignItems="center"><Typography sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: 'primary.main', fontWeight: 700 }}>{item.reference}</Typography><Chip label={`Courrier ${internal ? 'interne' : 'externe'}`} size="small" variant="outlined" /></Stack><Typography component="h2" variant="h3" sx={{ mt: 1 }}>{item.subject}</Typography><Typography variant="body2" color="text.secondary">{item.sender} · {item.direction}</Typography></Box><Chip label={item.status} size="small" /></Stack></Card>})}</Stack></Box>
}

const activities = [
  ['15:48', 'Signature apposée', 'Kader Yao', 'EXT-0040/2026 · document v3', 'signature'],
  ['14:05', 'Courrier validé', 'Awa Kouassi', 'EXT-0052/2026 · Direction → Signature', 'validation'],
  ['11:12', 'Pièce jointe ajoutée', 'Mariam Diarra', 'EXT-0048/2026 · rapport-analyse.pdf', 'document'],
  ['09:00', 'Import terminé', 'Système', 'Externe 2026 · 1 218 courriers créés', 'import'],
]

export function ActivityPage() {
  return <Box sx={{ maxWidth: 980, mx: 'auto', px: { xs: 2, sm: 3 }, py: { xs: 3, md: 4 } }}><Typography component="h1" variant="h1">Activité récente</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2.5 }}>Actions visibles dans votre périmètre et selon vos permissions.</Typography><Card><Stack divider={<Divider flexItem />}>{activities.map(([time, title, actor, detail, kind]) => <Stack key={`${time}-${title}`} direction="row" spacing={2} sx={{ p: 2.5 }}><Avatar sx={{ bgcolor: kind === 'signature' ? 'business.externalLight' : kind === 'validation' ? 'success.light' : 'primary.50', color: kind === 'signature' ? 'business.external' : kind === 'validation' ? 'success.dark' : 'primary.main' }}>{kind === 'signature' ? <CheckCircleOutline /> : kind === 'document' ? <AttachFileOutlined /> : <HistoryOutlined />}</Avatar><Box sx={{ flex: 1 }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={0.5}><Typography component="h2" variant="h3">{title}</Typography><Typography variant="caption" color="text.secondary">Aujourd’hui · {time}</Typography></Stack><Typography variant="body2" sx={{ mt: 0.5 }}>{actor}</Typography><Typography variant="body2" color="text.secondary">{detail}</Typography></Box></Stack>)}</Stack></Card></Box>
}
