import { useState } from 'react'
import Add from '@mui/icons-material/Add'
import ArrowForward from '@mui/icons-material/ArrowForward'
import BarChartOutlined from '@mui/icons-material/BarChartOutlined'
import { Box, Button, Card, Divider, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { chartData, registries, tasks, activities } from '../data/dashboard'
import { StatusChip } from '../components/StatusChip'
import type { ActivityItem, ChartPeriod } from '../types/ui'

const activityColors: Record<ActivityItem['kind'], string> = {
  success: '#16A34A',
  info: '#DC2626',
  attachment: '#D97706',
  assignment: '#123E7C',
}

const periodLabels: Record<ChartPeriod, string> = {
  week: '7 jours',
  month: '4 semaines',
  year: '12 mois',
}

function SummaryCards() {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.15fr 1fr 1fr' }, gap: 2 }}>
      <Card sx={{ bgcolor: 'primary.dark', color: '#FFFFFF', borderTop: '3px solid', borderTopColor: 'accent.main' }}>
        <Box sx={{ p: 2.75 }}>
          <Typography variant="overline" sx={{ color: '#8FA3C6', fontWeight: 700, letterSpacing: '0.08em' }}>
            Volume de correspondance
          </Typography>
          <Stack direction="row" spacing={5} sx={{ mt: 1.25 }}>
            <Box>
              <Typography variant="h1" sx={{ fontSize: '2rem', color: '#FFFFFF' }}>428</Typography>
              <Typography variant="caption" sx={{ color: '#B9C6E2' }}>Courriers actifs</Typography>
            </Box>
            <Box>
              <Typography variant="h1" sx={{ fontSize: '2rem', color: '#FFFFFF' }}>34</Typography>
              <Typography variant="caption" sx={{ color: '#B9C6E2' }}>Signés cette semaine</Typography>
            </Box>
          </Stack>
        </Box>
      </Card>

      <Card sx={{ borderTop: '3px solid', borderTopColor: 'primary.main' }}>
        <Box sx={{ p: 2.75 }}>
          <Typography variant="overline" color="text.disabled" fontWeight={700}>
            En attente de validation
          </Typography>
          <Typography variant="h1" sx={{ mt: 1.25, fontSize: '1.75rem' }}>12</Typography>
          <Typography variant="caption" color="warning.main" fontWeight={700}>4 échéances &lt; 48 h</Typography>
        </Box>
      </Card>

      <Card sx={{ borderTop: '3px solid', borderTopColor: 'primary.main' }}>
        <Box sx={{ p: 2.75 }}>
          <Typography variant="overline" color="text.disabled" fontWeight={700}>Instance active</Typography>
          <Typography variant="h3" sx={{ mt: 1.75, mb: 1 }}>Externe 2026</Typography>
          <Typography variant="caption" color="text.disabled">Renouvellement 01/01/2027</Typography>
        </Box>
      </Card>
    </Box>
  )
}

function CorrespondenceChart() {
  const [period, setPeriod] = useState<ChartPeriod>('week')
  const data = chartData[period]
  const max = Math.max(...data.internal, ...data.external)

  return (
    <Card component="section" aria-labelledby="chart-title">
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" spacing={1.5} sx={{ px: 2.5, py: 1.75 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <BarChartOutlined color="primary" fontSize="small" />
          <Typography id="chart-title" component="h2" variant="h3">Courriers créés</Typography>
        </Stack>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={period}
          onChange={(_, value: ChartPeriod | null) => value && setPeriod(value)}
          aria-label="Période du graphique"
          sx={{ alignSelf: { xs: 'stretch', sm: 'auto' }, '& .MuiToggleButton-root': { px: 1.75, py: 0.5, textTransform: 'none', flex: { xs: 1, sm: 'initial' } } }}
        >
          {(Object.keys(periodLabels) as ChartPeriod[]).map((key) => (
            <ToggleButton key={key} value={key}>{periodLabels[key]}</ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>
      <Divider />
      <Box sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Stack direction="row" spacing={2.5} sx={{ mb: 2 }}>
          <Stack direction="row" alignItems="center" spacing={0.75}>
            <Box sx={{ width: 10, height: 10, borderRadius: 0.75, bgcolor: 'business.internal' }} />
            <Typography variant="caption" color="text.secondary">Internes</Typography>
          </Stack>
          <Stack direction="row" alignItems="center" spacing={0.75}>
            <Box sx={{ width: 10, height: 10, borderRadius: 0.75, bgcolor: 'business.external' }} />
            <Typography variant="caption" color="text.secondary">Externes</Typography>
          </Stack>
        </Stack>
        <Box sx={{ overflowX: 'auto', pb: 0.5 }}>
          <Box
            role="group"
            aria-label={`Nombre de courriers internes et externes créés sur ${periodLabels[period]}`}
            sx={{ minWidth: period === 'year' ? 760 : 560, height: 200, display: 'grid', gridTemplateColumns: `repeat(${data.labels.length}, 1fr)`, gap: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}
          >
            {data.labels.map((label, index) => {
              const internal = data.internal[index]
              const external = data.external[index]
              const total = internal + external
              const accessibleLabel = `${label} : ${internal} courriers internes, ${external} courriers externes, total ${total}`
              return (
                <Tooltip
                  key={label}
                  arrow
                  describeChild
                  enterTouchDelay={0}
                  leaveTouchDelay={2500}
                  title={(
                    <Stack spacing={0.25} data-testid={`chart-tooltip-${label}`}>
                      <Typography variant="caption" fontWeight={700} color="inherit">{label}</Typography>
                      <Typography variant="caption" color="inherit">Internes : {internal}</Typography>
                      <Typography variant="caption" color="inherit">Externes : {external}</Typography>
                      <Typography variant="caption" fontWeight={700} color="inherit">Total : {total}</Typography>
                    </Stack>
                  )}
                >
                  <Stack
                    role="img"
                    tabIndex={0}
                    aria-label={accessibleLabel}
                    alignItems="center"
                    justifyContent="flex-end"
                    sx={{ height: '100%', cursor: 'default', borderRadius: 1, '& .chart-bar': { transition: 'transform .16s ease, filter .16s ease, opacity .16s ease', transformOrigin: 'bottom' }, '&:hover .chart-bar, &:focus-visible .chart-bar': { transform: 'translateY(-2px)', filter: 'brightness(.94)' } }}
                  >
                    <Stack direction="row" spacing={0.5} alignItems="flex-end" sx={{ height: 166 }}>
                      <Box className="chart-bar" sx={{ width: { xs: 16, sm: 22 }, height: `${Math.max((internal / max) * 140, 8)}px`, bgcolor: 'business.internal', borderRadius: '4px 4px 0 0' }} />
                      <Box className="chart-bar" sx={{ width: { xs: 16, sm: 22 }, height: `${Math.max((external / max) * 140, 8)}px`, bgcolor: 'business.external', borderRadius: '4px 4px 0 0' }} />
                    </Stack>
                    <Typography variant="caption" color="text.disabled" sx={{ mt: 0.75 }}>{label}</Typography>
                  </Stack>
                </Tooltip>
              )
            })}
          </Box>
        </Box>
      </Box>
    </Card>
  )
}

function WorkPanels() {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.35fr 1fr' }, gap: 2 }}>
      <Card component="section" aria-labelledby="tasks-title">
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2.5, py: 1.75 }}>
          <Typography id="tasks-title" component="h2" variant="h3">Mes tâches</Typography>
          <Button component={RouterLink} to="/taches" size="small" endIcon={<ArrowForward />}>Tout voir</Button>
        </Stack>
        <Divider />
        {tasks.map((task) => (
          <Stack key={task.id} direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} gap={1.5} sx={{ px: 2.5, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Box sx={{ px: 1.1, py: 0.55, borderLeft: '3px solid', borderColor: 'primary.main', borderRadius: 0.75, bgcolor: 'rgba(18,62,124,0.06)', color: 'primary.main', fontFamily: '"IBM Plex Mono", monospace', fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
              {task.reference}
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="body2" fontWeight={700}>{task.title}</Typography>
              <Typography variant="caption" color="text.disabled">{task.detail}</Typography>
            </Box>
            <Stack alignItems={{ sm: 'flex-end' }} spacing={0.5} sx={{ flexShrink: 0 }}>
              <StatusChip status={task.status} />
              <Typography variant="caption" color="text.disabled" sx={{ whiteSpace: 'nowrap' }}>{task.relativeTime}</Typography>
            </Stack>
          </Stack>
        ))}
      </Card>

      <Card component="section" aria-labelledby="activity-title">
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2.5, py: 1.75 }}>
          <Typography id="activity-title" component="h2" variant="h3">Activité récente</Typography>
          <Button component={RouterLink} to="/activite" size="small" endIcon={<ArrowForward />}>Journal d’audit</Button>
        </Stack>
        <Divider />
        {activities.map((activity) => (
          <Stack key={activity.id} direction="row" spacing={1.5} sx={{ px: 2.5, py: 1.35 }}>
            <Box aria-hidden="true" sx={{ width: 8, height: 8, mt: 0.75, borderRadius: '50%', bgcolor: activityColors[activity.kind], flexShrink: 0 }} />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="body2" fontWeight={600}>{activity.title}</Typography>
              <Typography variant="caption" color="text.disabled">{activity.actor}</Typography>
            </Box>
            <Typography variant="caption" color="text.disabled" sx={{ whiteSpace: 'nowrap' }}>{activity.relativeTime}</Typography>
          </Stack>
        ))}
      </Card>
    </Box>
  )
}

export function DashboardPage() {
  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', px: { xs: 2, sm: 3, lg: 4 }, py: { xs: 3, md: 4 } }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" spacing={2} sx={{ mb: 2.5 }}>
        <Box>
          <Typography component="h1" variant="h1">Bonjour, Kader</Typography>
          <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>
            Samedi 15 août 2026 — Instances actives : Interne 2026, Externe 2026
          </Typography>
        </Box>
        <Button component={RouterLink} to="/courriers/nouveau" variant="contained" startIcon={<Add />}>
          Nouveau courrier
        </Button>
      </Stack>

      <Stack spacing={2}>
        <SummaryCards />
        <CorrespondenceChart />
        <WorkPanels />

        <Box component="section" aria-label="Accès rapides aux registres" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 2 }}>
          {registries.map((registry) => {
            const internal = registry.id === 'internal'
            return (
              <Card key={registry.id} sx={{ bgcolor: internal ? 'business.internalLight' : 'business.externalLight' }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 2.25 }}>
                  <Box>
                    <Typography variant="overline" sx={{ color: internal ? 'business.internal' : 'business.external', fontWeight: 700 }}>{internal ? 'Interne' : 'Externe'}</Typography>
                    <Typography variant="h3">{registry.label} 2026</Typography>
                  </Box>
                  <Button component={RouterLink} to={registry.path} endIcon={<ArrowForward />}>Ouvrir</Button>
                </Stack>
              </Card>
            )
          })}
        </Box>
      </Stack>

    </Box>
  )
}
