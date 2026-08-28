import { useEffect, useMemo, useState } from 'react'
import Add from '@mui/icons-material/Add'
import ArrowForward from '@mui/icons-material/ArrowForward'
import AttachFileOutlined from '@mui/icons-material/AttachFileOutlined'
import ErrorOutline from '@mui/icons-material/ErrorOutline'
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined'
import FileUploadOutlined from '@mui/icons-material/FileUploadOutlined'
import FilterAltOutlined from '@mui/icons-material/FilterAltOutlined'
import InboxOutlined from '@mui/icons-material/InboxOutlined'
import LockOutlined from '@mui/icons-material/LockOutlined'
import RestartAlt from '@mui/icons-material/RestartAlt'
import Search from '@mui/icons-material/Search'
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Divider,
  IconButton,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Pagination,
  Snackbar,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import { PriorityBadge } from '../components/PriorityBadge'
import { StatusChip } from '../components/StatusChip'
import { externalCorrespondences } from '../data/correspondences'
import type { BusinessStatus, Correspondence, Priority } from '../types/ui'
import { API_DATA_ENABLED } from '../api/client'
import { useCorrespondences, type CorrespondenceQuery } from '../api/correspondences'

const PAGE_SIZE = 10
const statuses: BusinessStatus[] = ['À traiter', 'En validation', 'Validé', 'Brouillon', 'Rejeté', 'Annulé', 'Signé']
const priorities: Priority[] = ['Basse', 'Normale', 'Haute', 'Urgente']
const statusCodes: Record<BusinessStatus, string> = { 'À traiter': 'to_process', 'En validation': 'in_validation', Validé: 'validated', Brouillon: 'draft', Rejeté: 'rejected', Annulé: 'cancelled', Signé: 'signed', Enregistré: 'registered', Archivé: 'archived' }
const priorityCodes: Record<Priority, string> = { Basse: 'low', Normale: 'normal', Haute: 'high', Urgente: 'urgent' }
const confidentialityCodes: Record<string, string> = { Standard: 'standard', Restreint: 'restricted', Confidentiel: 'confidential' }
const dateFormatter = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })

type RegistryView = 'all' | 'mine' | 'grouped' | 'todo' | 'validation' | 'validated' | 'drafts'

const views: Array<{ value: RegistryView; label: string }> = [
  { value: 'all', label: 'Tous' },
  { value: 'mine', label: 'Mes courriers' },
  { value: 'grouped', label: 'Groupés par direction' },
  { value: 'todo', label: 'À traiter' },
  { value: 'validation', label: 'En validation' },
  { value: 'validated', label: 'Validés' },
  { value: 'drafts', label: 'Brouillons' },
]

function isRegistryView(value: string | null): value is RegistryView {
  return views.some((view) => view.value === value)
}

function matchesView(item: Correspondence, view: RegistryView) {
  if (view === 'mine') return item.direction === 'DSI'
  if (view === 'todo') return item.status === 'À traiter'
  if (view === 'validation') return item.status === 'En validation'
  if (view === 'validated') return item.status === 'Validé' || item.status === 'Signé'
  if (view === 'drafts') return item.status === 'Brouillon'
  return true
}

function GroupedRegistry({ items, basePath }: { items: Correspondence[]; basePath: string }) {
  const groups = [...new Set(items.map((item) => item.direction))].sort()
  return (
    <Stack spacing={1.5} aria-label="Courriers groupés par direction">
      {groups.map((direction) => {
        const groupItems = items.filter((item) => item.direction === direction)
        return (
          <Card key={direction} component="section" aria-labelledby={`direction-${direction}`}>
            <Box sx={{ p: 2, bgcolor: 'action.hover' }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                <Typography id={`direction-${direction}`} component="h2" variant="h3">{direction}</Typography>
                <Chip label={`${groupItems.length} courrier${groupItems.length > 1 ? 's' : ''}`} size="small" />
              </Stack>
            </Box>
            <Divider />
            <Stack divider={<Divider flexItem />}>
              {groupItems.map((item) => (
                <Button
                  key={item.id}
                  component={RouterLink}
                  to={`${basePath}/${item.id}`}
                  color="inherit"
                  data-testid="grouped-correspondence-row"
                  sx={{
                    height: 'auto',
                    minHeight: 78,
                    alignSelf: 'stretch',
                    display: 'grid',
                    gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) auto' },
                    alignItems: 'center',
                    gap: { xs: 1, sm: 2 },
                    p: 2,
                    textAlign: 'left',
                    textTransform: 'none',
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: 'primary.main' }}>{item.reference}</Typography>
                    <Typography variant="body2" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{item.subject}</Typography>
                    <Typography variant="caption" color="text.secondary" display="block">{item.sender}</Typography>
                  </Box>
                  <Box sx={{ justifySelf: { xs: 'start', sm: 'end' } }}><StatusChip status={item.status} /></Box>
                </Button>
              ))}
            </Stack>
          </Card>
        )
      })}
    </Stack>
  )
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(`${value}T00:00:00`))
}

function CsvExportButton({ items, fileName, onExported }: { items: Correspondence[]; fileName: string; onExported: () => void }) {
  const exportCsv = () => {
    const headers = ['Numéro', 'Date', 'Objet', 'Expéditeur', 'Direction', 'Priorité', 'Statut', 'Confidentialité', 'Pièces jointes']
    const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`
    const rows = items.map((item) => [
      item.reference,
      formatDate(item.receivedAt),
      item.subject,
      item.sender,
      item.direction,
      item.priority,
      item.status,
      item.confidentiality,
      item.attachmentCount,
    ])
    const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(quote).join(';')).join('\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    onExported()
  }

  return (
    <Button variant="outlined" startIcon={<FileDownloadOutlined />} onClick={exportCsv} disabled={!items.length}>
      Exporter
    </Button>
  )
}

function EmptyState({ filtered, onReset }: { filtered: boolean; onReset: () => void }) {
  return (
    <Card sx={{ py: 7, px: 3, textAlign: 'center' }}>
      <InboxOutlined sx={{ fontSize: 46, color: 'text.disabled', mb: 1.5 }} />
      <Typography component="h2" variant="h3">
        {filtered ? 'Aucun courrier ne correspond aux critères' : 'Aucun courrier enregistré'}
      </Typography>
      <Typography color="text.secondary" variant="body2" sx={{ mt: 1, mb: 2.5 }}>
        {filtered ? 'Modifiez ou réinitialisez les filtres pour élargir les résultats.' : 'Les nouveaux courriers apparaîtront ici.'}
      </Typography>
      {filtered ? <Button startIcon={<RestartAlt />} onClick={onReset}>Réinitialiser les filtres</Button> : null}
    </Card>
  )
}

export type CorrespondenceRegistryConfig = {
  title: string
  description: string
  tableLabel: string
  basePath: string
  importPath: string
  createPath: string
  csvFileName: string
  partyLabel: string
  searchPlaceholder: string
  searchAriaLabel: string
}

type CorrespondenceRegistryPageProps = {
  items: Correspondence[]
  config: CorrespondenceRegistryConfig
  server?: {
    count: number
    loading: boolean
    setQuery: (query: CorrespondenceQuery) => void
  }
}

export function CorrespondenceRegistryPage({ items, config, server }: CorrespondenceRegistryPageProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [exported, setExported] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const query = searchParams.get('q') ?? ''
  const direction = searchParams.get('direction') ?? ''
  const status = searchParams.get('status') ?? ''
  const priority = searchParams.get('priority') ?? ''
  const confidentiality = searchParams.get('confidentiality') ?? ''
  const from = searchParams.get('from') ?? ''
  const to = searchParams.get('to') ?? ''
  const viewParam = searchParams.get('view')
  const view: RegistryView = isRegistryView(viewParam) ? viewParam : 'all'
  const requestedPage = Number.parseInt(searchParams.get('page') ?? '1', 10)
  const hasFilters = Boolean(query || direction || status || priority || confidentiality || from || to || view !== 'all')
  const forcedError = searchParams.get('state') === 'error'
  const paramsKey = searchParams.toString()
  const setServerQuery = server?.setQuery

  useEffect(() => {
    if (!setServerQuery) return
    const selectedStatus = status ? statusCodes[status as BusinessStatus] : ''
    const viewFilter: Pick<CorrespondenceQuery, 'status' | 'statuses' | 'mine'> =
      view === 'todo' ? { status: 'to_process' }
        : view === 'validation' ? { status: 'in_validation' }
          : view === 'validated' ? { statuses: 'validated,signed' }
            : view === 'drafts' ? { status: 'draft' }
              : view === 'mine' ? { mine: true }
                : {}
    const timer = window.setTimeout(() => setServerQuery({
      page: Number.isFinite(requestedPage) ? Math.max(requestedPage, 1) : 1,
      pageSize: view === 'grouped' ? 100 : PAGE_SIZE,
      search: query.trim(),
      direction,
      status: selectedStatus || viewFilter.status,
      statuses: selectedStatus ? undefined : viewFilter.statuses,
      mine: viewFilter.mine,
      priority: priority ? priorityCodes[priority as Priority] : '',
      confidentiality: confidentiality ? confidentialityCodes[confidentiality] : '',
      receivedFrom: from,
      receivedTo: to,
      ordering: '-received_at',
    }), 250)
    return () => window.clearTimeout(timer)
  }, [confidentiality, direction, from, priority, query, requestedPage, setServerQuery, status, to, view])

  useEffect(() => {
    setLoading(true)
    const timer = window.setTimeout(() => setLoading(false), 180)
    return () => window.clearTimeout(timer)
  }, [paramsKey])

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    setSearchParams(next, { replace: true })
  }

  const resetFilters = () => setSearchParams({}, { replace: true })

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('fr')
    if (server) return items
    return items.filter((item) => {
      const searchable = [item.reference, item.subject, item.sender, item.direction].join(' ').toLocaleLowerCase('fr')
      return (
        (!normalizedQuery || searchable.includes(normalizedQuery)) &&
        (!direction || item.direction === direction) &&
        (!status || item.status === status) &&
        (!priority || item.priority === priority) &&
        (!confidentiality || item.confidentiality === confidentiality) &&
        (!from || item.receivedAt >= from) &&
        (!to || item.receivedAt <= to) &&
        matchesView(item, view)
      )
    })
  }, [confidentiality, direction, from, items, priority, query, server, status, to, view])

  const directions = useMemo(() => [...new Set(items.map((item) => item.direction))].sort(), [items])

  const resultCount = server?.count ?? filteredItems.length
  const totalPages = Math.max(1, Math.ceil(resultCount / PAGE_SIZE))
  const page = Number.isFinite(requestedPage) ? Math.min(Math.max(requestedPage, 1), totalPages) : 1
  const pageItems = server ? filteredItems : filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const resultStart = resultCount ? (page - 1) * PAGE_SIZE + 1 : 0
  const resultEnd = Math.min(page * PAGE_SIZE, resultCount)
  const isLoading = server?.loading ?? loading

  return (
    <Box sx={{ maxWidth: 1440, mx: 'auto', px: { xs: 2, sm: 3, lg: 4 }, py: { xs: 3, md: 4 } }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'flex-start' }} spacing={2.5} sx={{ mb: 2.5 }}>
        <Box>
          <Stack direction="row" alignItems="center" spacing={1.25} flexWrap="wrap">
            <Typography component="h1" variant="h1">{config.title}</Typography>
            <Chip label="Active" size="small" color="success" variant="outlined" sx={{ fontWeight: 700 }} />
          </Stack>
          <Typography color="text.secondary" variant="body2" sx={{ mt: 0.75 }}>
            {config.description}
          </Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ width: { xs: '100%', md: 'auto' }, '& .MuiButton-root': { width: { xs: '100%', sm: 'auto' } } }}>
          <Button component={RouterLink} to={config.importPath} variant="outlined" startIcon={<FileUploadOutlined />}>Importer</Button>
          <CsvExportButton items={filteredItems} fileName={config.csvFileName} onExported={() => setExported(true)} />
          <Button component={RouterLink} to={config.createPath} variant="contained" startIcon={<Add />}>Nouveau courrier</Button>
        </Stack>
      </Stack>

      <Card sx={{ mb: 2 }}>
        <Tabs
          value={view}
          onChange={(_, value: RegistryView) => updateParam('view', value === 'all' ? '' : value)}
          variant="scrollable"
          scrollButtons="auto"
          aria-label="Vues du registre"
          sx={{ px: 1.5, minHeight: 48 }}
        >
          {views.map((item) => <Tab key={item.value} value={item.value} label={item.label} />)}
        </Tabs>
        <Divider />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(220px, 1.7fr) 1fr', lg: 'minmax(260px, 2fr) repeat(3, 1fr) auto' }, gap: 1.5 }}>
          <TextField
            type="search"
            size="small"
            value={query}
            onChange={(event) => updateParam('q', event.target.value)}
            placeholder={config.searchPlaceholder}
            slotProps={{
              htmlInput: { 'aria-label': config.searchAriaLabel },
              input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> },
            }}
          />
          <TextField select size="small" label="Direction" value={direction} onChange={(event) => updateParam('direction', event.target.value)}>
            <MenuItem value="">Toutes</MenuItem>
            {directions.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Statut" value={status} onChange={(event) => updateParam('status', event.target.value)}>
            <MenuItem value="">Tous</MenuItem>
            {statuses.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Priorité" value={priority} onChange={(event) => updateParam('priority', event.target.value)}>
            <MenuItem value="">Toutes</MenuItem>
            {priorities.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
          </TextField>
          <Button startIcon={<RestartAlt />} onClick={resetFilters} disabled={!hasFilters} sx={{ whiteSpace: 'nowrap' }}>Réinitialiser</Button>
          <Button startIcon={<FilterAltOutlined />} onClick={() => setAdvancedOpen((value) => !value)} aria-expanded={advancedOpen} sx={{ whiteSpace: 'nowrap' }}>Filtres avancés</Button>
        </Box>
        {advancedOpen ? <Box sx={{ px: 2, pb: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5 }}><TextField select size="small" label="Confidentialité" value={confidentiality} onChange={(event) => updateParam('confidentiality', event.target.value)}><MenuItem value="">Toutes</MenuItem><MenuItem value="Standard">Standard</MenuItem><MenuItem value="Restreint">Restreint</MenuItem><MenuItem value="Confidentiel">Confidentiel</MenuItem></TextField><TextField type="date" size="small" label="Reçu depuis le" value={from} onChange={(event) => updateParam('from', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} /><TextField type="date" size="small" label="Reçu jusqu’au" value={to} onChange={(event) => updateParam('to', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} /></Box> : null}
        <Box
          data-testid="registry-loading-slot"
          aria-hidden={!isLoading}
          sx={{ height: 4, overflow: 'hidden' }}
        >
          <LinearProgress
            aria-label="Actualisation du registre"
            sx={{ height: 4, visibility: isLoading ? 'visible' : 'hidden' }}
          />
        </Box>
      </Card>

      {forcedError ? (
        <Alert severity="error" icon={<ErrorOutline />} action={<Button color="inherit" onClick={resetFilters}>Réessayer</Button>}>
          Impossible de charger le registre. Les données simulées restent intactes.
        </Alert>
      ) : !isLoading && !pageItems.length ? (
        <EmptyState filtered={hasFilters} onReset={resetFilters} />
      ) : view === 'grouped' ? (
        <GroupedRegistry items={filteredItems} basePath={config.basePath} />
      ) : (
        <Card aria-busy={isLoading}>
          <Box sx={{ display: { xs: 'none', md: 'block' } }}>
            <TableContainer>
              <Table aria-label={config.tableLabel}>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#FAFBFD' }}>
                    <TableCell>Numéro</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>Objet / {config.partyLabel}</TableCell>
                    <TableCell>Direction</TableCell>
                    <TableCell>Priorité</TableCell>
                    <TableCell>Statut</TableCell>
                    <TableCell align="center">Pièces</TableCell>
                    <TableCell align="right"><Box component="span" className="sr-only">Actions</Box></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pageItems.map((item) => (
                    <TableRow key={item.id} hover>
                      <TableCell>
                        <Button
                          component={RouterLink}
                          to={`${config.basePath}/${item.id}`}
                          size="small"
                          sx={{ minWidth: 0, px: 0, fontFamily: '"IBM Plex Mono", monospace', fontSize: 11.5 }}
                        >
                          {item.reference}
                        </Button>
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(item.receivedAt)}</TableCell>
                      <TableCell sx={{ minWidth: 260 }}>
                        <Stack direction="row" alignItems="center" spacing={0.75}>
                          <Typography variant="body2" fontWeight={700}>{item.subject}</Typography>
                          {item.confidentiality !== 'Standard' ? <Tooltip title={item.confidentiality}><LockOutlined aria-label={item.confidentiality} sx={{ fontSize: 15, color: 'text.disabled' }} /></Tooltip> : null}
                        </Stack>
                        <Typography variant="caption" color="text.secondary">{item.sender}</Typography>
                      </TableCell>
                      <TableCell>{item.direction}</TableCell>
                      <TableCell><PriorityBadge priority={item.priority} /></TableCell>
                      <TableCell><StatusChip status={item.status} /></TableCell>
                      <TableCell align="center">
                        {item.attachmentCount ? <Stack direction="row" justifyContent="center" alignItems="center" spacing={0.5}><AttachFileOutlined sx={{ fontSize: 17, color: 'text.disabled' }} /><Typography variant="caption">{item.attachmentCount}</Typography></Stack> : '—'}
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title={`Ouvrir ${item.reference}`}>
                          <IconButton component={RouterLink} to={`${config.basePath}/${item.id}`} aria-label={`Ouvrir ${item.reference}`} size="small"><ArrowForward fontSize="small" /></IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>

          <Stack divider={<Divider flexItem />} sx={{ display: { md: 'none' } }}>
            {pageItems.map((item) => (
              <Box component="article" key={item.id} sx={{ p: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                  <Button component={RouterLink} to={`${config.basePath}/${item.id}`} size="small" sx={{ minWidth: 0, px: 0, fontFamily: '"IBM Plex Mono", monospace', fontSize: 11.5 }}>{item.reference}</Button>
                  <StatusChip status={item.status} />
                </Stack>
                <Typography variant="body2" fontWeight={700} sx={{ mt: 1 }}>{item.subject}</Typography>
                <Typography variant="caption" color="text.secondary">{item.sender}</Typography>
                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ mt: 1.5 }}>
                  <Stack direction="row" alignItems="center" spacing={1.5}>
                    <Typography variant="caption" color="text.secondary">{formatDate(item.receivedAt)}</Typography>
                    <Typography variant="caption" color="text.secondary">{item.direction}</Typography>
                    {item.attachmentCount ? <Stack direction="row" alignItems="center" spacing={0.25}><AttachFileOutlined sx={{ fontSize: 16, color: 'text.disabled' }} /><Typography variant="caption">{item.attachmentCount}</Typography></Stack> : null}
                  </Stack>
                  <PriorityBadge priority={item.priority} />
                </Stack>
              </Box>
            ))}
          </Stack>

          <Divider />
          <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" spacing={1.5} sx={{ px: 2.5, py: 1.75 }}>
            <Typography variant="caption" color="text.secondary">
              Affichage {resultStart}–{resultEnd} sur {resultCount} résultat{resultCount > 1 ? 's' : ''}
            </Typography>
            <Pagination
              page={page}
              count={totalPages}
              color="primary"
              size="small"
              onChange={(_, value) => updateParam('page', String(value))}
              showFirstButton
              showLastButton
              getItemAriaLabel={(type, targetPage, selected) => {
                if (type === 'first') return 'Aller à la première page'
                if (type === 'last') return 'Aller à la dernière page'
                if (type === 'next') return 'Aller à la page suivante'
                if (type === 'previous') return 'Aller à la page précédente'
                return selected ? `Page ${targetPage}, page active` : `Aller à la page ${targetPage}`
              }}
            />
          </Stack>
        </Card>
      )}

      <Snackbar open={exported} autoHideDuration={3500} onClose={() => setExported(false)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity="success" variant="filled" onClose={() => setExported(false)}>
          Export de {filteredItems.length} courrier{filteredItems.length > 1 ? 's' : ''} généré
        </Alert>
      </Snackbar>
    </Box>
  )
}

export const externalRegistryConfig: CorrespondenceRegistryConfig = {
  title: 'Courriers externes 2026',
  description: 'Instance annuelle ouverte du 1er janvier au 31 décembre 2026',
  tableLabel: 'Courriers externes 2026',
  basePath: '/courriers/externes',
  importPath: '/courriers/externes/import',
  createPath: '/courriers/nouveau?type=externe',
  csvFileName: 'courriers-externes-2026.csv',
  partyLabel: 'Expéditeur',
  searchPlaceholder: 'Numéro, objet, expéditeur…',
  searchAriaLabel: 'Rechercher dans le registre',
}

export function ExternalRegistryPage() {
  const { items, count, setQuery, error, loading } = useCorrespondences('external', externalCorrespondences, { pageSize: PAGE_SIZE })
  if (error) return <Box sx={{ maxWidth: 900, mx: 'auto', p: 3 }}><Alert severity="error">{error}</Alert></Box>
  return <CorrespondenceRegistryPage items={items} config={externalRegistryConfig} server={API_DATA_ENABLED ? { count, loading, setQuery } : undefined} />
}
