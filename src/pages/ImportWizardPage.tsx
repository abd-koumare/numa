import { useState } from 'react'
import ArrowBack from '@mui/icons-material/ArrowBack'
import CheckCircle from '@mui/icons-material/CheckCircle'
import CloudUploadOutlined from '@mui/icons-material/CloudUploadOutlined'
import ErrorOutline from '@mui/icons-material/ErrorOutline'
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Divider,
  LinearProgress,
  MenuItem,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { apiFetch } from '../api/client'
import { createTransfer } from '../api/operations'

const steps = ['Fichier', 'Prévisualisation', 'Correspondance', 'Validation', 'Anomalies', 'Confirmation', 'Import']
const mappings = [
  ['objet_courrier', 'Objet', 'Demande de partenariat technique'],
  ['date_reception', 'Date de réception', '12/08/2026'],
  ['expediteur_nom', 'Expéditeur', 'Société KORHOGO BTP'],
  ['dir_dest', 'Direction destinataire', 'DT'],
  ['niveau_prio', 'Priorité', 'Normale'],
  ['ref_ancienne', 'Référence historique', 'ARCH-2025-114'],
  ['commentaire_libre', 'Ignorer cette colonne', 'RAS'],
]

export function ImportWizardPage({ registryType = 'external' }: { registryType?: 'external' | 'internal' }) {
  const internal = registryType === 'internal'
  const registryPath = internal ? '/courriers/internes' : '/courriers/externes'
  const registryLabel = internal ? 'internes' : 'externes'
  const [step, setStep] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [fileName, setFileName] = useState('')
  const [jobStatus, setJobStatus] = useState<'idle' | 'pending' | 'running' | 'complete' | 'failed'>('idle')
  const [result, setResult] = useState<{ created: number; errors: { row: number; error: string }[] } | null>(null)
  const [importError, setImportError] = useState('')
  const registryMappings = internal
    ? mappings.map(([source, target, preview]) => target === 'Expéditeur' ? ['service_emetteur', 'Service émetteur', 'Direction générale'] : [source, target, preview])
    : mappings

  const next = () => setStep((current) => Math.min(current + 1, steps.length - 1))
  const previous = () => setStep((current) => Math.max(current - 1, 0))
  const startImport = async () => {
    if (!file) return
    setStep(6); setJobStatus('pending'); setImportError('')
    try {
      const form = new FormData()
      form.append('kind', 'import'); form.append('resource_type', 'correspondence'); form.append('source_file', file)
      form.append('options', JSON.stringify({
        registry: registryType, encoding: 'utf-8-sig',
        mapping: internal
          ? { objet_courrier: 'subject', date_reception: 'received_at', service_emetteur: 'sender', dir_dest: 'direction', niveau_prio: 'priority', ref_ancienne: 'origin_reference' }
          : { objet_courrier: 'subject', date_reception: 'received_at', expediteur_nom: 'sender', dir_dest: 'direction', niveau_prio: 'priority', ref_ancienne: 'origin_reference' },
      }))
      const created = await createTransfer(form)
      for (let attempt = 0; attempt < 180; attempt += 1) {
        const job = await apiFetch<{ status: 'pending' | 'running' | 'complete' | 'failed'; result: { created: number; errors: { row: number; error: string }[] }; error: string }>(`/transfers/${created.id}/`)
        setJobStatus(job.status)
        if (job.status === 'complete') { setResult(job.result); return }
        if (job.status === 'failed') throw new Error(job.error || 'L’import a échoué.')
        await new Promise((resolve) => window.setTimeout(resolve, 1000))
      }
      throw new Error('Le traitement continue en arrière-plan. Consultez les notifications dans quelques instants.')
    } catch (reason) {
      setJobStatus('failed'); setImportError(reason instanceof Error ? reason.message : 'L’import a échoué.')
    }
  }

  return (
    <Box sx={{ maxWidth: 1280, mx: 'auto', px: { xs: 2, sm: 3, lg: 4 }, py: { xs: 3, md: 4 } }}>
      <Button component={RouterLink} to={registryPath} startIcon={<ArrowBack />} sx={{ px: 0, mb: 1 }}>Retour au registre</Button>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'flex-start' }} spacing={2.5} sx={{ mb: 2.5 }}><Box><Typography component="h1" variant="h1">Importer des courriers {registryLabel}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>{fileName || 'Aucun fichier sélectionné'}</Typography></Box><Stack direction="row" spacing={1}><Button variant="outlined" onClick={previous} disabled={step === 0 || step === 6}>Précédent</Button>{step < 5 ? <Button variant="contained" disabled={!file} onClick={next}>Étape suivante</Button> : step === 5 ? <Button variant="contained" disabled={!file} onClick={() => void startImport()}>Lancer l’import</Button> : <Button component={RouterLink} to={registryPath} variant="contained" disabled={jobStatus === 'pending' || jobStatus === 'running'}>Terminer</Button>}</Stack></Stack>

      <Card sx={{ p: { xs: 1.5, md: 2.5 }, mb: 2.5, overflowX: 'auto' }}><Stepper activeStep={step} alternativeLabel sx={{ minWidth: 720 }}>{steps.map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}</Stepper></Card>

      {step === 0 ? <Card sx={{ p: { xs: 3, md: 6 }, textAlign: 'center' }}><CloudUploadOutlined color="primary" sx={{ fontSize: 56 }} /><Typography component="h2" variant="h2" sx={{ mt: 1.5 }}>Sélectionner un fichier CSV</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>50 Mo maximum · encodage UTF-8 recommandé</Typography><Button component="label" variant="contained" startIcon={<CloudUploadOutlined />} sx={{ mt: 2.5 }}>Choisir un fichier<input hidden type="file" accept=".csv,text/csv" onChange={(event) => { const selected = event.target.files?.[0] ?? null; setFile(selected); setFileName(selected?.name ?? '') }} /></Button>{fileName ? <Alert severity="success" sx={{ mt: 3, textAlign: 'left' }}>{fileName} est prêt pour la prévisualisation.</Alert> : null}</Card> : null}

      {step === 1 ? <Card><Box sx={{ p: 2.5 }}><Typography component="h2" variant="h2">Prévisualisation des données</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Vérifiez l’encodage, les entêtes et les premières lignes avant le mappage.</Typography></Box><Divider /><Box sx={{ overflowX: 'auto' }}><Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', '& th, & td': { p: 1.5, textAlign: 'left', borderBottom: '1px solid', borderColor: 'divider', whiteSpace: 'nowrap', fontSize: 13 }, '& th': { bgcolor: '#FAFBFD' } }}><thead><tr>{registryMappings.slice(0, 5).map(([source]) => <th key={source}>{source}</th>)}</tr></thead><tbody><tr>{registryMappings.slice(0, 5).map(([, , preview]) => <td key={preview}>{preview}</td>)}</tr><tr><td>{internal ? 'Note de service — Sécurité' : 'Renouvellement convention'}</td><td>11/08/2026</td><td>{internal ? 'Secrétariat général' : 'Agence de développement'}</td><td>DAJ</td><td>Haute</td></tr></tbody></Box></Box><Alert severity="info" sx={{ m: 2.5 }}>Séparateur détecté : point-virgule · encodage UTF-8 · ligne d’entête : 1</Alert></Card> : null}

      {step === 2 ? <Card><Box sx={{ p: 2.5 }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'flex-start' }} spacing={1}><Box><Typography component="h2" variant="h2">Correspondance des colonnes</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Associez chaque colonne source à un champ NUMA.</Typography></Box><Chip label="7 sur 7 traitées" color="success" variant="outlined" /></Stack></Box><Divider /><Stack divider={<Divider flexItem />}>{registryMappings.map(([source, target, preview]) => <Box key={source} sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr auto 1.2fr 1.2fr' }, gap: 1.5, alignItems: 'center' }}><Typography sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}>{source}</Typography><Typography color="text.disabled">→</Typography><TextField select size="small" value={target}>{registryMappings.map(([, option]) => <MenuItem key={option} value={option}>{option}</MenuItem>)}</TextField><Typography variant="caption" color="text.secondary">{preview}</Typography></Box>)}</Stack><Alert severity="info" sx={{ m: 2.5 }}>Les numéros actifs seront générés transactionnellement. La référence d’origine est conservée dans un champ historique.</Alert></Card> : null}

      {step === 3 ? <Stack spacing={2.5}><Card sx={{ p: 3 }}><Typography component="h2" variant="h2">Validation avant import</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>NUMA vérifiera chaque ligne côté serveur : champs obligatoires, dates, unités organisationnelles, valeurs autorisées et droits d’accès.</Typography></Card><Alert severity="info">Les lignes invalides seront isolées dans le rapport sans annuler les lignes valides.</Alert></Stack> : null}

      {step === 4 ? <Card sx={{ p: 3 }}><Typography component="h2" variant="h2">Rapport d’anomalies</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>À la fin du traitement, le résultat indiquera le numéro de chaque ligne écartée et la cause exacte. Aucune anomalie n’est ignorée silencieusement.</Typography></Card> : null}

      {step === 5 ? <Card sx={{ p: { xs: 3, md: 4 } }}><Typography component="h2" variant="h2">Confirmer l’import</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Le fichier sera importé dans le registre {internal ? 'Interne' : 'Externe'}. Les lignes valides créeront des brouillons avec leurs ACL automatiques ; les autres resteront dans le rapport d’erreurs.</Typography><Stack spacing={1.5} sx={{ mt: 3 }}><Alert severity="success">Mappage prêt</Alert><Alert severity="warning">Cette opération crée de nouveaux éléments métier et sera intégralement auditée.</Alert></Stack></Card> : null}

      {step === 6 ? <Card sx={{ p: { xs: 3, md: 5 }, textAlign: 'center' }}>{jobStatus === 'complete' ? <CheckCircle color="success" sx={{ fontSize: 64 }} /> : jobStatus === 'failed' ? <ErrorOutline color="error" sx={{ fontSize: 64 }} /> : <CloudUploadOutlined color="primary" sx={{ fontSize: 64 }} />}<Typography component="h2" variant="h1" sx={{ mt: 1.5 }}>{jobStatus === 'complete' ? 'Import terminé' : jobStatus === 'failed' ? 'Import interrompu' : 'Import en cours'}</Typography>{importError ? <Alert severity="error" sx={{ mt: 2 }}>{importError}</Alert> : <Typography color="text.secondary" sx={{ mt: 1 }}>{result ? `${result.created} courriers créés · ${result.errors.length} lignes écartées · rapport conservé dans l’audit.` : 'Le fichier est traité en arrière-plan de façon transactionnelle.'}</Typography>}<LinearProgress variant={jobStatus === 'complete' || jobStatus === 'failed' ? 'determinate' : 'indeterminate'} value={jobStatus === 'complete' ? 100 : jobStatus === 'failed' ? 0 : undefined} color={jobStatus === 'failed' ? 'error' : 'success'} sx={{ maxWidth: 500, mx: 'auto', mt: 3 }} /><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="center" spacing={1.5} sx={{ mt: 3 }}><Button component={RouterLink} to={registryPath} variant="contained" disabled={jobStatus === 'pending' || jobStatus === 'running'}>Voir le registre</Button></Stack></Card> : null}
    </Box>
  )
}
