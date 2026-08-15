import { useState } from 'react'
import ArrowBack from '@mui/icons-material/ArrowBack'
import CheckCircle from '@mui/icons-material/CheckCircle'
import CloudUploadOutlined from '@mui/icons-material/CloudUploadOutlined'
import ErrorOutline from '@mui/icons-material/ErrorOutline'
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined'
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
  const [fileName, setFileName] = useState(internal ? 'courriers-internes-2025.csv' : 'registre-2025-archive.csv')
  const registryMappings = internal
    ? mappings.map(([source, target, preview]) => target === 'Expéditeur' ? ['service_emetteur', 'Service émetteur', 'Direction générale'] : [source, target, preview])
    : mappings

  const next = () => setStep((current) => Math.min(current + 1, steps.length - 1))
  const previous = () => setStep((current) => Math.max(current - 1, 0))

  return (
    <Box sx={{ maxWidth: 1280, mx: 'auto', px: { xs: 2, sm: 3, lg: 4 }, py: { xs: 3, md: 4 } }}>
      <Button component={RouterLink} to={registryPath} startIcon={<ArrowBack />} sx={{ px: 0, mb: 1 }}>Retour au registre</Button>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'flex-start' }} spacing={2.5} sx={{ mb: 2.5 }}><Box><Typography component="h1" variant="h1">Importer des courriers {registryLabel}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>{fileName} · 1 240 lignes détectées</Typography></Box><Stack direction="row" spacing={1}><Button variant="outlined" onClick={previous} disabled={step === 0}>Précédent</Button>{step < 6 ? <Button variant="contained" onClick={next}>Étape suivante</Button> : <Button component={RouterLink} to={registryPath} variant="contained">Terminer</Button>}</Stack></Stack>

      <Card sx={{ p: { xs: 1.5, md: 2.5 }, mb: 2.5, overflowX: 'auto' }}><Stepper activeStep={step} alternativeLabel sx={{ minWidth: 720 }}>{steps.map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}</Stepper></Card>

      {step === 0 ? <Card sx={{ p: { xs: 3, md: 6 }, textAlign: 'center' }}><CloudUploadOutlined color="primary" sx={{ fontSize: 56 }} /><Typography component="h2" variant="h2" sx={{ mt: 1.5 }}>Sélectionner un fichier CSV ou Excel</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>50 Mo maximum · encodage UTF-8 recommandé</Typography><Button component="label" variant="contained" startIcon={<CloudUploadOutlined />} sx={{ mt: 2.5 }}>Choisir un fichier<input hidden type="file" accept=".csv,.xlsx,.xls" onChange={(event) => setFileName(event.target.files?.[0]?.name ?? fileName)} /></Button>{fileName ? <Alert severity="success" sx={{ mt: 3, textAlign: 'left' }}>{fileName} est prêt pour la prévisualisation.</Alert> : null}</Card> : null}

      {step === 1 ? <Card><Box sx={{ p: 2.5 }}><Typography component="h2" variant="h2">Prévisualisation des données</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Vérifiez l’encodage, les entêtes et les premières lignes avant le mappage.</Typography></Box><Divider /><Box sx={{ overflowX: 'auto' }}><Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', '& th, & td': { p: 1.5, textAlign: 'left', borderBottom: '1px solid', borderColor: 'divider', whiteSpace: 'nowrap', fontSize: 13 }, '& th': { bgcolor: '#FAFBFD' } }}><thead><tr>{registryMappings.slice(0, 5).map(([source]) => <th key={source}>{source}</th>)}</tr></thead><tbody><tr>{registryMappings.slice(0, 5).map(([, , preview]) => <td key={preview}>{preview}</td>)}</tr><tr><td>{internal ? 'Note de service — Sécurité' : 'Renouvellement convention'}</td><td>11/08/2026</td><td>{internal ? 'Secrétariat général' : 'Agence de développement'}</td><td>DAJ</td><td>Haute</td></tr></tbody></Box></Box><Alert severity="info" sx={{ m: 2.5 }}>Séparateur détecté : point-virgule · encodage UTF-8 · ligne d’entête : 1</Alert></Card> : null}

      {step === 2 ? <Card><Box sx={{ p: 2.5 }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'flex-start' }} spacing={1}><Box><Typography component="h2" variant="h2">Correspondance des colonnes</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Associez chaque colonne source à un champ NUMA.</Typography></Box><Chip label="7 sur 7 traitées" color="success" variant="outlined" /></Stack></Box><Divider /><Stack divider={<Divider flexItem />}>{registryMappings.map(([source, target, preview]) => <Box key={source} sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr auto 1.2fr 1.2fr' }, gap: 1.5, alignItems: 'center' }}><Typography sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}>{source}</Typography><Typography color="text.disabled">→</Typography><TextField select size="small" value={target}>{registryMappings.map(([, option]) => <MenuItem key={option} value={option}>{option}</MenuItem>)}</TextField><Typography variant="caption" color="text.secondary">{preview}</Typography></Box>)}</Stack><Alert severity="info" sx={{ m: 2.5 }}>Les numéros actifs seront générés transactionnellement. La référence d’origine est conservée dans un champ historique.</Alert></Card> : null}

      {step === 3 ? <Stack spacing={2.5}><Card sx={{ p: 3 }}><Typography component="h2" variant="h2">Validation avant import</Typography><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2, mt: 2.5 }}>{[['1 240', 'Lignes analysées', 'primary.main'], ['1 218', 'Lignes valides', 'success.main'], ['22', 'Anomalies', 'warning.main']].map(([value, label, color]) => <Box key={label} sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}><Typography variant="h2" color={color}>{value}</Typography><Typography variant="body2" color="text.secondary">{label}</Typography></Box>)}</Box></Card><Alert severity="warning" icon={<ErrorOutline />}>22 lignes nécessitent une décision. Elles peuvent être corrigées, ignorées ou exportées dans le rapport.</Alert></Stack> : null}

      {step === 4 ? <Card><Box sx={{ p: 2.5 }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'flex-start' }} spacing={2}><Box><Typography component="h2" variant="h2">Rapport d’anomalies</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Les lignes invalides ne seront jamais importées silencieusement.</Typography></Box><Button startIcon={<FileDownloadOutlined />} variant="outlined">Exporter le rapport</Button></Stack></Box><Divider /><Stack divider={<Divider flexItem />}>{[['Ligne 18', 'Date invalide', '31/02/2026'], ['Ligne 241', 'Direction inconnue', 'DTECH'], ['Ligne 890', 'Objet obligatoire manquant', '—']].map(([line, issue, value]) => <Stack key={line} direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1} sx={{ p: 2.5 }}><Box><Typography fontWeight={700}>{line} · {issue}</Typography><Typography variant="body2" color="text.secondary">Valeur source : {value}</Typography></Box><Stack direction="row"><Button size="small">Corriger</Button><Button size="small" color="error">Ignorer</Button></Stack></Stack>)}</Stack></Card> : null}

      {step === 5 ? <Card sx={{ p: { xs: 3, md: 4 } }}><Typography component="h2" variant="h2">Confirmer l’import</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>1 218 courriers seront créés dans l’instance {internal ? 'Interne' : 'Externe'} 2026. Les 22 lignes invalides seront exclues et conservées dans le rapport.</Typography><Stack spacing={1.5} sx={{ mt: 3 }}><Alert severity="success">Mappage complet et schéma validé</Alert><Alert severity="success">Permissions et espace documentaire vérifiés</Alert><Alert severity="warning">Cette opération créera de nouveaux éléments et numéros définitifs.</Alert></Stack></Card> : null}

      {step === 6 ? <Card sx={{ p: { xs: 3, md: 5 }, textAlign: 'center' }}><CheckCircle color="success" sx={{ fontSize: 64 }} /><Typography component="h2" variant="h1" sx={{ mt: 1.5 }}>Import terminé</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>1 218 courriers créés · 22 lignes ignorées · rapport conservé dans l’audit.</Typography><LinearProgress variant="determinate" value={100} color="success" sx={{ maxWidth: 500, mx: 'auto', mt: 3 }} /><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="center" spacing={1.5} sx={{ mt: 3 }}><Button component={RouterLink} to={registryPath} variant="contained">Voir le registre</Button><Button startIcon={<FileDownloadOutlined />} variant="outlined">Télécharger le rapport</Button></Stack></Card> : null}
    </Box>
  )
}
