import { useEffect, useState } from 'react'
import { Alert, Box, Button, Card, CircularProgress, Link, Stack, Typography } from '@mui/material'
import { Link as RouterLink, useParams } from 'react-router-dom'
import { apiFetch, API_DATA_ENABLED } from '../api/client'
import { getPublishedPage, type PublishedPage as PageDocument } from '../api/configurations'

export function internalPagePath(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !/[\\\u0000-\u0020]/.test(value)
}

const endpoints: Record<string, string> = {
  'dashboard.metrics': '/dashboard/', 'dashboard.series': '/dashboard/',
  'tasks.mine': '/tasks/?page_size=10', 'correspondences.recent': '/correspondences/?page_size=10&ordering=-created_at',
  'activity.recent': '/activity/',
}
const metricLabels: Record<string, string> = { total: 'Courriers accessibles', to_process: 'À traiter', in_validation: 'En validation', validated: 'Validés', overdue: 'En retard' }

type Source = { loading?: boolean; error?: string; data?: Record<string, unknown> }
export function PageContent({ blocks }: { blocks: Record<string, unknown>[] }) {
  const sourceKey = JSON.stringify([...new Set(blocks.map((block) => String(block.source ?? '')).filter((source) => endpoints[source]))].sort())
  const [sources, setSources] = useState<Record<string, Source>>({})
  useEffect(() => {
    const controller = new AbortController()
    const requested = JSON.parse(sourceKey) as string[]
    setSources(Object.fromEntries(requested.map((source) => [source, { loading: true }])))
    const requests = new Map<string, Promise<Record<string, unknown>>>()
    for (const source of requested) {
      const endpoint = endpoints[source]
      if (!requests.has(endpoint)) requests.set(endpoint, API_DATA_ENABLED ? apiFetch(endpoint, { signal: controller.signal }) : Promise.reject(new Error('Données disponibles en mode connecté.')))
      requests.get(endpoint)!.then((data) => {
        if (!controller.signal.aborted) setSources((current) => ({ ...current, [source]: { data } }))
      }).catch((reason) => {
        if (!controller.signal.aborted) setSources((current) => ({ ...current, [source]: { error: reason instanceof Error ? reason.message : 'Données indisponibles.' } }))
      })
    }
    return () => controller.abort()
  }, [sourceKey])

  return <Stack spacing={2}>{blocks.map((block, index) => {
    const type = String(block.type)
    const label = String(block.text ?? block.label ?? '')
    if (type === 'heading') return <Typography key={index} component="h2" variant="h2">{label}</Typography>
    if (type === 'text') return <Typography key={index} sx={{ whiteSpace: 'pre-wrap' }}>{label}</Typography>
    if (type === 'callout') return <Alert key={index} severity="info">{label}</Alert>
    if (type === 'button') return internalPagePath(block.path) ? <Box key={index}><Button variant="contained" component={RouterLink} to={block.path}>{label || 'Ouvrir'}</Button></Box> : <Alert key={index} severity="warning">Destination du bouton invalide.</Alert>
    if (type === 'link-list') return <Stack key={index} spacing={1}>{(Array.isArray(block.links) ? block.links as Record<string, unknown>[] : []).map((link, i) => internalPagePath(link.path) ? <Link key={i} component={RouterLink} to={link.path}>{String(link.label ?? link.path)}</Link> : null)}</Stack>
    const source = sources[String(block.source)]
    if (!endpoints[String(block.source)]) return <Alert key={index} severity="warning">Source de données non configurée.</Alert>
    if (!source || source.loading) return <Box key={index} role="status" aria-label="Chargement du bloc"><CircularProgress size={22} /></Box>
    if (source.error) return <Alert key={index} severity="warning">{source.error}</Alert>
    const data = source.data ?? {}
    if (type === 'metric') {
      const metrics = (data.metrics ?? {}) as Record<string, number>
      const keys = typeof block.metric === 'string' ? [block.metric] : Object.keys(metrics)
      return <Box key={index} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, 1fr)' }, gap: 1.5 }}>{keys.map((key) => <Card key={key} sx={{ p: 2 }}><Typography variant="body2">{metricLabels[key] ?? key}</Typography><Typography variant="h2">{metrics[key] ?? 0}</Typography></Card>)}</Box>
    }
    if (type === 'chart') {
      const series = (Array.isArray(data.series) ? data.series : []) as { key: string; internal: number; external: number }[]
      const maximum = Math.max(1, ...series.map((point) => point.internal + point.external))
      return <Card key={index} sx={{ p: 2 }}><Typography variant="h3">{label || 'Volume des courriers'}</Typography><Stack spacing={1} sx={{ mt: 2 }}>{series.map((point) => <Box key={point.key} role="img" aria-label={`${point.key} : ${point.internal} internes, ${point.external} externes`}><Typography variant="caption">{point.key} · {point.internal + point.external}</Typography><Box sx={{ display: 'flex', height: 14 }}><Box sx={{ width: `${100 * point.internal / maximum}%`, bgcolor: 'business.internal' }} /><Box sx={{ width: `${100 * point.external / maximum}%`, bgcolor: 'business.external' }} /></Box></Box>)}</Stack></Card>
    }
    const rows = (Array.isArray(data.results) ? data.results : []) as Record<string, unknown>[]
    return <Card key={index} sx={{ p: 2 }}><Typography variant="h3" sx={{ mb: 1.5 }}>{label || ({ 'list-view': 'Courriers récents', 'task-list': 'Mes tâches', 'recent-activity': 'Activité récente' }[type] ?? type)}</Typography>{rows.length ? <Stack component="ul" spacing={1} sx={{ m: 0, pl: 2 }}>{rows.map((row, i) => {
      const id = row.correspondence_id ?? (block.source === 'correspondences.recent' ? row.id : null)
      const path = id ? `/courriers/${row.registry === 'internal' ? 'internes' : 'externes'}/${encodeURIComponent(String(id))}` : '/activite'
      return <Box component="li" key={String(row.id ?? i)}><Link component={RouterLink} to={path}>{String(row.label ?? row.subject ?? row.event ?? '')}</Link><Typography variant="caption" display="block">{String(row.reference ?? '')} {String(row.status_label ?? '')}</Typography></Box>
    })}</Stack> : <Typography color="text.secondary">Aucun élément à afficher.</Typography>}</Card>
  })}</Stack>
}

export function PublishedPage({ slug: givenSlug }: { slug?: string }) {
  const { slug: routeSlug = '' } = useParams()
  const slug = givenSlug ?? routeSlug
  const [page, setPage] = useState<PageDocument | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setPage(null); setError('')
    if (!API_DATA_ENABLED) { setError('Les pages publiées sont disponibles en mode connecté.'); return }
    getPublishedPage(slug, controller.signal).then(setPage).catch((reason) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Page indisponible.')
    })
    return () => controller.abort()
  }, [slug])
  return <Box sx={{ maxWidth: 1280, mx: 'auto', p: { xs: 2, md: 3 } }}>{error ? <Alert severity="error">{error}</Alert> : page ? <><Typography component="h1" variant="h1" sx={{ mb: 3 }}>{page.name}</Typography><PageContent blocks={page.data.blocks} /></> : <CircularProgress aria-label="Chargement de la page" />}</Box>
}
