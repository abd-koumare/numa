import { type ReactNode, useMemo, useState } from 'react'
import ArrowBack from '@mui/icons-material/ArrowBack'
import AttachFileOutlined from '@mui/icons-material/AttachFileOutlined'
import CheckCircle from '@mui/icons-material/CheckCircle'
import Close from '@mui/icons-material/Close'
import DownloadOutlined from '@mui/icons-material/DownloadOutlined'
import EditOutlined from '@mui/icons-material/EditOutlined'
import Fingerprint from '@mui/icons-material/Fingerprint'
import History from '@mui/icons-material/History'
import LockOutlined from '@mui/icons-material/LockOutlined'
import OpenInNew from '@mui/icons-material/OpenInNew'
import SendOutlined from '@mui/icons-material/SendOutlined'
import VerifiedOutlined from '@mui/icons-material/VerifiedOutlined'
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Snackbar,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { Link as RouterLink, useParams } from 'react-router-dom'
import { PriorityBadge } from '../components/PriorityBadge'
import { StatusChip } from '../components/StatusChip'
import { documentVersions, existingSignatureProofs, workflowSteps } from '../data/correspondenceDetail'
import { externalCorrespondences } from '../data/correspondences'
import { internalCorrespondences } from '../data/internalCorrespondences'
import type { BusinessStatus } from '../types/ui'

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' })

function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return <Box><Typography component="dt" variant="caption" color="text.secondary" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</Typography><Typography component="dd" variant="body2" sx={{ m: 0, mt: 0.4 }}>{children}</Typography></Box>
}

export function CorrespondenceDetailPage() {
  const { id = 'ext-0042-2026' } = useParams()
  const [tab, setTab] = useState(0)
  const [status, setStatus] = useState<BusinessStatus>('En validation')
  const [rejectionOpen, setRejectionOpen] = useState(false)
  const [message, setMessage] = useState('')
  const internal = id.startsWith('int-')
  const basePath = internal ? '/courriers/internes' : '/courriers/externes'
  const item = useMemo(() => [...externalCorrespondences, ...internalCorrespondences].find((entry) => entry.id === id) ?? externalCorrespondences[9], [id])

  const validate = () => {
    setStatus('Validé')
    setMessage('Validation enregistrée. Le courrier passe à l’étape Signature.')
  }

  const reject = () => {
    setStatus('Rejeté')
    setRejectionOpen(false)
    setMessage('Courrier rejeté avec motif et renvoyé à son auteur.')
  }

  return (
    <Box sx={{ maxWidth: 1360, mx: 'auto', px: { xs: 2, sm: 3, lg: 4 }, py: { xs: 3, md: 4 } }}>
      <Button component={RouterLink} to={basePath} startIcon={<ArrowBack />} sx={{ px: 0, mb: 1 }}>Retour au registre</Button>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'flex-start' }} spacing={2.5} sx={{ mb: 2.5 }}>
        <Box>
          <Stack direction="row" alignItems="center" spacing={1.25} flexWrap="wrap">
            <Typography component="h1" variant="h1" sx={{ fontFamily: 'IBM Plex Mono, monospace' }}>{item.reference}</Typography>
            <StatusChip status={status} />
            {item.confidentiality !== 'Standard' ? <Chip icon={<LockOutlined />} label={item.confidentiality} size="small" color="warning" variant="outlined" /> : null}
          </Stack>
          <Typography component="p" variant="h2" sx={{ mt: 1 }}>{item.subject}</Typography>
          <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>{item.sender} · Reçu le {dateFormatter.format(new Date(`${item.receivedAt}T00:00:00`))}</Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ width: { xs: '100%', md: 'auto' }, '& .MuiButton-root': { width: { xs: '100%', sm: 'auto' } } }}>
          <Button variant="outlined" startIcon={<EditOutlined />}>Modifier</Button>
          <Button color="error" variant="outlined" startIcon={<Close />} onClick={() => setRejectionOpen(true)}>Rejeter</Button>
          <Button variant="outlined" color="success" startIcon={<CheckCircle />} onClick={validate}>Valider</Button>
          <Button component={RouterLink} to={`${basePath}/${id}/signature`} variant="contained" startIcon={<VerifiedOutlined />}>Signer</Button>
        </Stack>
      </Stack>

      <Card>
        <Tabs value={tab} onChange={(_, value: number) => setTab(value)} variant="scrollable" scrollButtons="auto" aria-label="Sections du courrier" sx={{ px: 1.5 }}>
          <Tab label="Informations" /><Tab label={`Documents (${documentVersions.length})`} /><Tab label="Workflow" /><Tab label="Historique" />
        </Tabs>
      </Card>

      <Box role="tabpanel" sx={{ mt: 2 }}>
        {tab === 0 ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 2fr) 360px' }, gap: 2.5 }}>
            <Stack spacing={2.5}>
              <Card>
                <Box sx={{ p: 2.5 }}><Typography component="h2" variant="h2">Informations générales</Typography></Box><Divider />
                <Box component="dl" sx={{ p: 2.5, m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 2.5 }}>
                  <DetailItem label="Expéditeur">{item.sender}</DetailItem><DetailItem label="Référence d’origine">KBT/DG/2026-118</DetailItem>
                  <DetailItem label="Direction destinataire">{item.direction} — Direction Technique</DetailItem><DetailItem label="Priorité"><PriorityBadge priority={item.priority} /></DetailItem>
                  <DetailItem label="Confidentialité">{item.confidentiality}</DetailItem><DetailItem label="Canal">Courriel</DetailItem>
                  <Box sx={{ gridColumn: { sm: '1 / -1' } }}><DetailItem label="Résumé">Étudier la proposition et préparer un avis technique avant transmission à la Direction générale.</DetailItem></Box>
                </Box>
              </Card>
              <Card>
                <Box sx={{ p: 2.5 }}><Typography component="h2" variant="h2">Relations</Typography></Box><Divider />
                <Box sx={{ p: 2.5 }}><Alert severity="info">Ce courrier est lié au dossier <strong>PRJ-0018 — Modernisation des infrastructures</strong> et au fournisseur <strong>KORHOGO BTP</strong>.</Alert></Box>
              </Card>
            </Stack>
            <Stack spacing={2.5}>
              <Card>
                <Box sx={{ p: 2.5 }}><Typography component="h2" variant="h3">Étape actuelle</Typography><Typography fontWeight={700} sx={{ mt: 1.5 }}>Direction · étape 4 sur 7</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Assignée à Awa Kouassi · échéance aujourd’hui à 17:00</Typography><Button fullWidth variant="outlined" startIcon={<SendOutlined />} sx={{ mt: 2 }}>Relancer</Button></Box>
              </Card>
              <Card>
                <Box sx={{ p: 2.5 }}><Typography component="h2" variant="h3">Document actif</Typography><Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 1.5 }}><Avatar variant="rounded" sx={{ bgcolor: 'error.light', color: 'error.dark' }}>PDF</Avatar><Box sx={{ minWidth: 0 }}><Typography variant="body2" fontWeight={700} noWrap>{documentVersions[0].fileName}</Typography><Typography variant="caption" color="text.secondary">v{documentVersions[0].version} · {documentVersions[0].size}</Typography></Box></Stack><Button fullWidth startIcon={<OpenInNew />} sx={{ mt: 1.5 }}>Prévisualiser</Button></Box>
              </Card>
            </Stack>
          </Box>
        ) : null}

        {tab === 1 ? (
          <Stack spacing={2.5}>
            <Alert severity="info">Une signature couvre uniquement la version précise dont l’empreinte est affichée. Modifier le document crée une nouvelle version non signée.</Alert>
            <Card>
              <Box sx={{ p: 2.5 }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'flex-start' }} spacing={2}><Box><Typography component="h2" variant="h2">Versions du document</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Traçabilité, empreinte et signatures associées.</Typography></Box><Button variant="contained" startIcon={<AttachFileOutlined />}>Nouvelle version</Button></Stack></Box><Divider />
              <Stack divider={<Divider flexItem />}>
                {documentVersions.map((document) => (
                  <Box key={document.id} sx={{ p: 2.5, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'auto minmax(0, 1fr) auto' }, gap: 2, alignItems: 'center' }}>
                    <Avatar variant="rounded" sx={{ bgcolor: document.status === 'Signée' ? 'success.light' : 'grey.100', color: document.status === 'Signée' ? 'success.dark' : 'text.secondary' }}>v{document.version}</Avatar>
                    <Box><Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap"><Typography fontWeight={700}>{document.fileName}</Typography><Chip label={document.status} size="small" color={document.status === 'Signée' ? 'success' : 'default'} /></Stack><Typography variant="caption" color="text.secondary">{document.size} · {document.author} · {document.createdAt}</Typography><Typography variant="caption" display="block" sx={{ mt: 0.5, fontFamily: 'IBM Plex Mono, monospace' }}>sha256:{document.sha256}</Typography></Box>
                    <Stack direction="row"><Tooltip title="Télécharger"><IconButton aria-label={`Télécharger la version ${document.version}`}><DownloadOutlined /></IconButton></Tooltip><Tooltip title="Ouvrir"><IconButton aria-label={`Ouvrir la version ${document.version}`}><OpenInNew /></IconButton></Tooltip></Stack>
                  </Box>
                ))}
              </Stack>
            </Card>
            <Card>
              <Box sx={{ p: 2.5 }}><Typography component="h2" variant="h2">Preuves de signature</Typography></Box><Divider />
              {existingSignatureProofs.map((proof) => <Stack key={proof.id} direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2} sx={{ p: 2.5 }}><Stack direction="row" spacing={1.5}><Avatar sx={{ bgcolor: 'business.externalLight', color: 'business.external' }}><Fingerprint /></Avatar><Box><Typography fontWeight={700}>{proof.signer}</Typography><Typography variant="body2" color="text.secondary">{proof.signerRole} · Signature graphique · {proof.signedAt}</Typography><Typography variant="caption" sx={{ fontFamily: 'IBM Plex Mono, monospace' }}>{proof.documentHash}</Typography></Box></Stack><Chip icon={<VerifiedOutlined />} label="Vérifiée" color="success" variant="outlined" /></Stack>)}
            </Card>
          </Stack>
        ) : null}

        {tab === 2 ? (
          <Card><Box sx={{ p: 2.5 }}><Typography component="h2" variant="h2">Suivi du processus</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>Brouillon → Soumis → Chef de service → Direction → Signature → Enregistré → Archivé</Typography><Stepper activeStep={3} orientation="vertical">{workflowSteps.map((step) => <Step key={step.id} completed={step.status === 'Terminée'}><StepLabel error={step.status === 'Rejetée'} optional={<Typography variant="caption">{step.actor}{step.completedAt ? ` · ${step.completedAt}` : ''}{step.comment ? ` — ${step.comment}` : ''}</Typography>}>{step.label}</StepLabel></Step>)}</Stepper></Box></Card>
        ) : null}

        {tab === 3 ? (
          <Card><Box sx={{ p: 2.5 }}><Typography component="h2" variant="h2">Historique auditable</Typography></Box><Divider /><Stack divider={<Divider flexItem />}>{[
            ['13/08/2026 · 10:05', 'Validation', 'Mariam Diarra', 'Étape Chef de service terminée — conforme au bon de commande.'],
            ['13/08/2026 · 09:20', 'Soumission', 'Kader Yao', 'Brouillon soumis au workflow Courrier externe DT.'],
            ['13/08/2026 · 09:16', 'Document', 'Kader Yao', 'Version 3 ajoutée · empreinte SHA-256 enregistrée.'],
            ['13/08/2026 · 09:14', 'Création', 'Kader Yao', 'Courrier créé dans l’instance Externe 2026.'],
          ].map(([date, action, actor, detail]) => <Stack key={`${date}-${action}`} direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ p: 2.5 }}><History color="action" /><Box sx={{ minWidth: { sm: 180 } }}><Typography variant="caption" color="text.secondary">{date}</Typography><Typography fontWeight={700}>{action}</Typography></Box><Box><Typography variant="body2" fontWeight={700}>{actor}</Typography><Typography variant="body2" color="text.secondary">{detail}</Typography></Box></Stack>)}</Stack></Card>
        ) : null}
      </Box>

      <Dialog open={rejectionOpen} onClose={() => setRejectionOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Rejeter le courrier</DialogTitle><DialogContent><Alert severity="warning" sx={{ mb: 2 }}>Le courrier sera renvoyé à son auteur et l’action sera journalisée.</Alert><TextField autoFocus required fullWidth multiline minRows={4} label="Motif du rejet" placeholder="Expliquez les corrections attendues…" /></DialogContent><DialogActions><Button onClick={() => setRejectionOpen(false)}>Annuler</Button><Button color="error" variant="contained" onClick={reject}>Confirmer le rejet</Button></DialogActions>
      </Dialog>
      <Snackbar open={Boolean(message)} autoHideDuration={4500} onClose={() => setMessage('')} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}><Alert severity="success" variant="filled" onClose={() => setMessage('')}>{message}</Alert></Snackbar>
    </Box>
  )
}
