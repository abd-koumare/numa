import { useState } from 'react'
import Add from '@mui/icons-material/Add'
import ArrowForward from '@mui/icons-material/ArrowForward'
import BarChartOutlined from '@mui/icons-material/BarChartOutlined'
import { Alert, Box, Button, Card, Chip, CircularProgress, Divider, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { API_DATA_ENABLED } from '../api/client'
import { useDashboard, type DashboardPeriod } from '../api/operations'
import { useAuth } from '../app/AuthContext'
import { useSiteSettings } from '../app/SiteSettingsContext'
import { StatusChip } from '../components/StatusChip'
import { activities, chartData, registries, tasks } from '../data/dashboard'
import type { ChartPeriod } from '../types/ui'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

const periodLabels: Record<ChartPeriod, string> = {
  week: '7 jours',
  month: '4 semaines',
  year: '12 mois',
}

const apiPeriodLabels: Record<DashboardPeriod, string> = {
  '7d': '7 jours',
  '4w': '4 semaines',
  '12m': '12 mois',
}

function ConfiguredHomeBanner() {
  const { branding } = useSiteSettings()
  if (!branding.bannerUrl.trim()) return null
  return <Box
    component="img"
    src={branding.bannerUrl}
    alt={`Bannière ${branding.organizationName}`}
    sx={{ display: 'block', width: '100%', maxHeight: 260, objectFit: 'cover', borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}
  />
}

function formatApiSeriesLabel(value: string, period: DashboardPeriod) {
  const parsed = new Date(`${value}${period === '12m' ? '-01' : ''}T12:00:00`)
  if (period === '7d') return new Intl.DateTimeFormat('fr-FR', { weekday: 'short' }).format(parsed)
  if (period === '4w') return `Sem. ${new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' }).format(parsed)}`
  return new Intl.DateTimeFormat('fr-FR', { month: 'short', year: '2-digit' }).format(parsed)
}

function DemoCorrespondenceChart() {
  const [period, setPeriod] = useState<ChartPeriod>('week')
  const data = chartData[period]
  const max = Math.max(...data.internal, ...data.external)

  return <Card component="section" aria-labelledby="chart-title">
    <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" spacing={1.5} sx={{ px: 2.5, py: 1.75 }}>
      <Stack direction="row" alignItems="center" spacing={1}><BarChartOutlined color="primary" fontSize="small" /><Typography id="chart-title" component="h2" variant="h3">Courriers créés</Typography></Stack>
      <ToggleButtonGroup exclusive size="small" value={period} onChange={(_, value: ChartPeriod | null) => value && setPeriod(value)} aria-label="Période du graphique">
        {(Object.keys(periodLabels) as ChartPeriod[]).map((key) => <ToggleButton key={key} value={key}>{periodLabels[key]}</ToggleButton>)}
      </ToggleButtonGroup>
    </Stack>
    <Divider />
    <Box sx={{ p: 2.5 }}>
      <Stack direction="row" spacing={2.5} sx={{ mb: 2 }}><Typography variant="caption" color="text.secondary">■ Internes</Typography><Typography variant="caption" color="text.secondary">■ Externes</Typography></Stack>
      <Box sx={{ overflowX: 'auto', pb: 0.5 }}><Box role="group" aria-label={`Nombre de courriers internes et externes créés sur ${periodLabels[period]}`} sx={{ minWidth: period === 'year' ? 760 : 560, height: 200, display: 'grid', gridTemplateColumns: `repeat(${data.labels.length}, 1fr)`, gap: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}>
        {data.labels.map((label, index) => {
          const internal = data.internal[index]
          const external = data.external[index]
          const total = internal + external
          return <Tooltip key={label} arrow describeChild title={<Stack spacing={0.25}><Typography variant="caption" fontWeight={700}>{label}</Typography><Typography variant="caption">Internes : {internal}</Typography><Typography variant="caption">Externes : {external}</Typography><Typography variant="caption" fontWeight={700}>Total : {total}</Typography></Stack>}>
            <Stack role="img" tabIndex={0} aria-label={`${label} : ${internal} courriers internes, ${external} courriers externes, total ${total}`} alignItems="center" justifyContent="flex-end" sx={{ height: '100%', cursor: 'default' }}>
              <Stack direction="row" spacing={0.5} alignItems="flex-end" sx={{ height: 166 }}><Box sx={{ width: { xs: 16, sm: 22 }, height: `${Math.max((internal / max) * 140, 8)}px`, bgcolor: 'business.internal', borderRadius: '4px 4px 0 0' }} /><Box sx={{ width: { xs: 16, sm: 22 }, height: `${Math.max((external / max) * 140, 8)}px`, bgcolor: 'business.external', borderRadius: '4px 4px 0 0' }} /></Stack>
              <Typography variant="caption" color="text.disabled" sx={{ mt: 0.75 }}>{label}</Typography>
            </Stack>
          </Tooltip>
        })}
      </Box></Box>
    </Box>
  </Card>
}

function DemoDashboardPage() {
  return <Box sx={{ maxWidth: 1400, mx: 'auto', px: { xs: 2, sm: 3, lg: 4 }, py: { xs: 3, md: 4 } }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" spacing={2} sx={{ mb: 2.5 }}><Box><Typography component="h1" variant="h1">Bonjour, Kader</Typography><Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>Samedi 15 août 2026 — Instances actives : Interne 2026, Externe 2026</Typography></Box><Button component={RouterLink} to="/courriers/nouveau" variant="contained" startIcon={<Add />}>Nouveau courrier</Button></Stack>
    <Stack spacing={2}>
      <ConfiguredHomeBanner />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 1.5 }}>{[['Courriers actifs', 428], ['À traiter', 12], ['En validation', 8], ['Signés cette semaine', 34]].map(([label, value]) => <Card key={String(label)} sx={{ p: 2.25, borderTop: '3px solid', borderTopColor: 'primary.main' }}><Typography variant="overline" color="text.secondary">{label}</Typography><Typography variant="h1" sx={{ mt: 0.75, fontSize: '1.8rem' }}>{value}</Typography></Card>)}</Box>
      <DemoCorrespondenceChart />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.35fr 1fr' }, gap: 2 }}>
        <Card component="section" aria-labelledby="tasks-title"><Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2.5, py: 1.75 }}><Typography id="tasks-title" component="h2" variant="h3">Mes tâches</Typography><Button component={RouterLink} to="/taches" size="small" endIcon={<ArrowForward />}>Tout voir</Button></Stack><Divider />{tasks.map((task) => <Stack key={task.id} direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} gap={1.5} sx={{ px: 2.5, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}><Chip label={task.reference} size="small" variant="outlined" /><Box sx={{ minWidth: 0, flex: 1 }}><Typography variant="body2" fontWeight={700}>{task.title}</Typography><Typography variant="caption" color="text.secondary">{task.detail}</Typography></Box><StatusChip status={task.status} /></Stack>)}</Card>
        <Card component="section" aria-labelledby="activity-title"><Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2.5, py: 1.75 }}><Typography id="activity-title" component="h2" variant="h3">Activité récente</Typography><Button component={RouterLink} to="/activite" size="small" endIcon={<ArrowForward />}>Journal d’audit</Button></Stack><Divider />{activities.map((item) => <Box key={item.id} sx={{ px: 2.5, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}><Typography variant="body2" fontWeight={700}>{item.title}</Typography><Typography variant="caption" color="text.secondary">{item.actor} · {item.relativeTime}</Typography></Box>)}</Card>
      </Box>
      <Box component="section" aria-label="Accès rapides aux registres" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 2 }}>{registries.map((registry) => <Card key={registry.id} sx={{ p: 2.25, bgcolor: registry.id === 'internal' ? 'business.internalLight' : 'business.externalLight' }}><Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="h3">{registry.label} 2026</Typography><Button component={RouterLink} to={registry.path} endIcon={<ArrowForward />}>Ouvrir</Button></Stack></Card>)}</Box>
    </Stack>
  </Box>
}

function ApiDashboardPage() {
  const [period, setPeriod] = useState<DashboardPeriod>('12m')
  const { data, loading, error } = useDashboard(period)
  const { session } = useAuth()
  const maxSeries = Math.max(1, ...data.series.flatMap((point) => [point.internal, point.external]))
  return <Box sx={{ maxWidth: 1400, mx: 'auto', px: { xs: 2, sm: 3, lg: 4 }, py: { xs: 3, md: 4 } }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 2.5 }}><Box><Typography component="h1" variant="h1">Bonjour, {session?.user.name.split(' ')[0] ?? 'Utilisateur'}</Typography><Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full' }).format(new Date())} · données de votre périmètre</Typography></Box><Button component={RouterLink} to="/courriers/nouveau" variant="contained" startIcon={<Add />}>Nouveau courrier</Button></Stack>
    {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
    {loading ? <Box sx={{ py: 10, textAlign: 'center' }}><CircularProgress /></Box> : <Stack spacing={2}>
      <ConfiguredHomeBanner />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(5, 1fr)' }, gap: 1.5 }}>{[
        ['Courriers accessibles', data.metrics.total, 'primary.dark'], ['À traiter', data.metrics.to_process, 'warning.main'],
        ['En validation', data.metrics.in_validation, 'primary.main'], ['Validés', data.metrics.validated, 'success.main'], ['En retard', data.metrics.overdue, 'error.main'],
      ].map(([label, value, color]) => <Card key={String(label)} sx={{ p: 2.25, borderTop: '3px solid', borderTopColor: color }}><Typography variant="overline" color="text.secondary">{label}</Typography><Typography variant="h1" sx={{ mt: 0.75, fontSize: '1.8rem' }}>{value}</Typography></Card>)}</Box>
      <Card><Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" spacing={1} sx={{ p: 2.25 }}><Stack direction="row" alignItems="center" spacing={1}><BarChartOutlined color="primary" /><Typography component="h2" variant="h3">Courriers reçus</Typography></Stack><ToggleButtonGroup exclusive size="small" value={period} onChange={(_, value: DashboardPeriod | null) => value && setPeriod(value)} aria-label="Période du graphique">{(Object.keys(apiPeriodLabels) as DashboardPeriod[]).map((key) => <ToggleButton key={key} value={key}>{apiPeriodLabels[key]}</ToggleButton>)}</ToggleButtonGroup></Stack><Divider /><Box sx={{ p: 2.5, overflowX: 'auto' }}><Stack direction="row" alignItems="flex-end" spacing={2} role="group" aria-label={`Courriers reçus sur ${apiPeriodLabels[period]}`} sx={{ minWidth: 560, height: 220 }}>{data.series.map((point) => { const label = formatApiSeriesLabel(point.key, period); const total = point.internal + point.external; return <Tooltip key={point.key} title={`${point.internal} internes · ${point.external} externes · total ${total}`}><Stack role="img" tabIndex={0} aria-label={`${label} : ${point.internal} courriers internes, ${point.external} courriers externes, total ${total}`} alignItems="center" justifyContent="flex-end" sx={{ flex: 1, height: '100%' }}><Stack direction="row" alignItems="flex-end" spacing={0.5} sx={{ height: 175 }}><Box sx={{ width: 18, height: Math.max(5, point.internal / maxSeries * 160), bgcolor: 'business.internal', borderRadius: '4px 4px 0 0' }} /><Box sx={{ width: 18, height: Math.max(5, point.external / maxSeries * 160), bgcolor: 'business.external', borderRadius: '4px 4px 0 0' }} /></Stack><Typography variant="caption">{label}</Typography></Stack></Tooltip> })}</Stack>{!data.series.length ? <Typography color="text.secondary" textAlign="center">Aucune donnée disponible.</Typography> : null}</Box></Card>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.25fr 1fr' }, gap: 2 }}><Card><Stack direction="row" justifyContent="space-between" sx={{ p: 2 }}><Typography component="h2" variant="h3">Mes tâches</Typography><Button component={RouterLink} to="/taches" endIcon={<ArrowForward />}>Tout voir</Button></Stack><Divider />{data.tasks.slice(0, 5).map((task) => <Stack key={task.id} direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} gap={1.5} sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}><Chip label={task.reference ?? 'Brouillon'} size="small" variant="outlined" /><Box sx={{ flex: 1 }}><Typography variant="body2" fontWeight={700}>{task.subject}</Typography><Typography variant="caption" color="text.secondary">{task.label} · {task.assignee_name}</Typography></Box><Chip label={task.status_label} size="small" /></Stack>)}{!data.tasks.length ? <Box sx={{ p: 3 }}><Typography color="text.secondary">Aucune tâche active.</Typography></Box> : null}</Card>
        <Card><Stack direction="row" justifyContent="space-between" sx={{ p: 2 }}><Typography component="h2" variant="h3">Activité récente</Typography><Button component={RouterLink} to="/activite" endIcon={<ArrowForward />}>Tout voir</Button></Stack><Divider />{data.activity.slice(0, 5).map((event) => <Box key={event.id} sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}><Typography variant="body2" fontWeight={700}>{event.event} · {event.reference ?? 'Brouillon'}</Typography><Typography variant="caption" color="text.secondary">{event.actor} · {formatDate(event.created_at)}</Typography></Box>)}{!data.activity.length ? <Box sx={{ p: 3 }}><Typography color="text.secondary">Aucune activité récente.</Typography></Box> : null}</Card></Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>{([['internal', 'Courriers internes', data.registries.internal], ['external', 'Courriers externes', data.registries.external]] as const).map(([registry, label, count]) => <Card key={registry} sx={{ p: 2.25, bgcolor: registry === 'internal' ? 'business.internalLight' : 'business.externalLight' }}><Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography variant="overline">{label}</Typography><Typography variant="h2">{count.toLocaleString('fr-FR')}</Typography></Box><Button component={RouterLink} to={`/courriers/${registry === 'internal' ? 'internes' : 'externes'}`} endIcon={<ArrowForward />}>Ouvrir</Button></Stack></Card>)}</Box>
    </Stack>}
  </Box>
}

export function DashboardPage() {
  return API_DATA_ENABLED ? <ApiDashboardPage /> : <DemoDashboardPage />
}
