import { useEffect, useMemo, useState } from 'react'
import AttachFileOutlined from '@mui/icons-material/AttachFileOutlined'
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline'
import HistoryOutlined from '@mui/icons-material/HistoryOutlined'
import Search from '@mui/icons-material/Search'
import { Alert, Avatar, Box, Button, Card, Chip, CircularProgress, Divider, InputAdornment, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import { API_DATA_ENABLED } from '../api/client'
import type { ApiCorrespondence } from '../api/correspondences'
import { searchNuma, useActivity } from '../api/operations'
import { externalCorrespondences } from '../data/correspondences'
import { internalCorrespondences } from '../data/internalCorrespondences'

const statusLabels: Record<string, string> = { draft: 'Brouillon', registered: 'Enregistré', to_process: 'À traiter', in_validation: 'En validation', validated: 'Validé', rejected: 'Rejeté', cancelled: 'Annulé', signed: 'Signé', archived: 'Archivé' }

export function GlobalSearchPage() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const type = params.get('type') ?? 'all'
  const status = params.get('status') ?? ''
  const from = params.get('from') ?? ''
  const [advanced, setAdvanced] = useState(Boolean(status || from))
  const [apiResults, setApiResults] = useState<ApiCorrespondence[]>([])
  const [total, setTotal] = useState(0)
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const demoResults = useMemo(() => [...externalCorrespondences, ...internalCorrespondences].filter((item) => {
    const matches = `${item.reference} ${item.subject} ${item.sender} ${item.direction}`.toLocaleLowerCase('fr').includes(query.toLocaleLowerCase('fr'))
    const itemType = item.id.startsWith('int-') ? 'internal' : 'external'
    return matches && (type === 'all' || type === itemType || (type === 'documents' && item.attachmentCount > 0)) && (!status || item.status === status) && (!from || item.receivedAt >= from)
  }), [from, query, status, type])

  useEffect(() => {
    if (!API_DATA_ENABLED || query.trim().length < 2) { setApiResults([]); setTotal(0); return }
    const timeout = window.setTimeout(() => {
      const search = new URLSearchParams({ q: query.trim(), type })
      if (status) search.set('status', status)
      if (from) search.set('from', from)
      setLoading(true); setError('')
      searchNuma(search).then((response) => { setApiResults(response.results); setTotal(response.count); setTruncated(response.truncated) })
        .catch((reason) => setError(reason instanceof Error ? reason.message : 'La recherche a échoué.'))
        .finally(() => setLoading(false))
    }, 300)
    return () => window.clearTimeout(timeout)
  }, [from, query, status, type])

  const update = (key: string, value: string) => { const next = new URLSearchParams(params); value ? next.set(key, value) : next.delete(key); setParams(next, { replace: true }) }
  const count = API_DATA_ENABLED ? total : demoResults.length
  return <Box sx={{ maxWidth: 1100, mx: 'auto', px: { xs: 2, sm: 3 }, py: { xs: 3, md: 4 } }}>
    <Typography component="h1" variant="h1">Recherche globale</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2.5 }}>Numéro, objet, expéditeur ou contenu OCR indexé d’un document.</Typography>
    <Card sx={{ p: 2, mb: 2.5 }}><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 2fr) 1fr auto' }, gap: 1.5 }}><TextField autoFocus value={query} onChange={(event) => update('q', event.target.value)} placeholder="Rechercher dans NUMA…" slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search /></InputAdornment> } }} /><TextField select label="Périmètre" value={type} onChange={(event) => update('type', event.target.value)}><MenuItem value="all">Tout NUMA</MenuItem><MenuItem value="external">Courriers externes</MenuItem><MenuItem value="internal">Courriers internes</MenuItem><MenuItem value="documents">Documents</MenuItem></TextField><Button onClick={() => setAdvanced((value) => !value)}>Filtres avancés</Button></Box>
      {advanced ? <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, mt: 2 }}><TextField select label="Statut" value={status} onChange={(event) => update('status', event.target.value)}><MenuItem value="">Tous</MenuItem>{Object.entries(statusLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField><TextField type="date" label="Depuis le" value={from} onChange={(event) => update('from', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} /></Box> : null}
    </Card>
    {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}<Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{query.trim().length >= 2 ? `${count} résultat${count > 1 ? 's' : ''} pour « ${query} »${truncated ? ' · 100 premiers affichés' : ''}` : 'Saisissez au moins deux caractères.'}</Typography>
    {loading ? <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress /></Box> : <Stack spacing={1.25}>{API_DATA_ENABLED ? apiResults.map((item) => <Card component={RouterLink} to={`/courriers/${item.registry === 'internal' ? 'internes' : 'externes'}/${item.id}`} key={item.id} sx={{ p: 2.25, textDecoration: 'none', color: 'inherit' }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between"><Box><Stack direction="row" spacing={1}><Typography sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: 'primary.main', fontWeight: 700 }}>{item.reference ?? 'Brouillon'}</Typography><Chip label={`Courrier ${item.registry === 'internal' ? 'interne' : 'externe'}`} size="small" variant="outlined" /></Stack><Typography component="h2" variant="h3" sx={{ mt: 1 }}>{item.subject}</Typography><Typography variant="body2" color="text.secondary">{item.sender} · {item.direction_code}</Typography></Box><Chip label={item.status_label} size="small" /></Stack></Card>) : demoResults.map((item) => { const internal = item.id.startsWith('int-'); return <Card component={RouterLink} to={`/courriers/${internal ? 'internes' : 'externes'}/${item.id}`} key={item.id} sx={{ p: 2.25, textDecoration: 'none', color: 'inherit' }}><Typography component="h2" variant="h3">{item.subject}</Typography><Typography>{item.reference} · {item.sender}</Typography></Card> })}</Stack>}
  </Box>
}

const eventLabels: Record<string, string> = { submit: 'Courrier soumis', validate: 'Courrier validé', reject: 'Courrier rejeté', sign: 'Signature apposée', cancel: 'Courrier annulé', reopen: 'Courrier rouvert', archive: 'Courrier archivé' }

export function ActivityPage() {
  const { data, loading, error } = useActivity()
  return <Box sx={{ maxWidth: 980, mx: 'auto', px: { xs: 2, sm: 3 }, py: { xs: 3, md: 4 } }}><Typography component="h1" variant="h1">Activité récente</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2.5 }}>Actions visibles dans votre périmètre, avec acteur et horodatage serveur.</Typography>{error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}{loading ? <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress /></Box> : <Card><Stack divider={<Divider flexItem />}>{data.results.map((event) => <Stack key={event.id} direction="row" spacing={2} sx={{ p: 2.5 }}><Avatar sx={{ bgcolor: event.event === 'sign' ? 'business.externalLight' : event.event === 'validate' ? 'success.light' : 'primary.50' }}>{event.event === 'sign' || event.event === 'validate' ? <CheckCircleOutline /> : event.event.includes('document') ? <AttachFileOutlined /> : <HistoryOutlined />}</Avatar><Box sx={{ flex: 1 }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between"><Typography component="h2" variant="h3">{eventLabels[event.event] ?? event.event}</Typography><Typography variant="caption" color="text.secondary">{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.created_at))}</Typography></Stack><Typography variant="body2">{event.actor}</Typography><Typography component={RouterLink} to={`/courriers/${event.registry === 'internal' ? 'internes' : 'externes'}/${event.correspondence_id}`} variant="body2" color="primary">{event.reference ?? 'Brouillon'} · {event.subject}</Typography>{event.comment ? <Typography variant="body2" color="text.secondary">{event.comment}</Typography> : null}</Box></Stack>)}</Stack>{!data.results.length ? <Box sx={{ p: 5, textAlign: 'center' }}><Typography>Aucune activité dans votre périmètre.</Typography></Box> : null}</Card>}</Box>
}
