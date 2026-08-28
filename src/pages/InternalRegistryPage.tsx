import { internalCorrespondences } from '../data/internalCorrespondences'
import { CorrespondenceRegistryPage, type CorrespondenceRegistryConfig } from './ExternalRegistryPage'
import { useCorrespondences } from '../api/correspondences'
import { API_DATA_ENABLED } from '../api/client'
import { Alert, Box } from '@mui/material'

export const internalRegistryConfig: CorrespondenceRegistryConfig = {
  title: 'Courriers internes 2026',
  description: 'Instance annuelle ouverte du 1er janvier au 31 décembre 2026 · compteur propre INT',
  tableLabel: 'Courriers internes 2026',
  basePath: '/courriers/internes',
  importPath: '/courriers/internes/import',
  createPath: '/courriers/nouveau?type=interne',
  csvFileName: 'courriers-internes-2026.csv',
  partyLabel: 'Service émetteur',
  searchPlaceholder: 'Numéro, objet, service émetteur…',
  searchAriaLabel: 'Rechercher dans le registre interne',
}

export function InternalRegistryPage() {
  const { items, count, setQuery, error, loading } = useCorrespondences('internal', internalCorrespondences, { pageSize: 10 })
  if (error) return <Box sx={{ maxWidth: 900, mx: 'auto', p: 3 }}><Alert severity="error">{error}</Alert></Box>
  return <CorrespondenceRegistryPage items={items} config={internalRegistryConfig} server={API_DATA_ENABLED ? { count, loading, setQuery } : undefined} />
}
