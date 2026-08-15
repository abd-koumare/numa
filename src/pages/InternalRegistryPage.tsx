import { internalCorrespondences } from '../data/internalCorrespondences'
import { CorrespondenceRegistryPage, type CorrespondenceRegistryConfig } from './ExternalRegistryPage'

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
  return <CorrespondenceRegistryPage items={internalCorrespondences} config={internalRegistryConfig} />
}
