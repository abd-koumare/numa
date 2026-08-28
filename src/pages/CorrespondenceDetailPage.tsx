import { type ChangeEvent, type ReactNode, useMemo, useState } from 'react'
import ArrowBack from '@mui/icons-material/ArrowBack'
import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined'
import AttachFileOutlined from '@mui/icons-material/AttachFileOutlined'
import CheckCircle from '@mui/icons-material/CheckCircle'
import Close from '@mui/icons-material/Close'
import DownloadOutlined from '@mui/icons-material/DownloadOutlined'
import EditOutlined from '@mui/icons-material/EditOutlined'
import Fingerprint from '@mui/icons-material/Fingerprint'
import History from '@mui/icons-material/History'
import LockOutlined from '@mui/icons-material/LockOutlined'
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
import { Link as RouterLink, useLocation, useParams } from 'react-router-dom'
import { API_DATA_ENABLED } from '../api/client'
import {
  downloadCorrespondenceDocument,
  transitionCorrespondence,
  uploadCorrespondenceDocument,
  useCorrespondence,
  type ApiDocumentVersion,
} from '../api/correspondences'
import { PriorityBadge } from '../components/PriorityBadge'
import { StatusChip } from '../components/StatusChip'
import { documentVersions as fallbackDocuments, existingSignatureProofs, workflowSteps } from '../data/correspondenceDetail'
import { externalCorrespondences } from '../data/correspondences'
import { internalCorrespondences } from '../data/internalCorrespondences'
import type { BusinessStatus } from '../types/ui'

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' })
const dateTimeFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return <Box><Typography component="dt" variant="caption" color="text.secondary" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</Typography><Typography component="dd" variant="body2" sx={{ m: 0, mt: 0.4 }}>{children}</Typography></Box>
}

function formatSize(size: number) {
  if (size < 1024) return `${size} o`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} Ko`
  return `${(size / (1024 * 1024)).toFixed(1)} Mo`
}

function eventLabel(event: string) {
  return ({ submit: 'Soumission', validate: 'Validation', reject: 'Rejet', cancel: 'Annulation', reopen: 'Réouverture', archive: 'Archivage', sign: 'Signature' } as Record<string, string>)[event] ?? event
}

export function CorrespondenceDetailPage() {
  const { id = 'ext-0042-2026' } = useParams()
  const location = useLocation()
  const [tab, setTab] = useState(0)
  const [demoStatus, setDemoStatus] = useState<BusinessStatus>('En validation')
  const [rejectionOpen, setRejectionOpen] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [cancellationOpen, setCancellationOpen] = useState(false)
  const [cancellationReason, setCancellationReason] = useState('')
  const [versionOpen, setVersionOpen] = useState(false)
  const [versionFile, setVersionFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState('')
  const [message, setMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [acting, setActing] = useState(false)
  const internal = location.pathname.includes('/courriers/internes/')
  const basePath = internal ? '/courriers/internes' : '/courriers/externes'
  const fallbackItem = useMemo(() => [...externalCorrespondences, ...internalCorrespondences].find((entry) => entry.id === id) ?? externalCorrespondences[9], [id])
  const { item, apiItem, loading: apiLoading, error: apiError, reload } = useCorrespondence(id, fallbackItem)
  const status = apiItem?.status_label ?? demoStatus
  const documents = apiItem?.documents ?? []
  const activeDocument = documents.find((version) => version.document_id && apiItem?.files.find((file) => file.id === version.document_id)?.active_version_number === version.version) ?? documents[0]
  const editable = !apiItem || ['draft', 'to_process'].includes(apiItem.status)

  if (apiLoading) return <Box sx={{ maxWidth: 900, mx: 'auto', p: 4 }}><Typography>Chargement du courrier…</Typography></Box>
  if (apiError) return <Box sx={{ maxWidth: 900, mx: 'auto', p: 4 }}><Alert severity="error">{apiError}</Alert></Box>

  const runTransition = async (action: 'submit' | 'validate' | 'reject' | 'cancel' | 'reopen' | 'archive', comment = '') => {
    if (!API_DATA_ENABLED || !apiItem) {
      const labels: Partial<Record<typeof action, BusinessStatus>> = { submit: 'En validation', validate: 'Validé', reject: 'Rejeté', cancel: 'Annulé' }
      if (labels[action]) setDemoStatus(labels[action] as BusinessStatus)
      setMessage(`Action « ${eventLabel(action)} » enregistrée.`)
      return
    }
    setActing(true)
    setActionError('')
    try {
      const result = await transitionCorrespondence(id, action, apiItem.etag || apiItem.row_version, comment)
      setMessage(`${result.reference ?? 'Le courrier'} est maintenant ${result.status_label.toLocaleLowerCase('fr')}.`)
      reload()
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'L’action n’a pas pu être enregistrée.')
    } finally {
      setActing(false)
    }
  }

  const chooseVersion = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.type) || file.size > 25 * 1024 * 1024) {
      setFileError('Fichier refusé : utilisez un PDF ou DOCX de 25 Mo maximum.')
      setVersionFile(null)
      return
    }
    setFileError('')
    setVersionFile(file)
  }

  const addVersion = async () => {
    if (!versionFile || !apiItem || !activeDocument?.document_id) return
    setActing(true)
    try {
      await uploadCorrespondenceDocument(id, versionFile, apiItem.etag || apiItem.row_version, { documentId: activeDocument.document_id })
      setVersionOpen(false)
      setVersionFile(null)
      setMessage('Nouvelle version ajoutée ; les contrôles antivirus et OCR sont en cours.')
      reload()
    } catch (reason) {
      setFileError(reason instanceof Error ? reason.message : 'La nouvelle version n’a pas pu être ajoutée.')
    } finally {
      setActing(false)
    }
  }

  const download = async (document: ApiDocumentVersion) => {
    if (!document.download_url) {
      setActionError('Le document sera téléchargeable après le contrôle antivirus.')
      return
    }
    try {
      await downloadCorrespondenceDocument(document.download_url, document.filename)
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Téléchargement impossible.')
    }
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
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} flexWrap="wrap" sx={{ width: { xs: '100%', md: 'auto' }, '& .MuiButton-root': { width: { xs: '100%', sm: 'auto' } } }}>
          {editable ? <Button component={RouterLink} to={`${basePath}/${id}/modifier${internal ? '?type=interne' : ''}`} variant="outlined" startIcon={<EditOutlined />}>Modifier</Button> : null}
          {apiItem?.status === 'draft' || apiItem?.status === 'to_process' ? <Button disabled={acting} variant="contained" startIcon={<SendOutlined />} onClick={() => void runTransition('submit')}>Soumettre</Button> : null}
          {!apiItem || apiItem.status === 'in_validation' ? <><Button disabled={acting} color="error" variant="outlined" startIcon={<Close />} onClick={() => setRejectionOpen(true)}>Rejeter</Button><Button disabled={acting} variant="outlined" color="success" startIcon={<CheckCircle />} onClick={() => void runTransition('validate')}>Valider</Button></> : null}
          {!apiItem || apiItem.status === 'validated' ? <Button component={RouterLink} to={`${basePath}/${id}/signature`} variant="contained" startIcon={<VerifiedOutlined />}>Signer</Button> : null}
          {apiItem && ['validated', 'signed', 'cancelled'].includes(apiItem.status) ? <Button disabled={acting} variant="outlined" startIcon={<ArchiveOutlined />} onClick={() => void runTransition('archive')}>Archiver</Button> : null}
          {apiItem && ['draft', 'to_process', 'in_validation', 'rejected'].includes(apiItem.status) ? <Button disabled={acting} color="error" onClick={() => setCancellationOpen(true)}>Annuler</Button> : null}
          {apiItem && ['rejected', 'cancelled', 'archived'].includes(apiItem.status) ? <Button disabled={acting} onClick={() => void runTransition('reopen')}>Réouvrir</Button> : null}
        </Stack>
      </Stack>
      {actionError ? <Alert severity="error" onClose={() => setActionError('')} sx={{ mb: 2 }}>{actionError}</Alert> : null}

      <Card>
        <Tabs value={tab} onChange={(_, value: number) => setTab(value)} variant="scrollable" scrollButtons="auto" aria-label="Sections du courrier" sx={{ px: 1.5 }}>
          <Tab label="Informations" /><Tab label={`Documents (${apiItem ? documents.length : fallbackDocuments.length})`} /><Tab label="Workflow" /><Tab label="Historique" />
        </Tabs>
      </Card>

      <Box role="tabpanel" sx={{ mt: 2 }}>
        {tab === 0 ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 2fr) 360px' }, gap: 2.5 }}>
            <Card>
              <Box sx={{ p: 2.5 }}><Typography component="h2" variant="h2">Informations générales</Typography></Box><Divider />
              <Box component="dl" sx={{ p: 2.5, m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 2.5 }}>
                <DetailItem label="Expéditeur">{item.sender}</DetailItem><DetailItem label="Référence d’origine">{apiItem?.origin_reference || '—'}</DetailItem>
                <DetailItem label="Direction destinataire">{item.direction}</DetailItem><DetailItem label="Service responsable">{apiItem?.responsible_service_code || item.direction}</DetailItem>
                <DetailItem label="Priorité"><PriorityBadge priority={item.priority} /></DetailItem><DetailItem label="Confidentialité">{item.confidentiality}</DetailItem>
                <DetailItem label="Canal">{apiItem?.channel || 'Courriel'}</DetailItem><DetailItem label="Échéance">{apiItem?.due_at ? dateFormatter.format(new Date(`${apiItem.due_at}T00:00:00`)) : '—'}</DetailItem>
                <Box sx={{ gridColumn: { sm: '1 / -1' } }}><DetailItem label="Résumé">{apiItem?.summary || 'Aucun résumé.'}</DetailItem></Box>
              </Box>
            </Card>
            <Stack spacing={2.5}>
              <Card><Box sx={{ p: 2.5 }}><Typography component="h2" variant="h3">Suivi</Typography><Typography fontWeight={700} sx={{ mt: 1.5 }}>{status}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Version de la fiche : {apiItem?.row_version ?? 1}</Typography></Box></Card>
              <Card><Box sx={{ p: 2.5 }}><Typography component="h2" variant="h3">Document actif</Typography>{activeDocument ? <><Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 1.5 }}><Avatar variant="rounded" sx={{ bgcolor: 'error.light', color: 'error.dark' }}>{activeDocument.detected_mime_type === 'application/pdf' ? 'PDF' : 'DOC'}</Avatar><Box sx={{ minWidth: 0 }}><Typography variant="body2" fontWeight={700} noWrap>{activeDocument.filename}</Typography><Typography variant="caption" color="text.secondary">v{activeDocument.version} · {formatSize(activeDocument.size)}</Typography></Box></Stack><Button fullWidth startIcon={<DownloadOutlined />} disabled={!activeDocument.download_url} sx={{ mt: 1.5 }} onClick={() => void download(activeDocument)}>Télécharger</Button></> : <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>Aucun document.</Typography>}</Box></Card>
            </Stack>
          </Box>
        ) : null}

        {tab === 1 ? (
          <Stack spacing={2.5}>
            <Alert severity="info">Une signature couvre uniquement la version précise et l’empreinte affichées. Une nouvelle version devra être validée et signée séparément.</Alert>
            <Card>
              <Box sx={{ p: 2.5 }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2}><Box><Typography component="h2" variant="h2">Versions du document</Typography><Typography variant="body2" color="text.secondary">Antivirus, extraction OCR et empreinte SHA-256.</Typography></Box>{editable && (!apiItem || activeDocument?.document_id) ? <Button variant="contained" startIcon={<AttachFileOutlined />} onClick={() => setVersionOpen(true)}>Nouvelle version</Button> : null}</Stack></Box><Divider />
              {documents.length ? <Stack divider={<Divider flexItem />}>{documents.map((document) => <Box key={document.id} sx={{ p: 2.5, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'auto minmax(0, 1fr) auto' }, gap: 2, alignItems: 'center' }}><Avatar variant="rounded">v{document.version}</Avatar><Box><Stack direction="row" spacing={1} flexWrap="wrap"><Typography fontWeight={700}>{document.filename}</Typography><Chip label={document.scan_status_label} size="small" color={document.scan_status === 'clean' ? 'success' : document.scan_status === 'infected' ? 'error' : 'default'} /><Chip label={document.extraction_status_label} size="small" variant="outlined" /></Stack><Typography variant="caption" color="text.secondary">{formatSize(document.size)} · {document.author} · {dateTimeFormatter.format(new Date(document.created_at))}</Typography><Typography variant="caption" display="block" sx={{ mt: .5, fontFamily: 'IBM Plex Mono, monospace', overflowWrap: 'anywhere' }}>sha256:{document.sha256}</Typography></Box><Tooltip title="Télécharger"><span><IconButton disabled={!document.download_url} aria-label={`Télécharger la version ${document.version}`} onClick={() => void download(document)}><DownloadOutlined /></IconButton></span></Tooltip></Box>)}</Stack> : <Box sx={{ p: 2.5 }}><Typography color="text.secondary">Aucun document joint.</Typography></Box>}
            </Card>
            <Card><Box sx={{ p: 2.5 }}><Typography component="h2" variant="h2">Preuves de signature</Typography></Box><Divider />{apiItem ? (apiItem.signature_proofs.length ? apiItem.signature_proofs.map((proof) => <Stack key={proof.id} direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2} sx={{ p: 2.5 }}><Stack direction="row" spacing={1.5}><Avatar><Fingerprint /></Avatar><Box><Typography fontWeight={700}>{proof.signer}</Typography><Typography variant="body2" color="text.secondary">{proof.signer_role || 'Signataire'} · {proof.level} · {proof.signed_at ? dateTimeFormatter.format(new Date(proof.signed_at)) : ''}</Typography><Typography variant="caption" sx={{ fontFamily: 'IBM Plex Mono, monospace' }}>{proof.document_hash}</Typography></Box></Stack><Chip icon={<VerifiedOutlined />} label={proof.status === 'verified' ? 'Vérifiée' : proof.status} color={proof.status === 'verified' ? 'success' : 'default'} variant="outlined" /></Stack>) : <Box sx={{ p: 2.5 }}><Typography color="text.secondary">Aucune preuve de signature.</Typography></Box>) : existingSignatureProofs.map((proof) => <Box key={proof.id} sx={{ p: 2.5 }}>{proof.signer}</Box>)}</Card>
          </Stack>
        ) : null}

        {tab === 2 ? (
          <Card><Box sx={{ p: 2.5 }}><Typography component="h2" variant="h2">Suivi du processus</Typography><Stepper activeStep={apiItem?.workflow_events.length ?? 3} orientation="vertical" sx={{ mt: 2 }}>{apiItem ? apiItem.workflow_events.map((event) => <Step key={event.id} completed><StepLabel optional={<Typography variant="caption">{event.actor} · {dateTimeFormatter.format(new Date(event.created_at))}{event.comment ? ` — ${event.comment}` : ''}</Typography>}>{eventLabel(event.event)} · {event.to_status}</StepLabel></Step>) : workflowSteps.map((step) => <Step key={step.id} completed={step.status === 'Terminée'}><StepLabel>{step.label}</StepLabel></Step>)}</Stepper></Box></Card>
        ) : null}

        {tab === 3 ? (
          <Card><Box sx={{ p: 2.5 }}><Typography component="h2" variant="h2">Historique auditable</Typography></Box><Divider />{apiItem?.workflow_events.length ? <Stack divider={<Divider flexItem />}>{[...apiItem.workflow_events].reverse().map((event) => <Stack key={event.id} direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ p: 2.5 }}><History color="action" /><Box sx={{ minWidth: { sm: 190 } }}><Typography variant="caption" color="text.secondary">{dateTimeFormatter.format(new Date(event.created_at))}</Typography><Typography fontWeight={700}>{eventLabel(event.event)}</Typography></Box><Box><Typography variant="body2" fontWeight={700}>{event.actor}</Typography><Typography variant="body2" color="text.secondary">{event.comment || `${event.from_status || 'création'} → ${event.to_status}`}</Typography></Box></Stack>)}</Stack> : <Box sx={{ p: 2.5 }}><Typography color="text.secondary">Aucun événement de workflow.</Typography></Box>}</Card>
        ) : null}
      </Box>

      <Dialog open={rejectionOpen} onClose={() => setRejectionOpen(false)} fullWidth maxWidth="sm"><DialogTitle>Rejeter le courrier</DialogTitle><DialogContent><Alert severity="warning" sx={{ mb: 2 }}>Le motif sera conservé dans l’historique et le journal d’audit.</Alert><TextField autoFocus required fullWidth multiline minRows={4} label="Motif du rejet" value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} /></DialogContent><DialogActions><Button onClick={() => setRejectionOpen(false)}>Annuler</Button><Button color="error" variant="contained" disabled={!rejectionReason.trim() || acting} onClick={() => { setRejectionOpen(false); void runTransition('reject', rejectionReason) }}>Confirmer</Button></DialogActions></Dialog>
      <Dialog open={cancellationOpen} onClose={() => setCancellationOpen(false)} fullWidth maxWidth="sm"><DialogTitle>Annuler le courrier</DialogTitle><DialogContent><Alert severity="error" sx={{ mb: 2 }}>Le numéro restera réservé et ne sera jamais réutilisé.</Alert><TextField autoFocus required fullWidth multiline minRows={4} label="Justification" value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} /></DialogContent><DialogActions><Button onClick={() => setCancellationOpen(false)}>Retour</Button><Button color="error" variant="contained" disabled={!cancellationReason.trim() || acting} onClick={() => { setCancellationOpen(false); void runTransition('cancel', cancellationReason) }}>Confirmer</Button></DialogActions></Dialog>
      <Dialog open={versionOpen} onClose={() => setVersionOpen(false)} fullWidth maxWidth="sm"><DialogTitle>Ajouter une nouvelle version</DialogTitle><DialogContent><Alert severity="info" sx={{ mb: 2 }}>La nouvelle version sera analysée par ClamAV puis indexée par OCR.</Alert><Button component="label" variant="outlined" startIcon={<AttachFileOutlined />}>Choisir un PDF ou DOCX<input hidden type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={chooseVersion} /></Button>{versionFile ? <Alert severity="success" sx={{ mt: 2 }}>{versionFile.name} · {formatSize(versionFile.size)}</Alert> : null}{fileError ? <Alert severity="error" sx={{ mt: 2 }}>{fileError}</Alert> : null}</DialogContent><DialogActions><Button onClick={() => setVersionOpen(false)}>Annuler</Button><Button variant="contained" disabled={!versionFile || acting} onClick={() => void addVersion()}>Ajouter</Button></DialogActions></Dialog>
      <Snackbar open={Boolean(message)} autoHideDuration={4500} onClose={() => setMessage('')} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}><Alert severity="success" variant="filled" onClose={() => setMessage('')}>{message}</Alert></Snackbar>
    </Box>
  )
}
