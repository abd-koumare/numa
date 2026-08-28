import { type PointerEvent as ReactPointerEvent, type ReactNode, useRef, useState } from 'react'
import ArrowBack from '@mui/icons-material/ArrowBack'
import Autorenew from '@mui/icons-material/Autorenew'
import BadgeOutlined from '@mui/icons-material/BadgeOutlined'
import BrushOutlined from '@mui/icons-material/BrushOutlined'
import CheckCircle from '@mui/icons-material/CheckCircle'
import CloudUploadOutlined from '@mui/icons-material/CloudUploadOutlined'
import DrawOutlined from '@mui/icons-material/DrawOutlined'
import Fingerprint from '@mui/icons-material/Fingerprint'
import LockOutlined from '@mui/icons-material/LockOutlined'
import VerifiedOutlined from '@mui/icons-material/VerifiedOutlined'
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import { Link as RouterLink, useLocation, useParams } from 'react-router-dom'
import { API_DATA_ENABLED } from '../api/client'
import { signCorrespondence, useCorrespondence } from '../api/correspondences'
import type { SignatureLevel } from '../types/ui'
import { externalCorrespondences } from '../data/correspondences'
import { internalCorrespondences } from '../data/internalCorrespondences'

const signatureLevels: Array<{ id: SignatureLevel; title: string; description: string; usage: string; icon: ReactNode }> = [
  { id: 'electronic-validation', title: 'Validation électronique', description: 'Trace l’utilisateur, la date, l’action, la version et l’empreinte du document.', usage: 'Approbation interne auditable', icon: <CheckCircle /> },
  { id: 'graphic', title: 'Signature graphique', description: 'Signature dessinée, tapée ou importée, apposée visuellement sur le document.', usage: 'Présentation — sans preuve cryptographique autonome', icon: <BrushOutlined /> },
  { id: 'digital', title: 'Signature numérique', description: 'Signature cryptographique liée à un certificat, une clé et un horodatage.', usage: 'Niveau de preuve supérieur', icon: <Fingerprint /> },
]

function MetadataRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={0.5} sx={{ py: 0.75 }}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="caption" fontWeight={700} sx={mono ? { fontFamily: 'IBM Plex Mono, monospace' } : undefined}>{value}</Typography></Stack>
}

export function SignaturePage() {
  const { id = 'ext-0040-2026' } = useParams()
  const location = useLocation()
  const internal = location.pathname.includes('/courriers/internes/')
  const basePath = internal ? '/courriers/internes' : '/courriers/externes'
  const fallbackCorrespondence = [...externalCorrespondences, ...internalCorrespondences].find((item) => item.id === id) ?? externalCorrespondences[11]
  const { item: correspondence, apiItem, loading, error } = useCorrespondence(id, fallbackCorrespondence)
  const documentVersion = apiItem?.documents.find((document) => document.scan_status === 'clean')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [level, setLevel] = useState<SignatureLevel>('graphic')
  const [captureMode, setCaptureMode] = useState(0)
  const [typedName, setTypedName] = useState('Kader Yao')
  const [uploadedName, setUploadedName] = useState('')
  const [uploadedData, setUploadedData] = useState('')
  const [consent, setConsent] = useState(false)
  const [certificateState, setCertificateState] = useState<'valid' | 'missing' | 'expired'>('valid')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [signed, setSigned] = useState(false)
  const [signatureError, setSignatureError] = useState('')

  const canvasPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const bounds = canvas.getBoundingClientRect()
    return { x: (event.clientX - bounds.left) * (canvas.width / bounds.width), y: (event.clientY - bounds.top) * (canvas.height / bounds.height) }
  }

  const startDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    drawing.current = true
    canvas.setPointerCapture(event.pointerId)
    const point = canvasPoint(event)
    const context = canvas.getContext('2d')!
    context.beginPath()
    context.moveTo(point.x, point.y)
  }

  const draw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !canvasRef.current) return
    const point = canvasPoint(event)
    const context = canvasRef.current.getContext('2d')!
    context.strokeStyle = '#0B2447'
    context.lineWidth = 3
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.lineTo(point.x, point.y)
    context.stroke()
  }

  const clearCanvas = () => canvasRef.current?.getContext('2d')?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)

  const confirmSignature = async () => {
    setConfirmOpen(false)
    setProcessing(true)
    setSignatureError('')
    try {
      if (API_DATA_ENABLED) {
        if (!apiItem || !documentVersion) throw new Error('Aucune version saine n’est disponible pour la signature.')
        const graphicMark = level === 'graphic'
          ? captureMode === 0
            ? canvasRef.current?.toDataURL('image/png') ?? ''
            : captureMode === 1
              ? `typed:${typedName}`
              : uploadedData
          : ''
        await signCorrespondence(id, apiItem.etag || apiItem.row_version, {
          documentVersionId: documentVersion.id,
          level: level === 'electronic-validation' ? level : 'graphic',
          graphicMark,
        })
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 500))
      }
      setProcessing(false)
      setSigned(true)
    } catch (reason) {
      setProcessing(false)
      setSignatureError(reason instanceof Error ? reason.message : 'La signature n’a pas pu être enregistrée.')
    }
  }

  if (loading) return <Box sx={{ maxWidth: 900, mx: 'auto', p: 4 }}><Typography>Chargement du document à signer…</Typography></Box>
  if (error) return <Box sx={{ maxWidth: 900, mx: 'auto', p: 4 }}><Alert severity="error">{error}</Alert></Box>

  if (signed) {
    return (
      <Box sx={{ maxWidth: 900, mx: 'auto', px: { xs: 2, sm: 3 }, py: { xs: 4, md: 7 } }}>
        <Card sx={{ p: { xs: 3, md: 5 }, textAlign: 'center' }}>
          <CheckCircle color="success" sx={{ fontSize: 64 }} />
          <Typography component="h1" variant="h1" sx={{ mt: 2 }}>Signature apposée et vérifiée</Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>La preuve est liée à la version {documentVersion?.version ?? 3} du document. Elle est maintenant visible dans la fiche et le journal d’audit.</Typography>
          <Box sx={{ maxWidth: 560, mx: 'auto', mt: 3, p: 2, bgcolor: 'background.default', borderRadius: 1, textAlign: 'left' }}>
            <MetadataRow label="Document" value={`${correspondence.reference} · version ${documentVersion?.version ?? 3}`} />
            <MetadataRow label="Signataire" value="Kader Yao · Configurateur" />
            <MetadataRow label="Type" value={signatureLevels.find((item) => item.id === level)!.title} />
            <MetadataRow label="Horodatage" value="15/08/2026 · 15:48:22 UTC" />
            <MetadataRow label="Empreinte" value="sha256:8f2a…c19d" mono />
            {level === 'digital' ? <MetadataRow label="Certificat" value="ORGATECH-CA · valide" /> : null}
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="center" spacing={1.5} sx={{ mt: 3 }}>
            <Button component={RouterLink} to={`${basePath}/${id}`} variant="contained">Retour à la fiche</Button>
            <Button variant="outlined">Télécharger la preuve</Button>
          </Stack>
        </Card>
      </Box>
    )
  }

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', px: { xs: 2, sm: 3, lg: 4 }, py: { xs: 3, md: 4 } }}>
      <Button component={RouterLink} to={`${basePath}/${id}`} startIcon={<ArrowBack />} sx={{ px: 0, mb: 1 }}>Retour à la fiche</Button>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'flex-start' }} spacing={2.5} sx={{ mb: 2.5 }}>
        <Box><Typography component="h1" variant="h1">Signature électronique</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}><Box component="span" sx={{ fontFamily: 'IBM Plex Mono, monospace' }}>{correspondence.reference}</Box> — {correspondence.subject} · version {documentVersion?.version ?? 3}</Typography></Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><Button component={RouterLink} to={`${basePath}/${id}`} variant="outlined">Annuler</Button><Button variant="contained" startIcon={processing ? <CircularProgress size={18} color="inherit" /> : <DrawOutlined />} disabled={!consent || processing || (API_DATA_ENABLED && (!documentVersion || apiItem?.status !== 'validated')) || (level === 'digital' && certificateState !== 'valid')} onClick={() => setConfirmOpen(true)}>{processing ? 'Signature en cours…' : 'Apposer la signature'}</Button></Stack>
      </Stack>

      {signatureError ? <Alert severity="error" onClose={() => setSignatureError('')} sx={{ mb: 2.5 }}>{signatureError}</Alert> : null}
      {apiItem && apiItem.status !== 'validated' ? <Alert severity="warning" sx={{ mb: 2.5 }}>Ce courrier doit être validé avant de pouvoir être signé.</Alert> : null}
      <Alert severity="info" icon={<LockOutlined />} sx={{ mb: 2.5 }}>Vous signez l’empreinte de la <strong>version {documentVersion?.version ?? 3}</strong>. Toute modification ultérieure créera une nouvelle version non couverte par cette signature.</Alert>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(480px, .9fr) minmax(520px, 1.1fr)' }, gap: 2.5, alignItems: 'start' }}>
        <Card>
          <Box sx={{ p: 2.5 }}><Typography component="h2" variant="h2">Choisir le niveau de signature</Typography></Box><Divider />
          <Stack spacing={1.25} sx={{ p: 2.5 }} role="radiogroup" aria-label="Niveau de signature">
            {signatureLevels.map((item) => (
              <Card key={item.id} variant="outlined" sx={{ borderColor: level === item.id ? 'primary.main' : 'divider', bgcolor: level === item.id ? 'rgba(18,62,124,.035)' : 'background.paper', boxShadow: 'none' }}>
                <CardActionArea disabled={item.id === 'digital'} role="radio" aria-checked={level === item.id} onClick={() => setLevel(item.id)} sx={{ p: 2 }}>
                  <Stack direction="row" spacing={1.5}><Box sx={{ color: level === item.id ? 'primary.main' : 'text.secondary', mt: 0.25 }}>{item.icon}</Box><Box><Typography fontWeight={700}>{item.title}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.4 }}>{item.description}</Typography><Typography variant="caption" color="primary.main" fontWeight={700}>Usage : {item.usage}</Typography></Box></Stack>
                </CardActionArea>
              </Card>
            ))}

            {level === 'graphic' ? (
              <Box sx={{ pt: 1 }}>
                <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase' }}>Zone de signature</Typography>
                <Tabs value={captureMode} onChange={(_, value: number) => setCaptureMode(value)} variant="fullWidth" sx={{ mt: 0.5 }}><Tab label="Dessiner" /><Tab label="Taper mon nom" /><Tab label="Importer" /></Tabs>
                {captureMode === 0 ? <Box sx={{ position: 'relative', mt: 1.5, border: '1px dashed', borderColor: 'primary.light', borderRadius: 1, bgcolor: '#FCFDFE' }}><canvas ref={canvasRef} width={720} height={220} aria-label="Zone pour dessiner la signature" onPointerDown={startDrawing} onPointerMove={draw} onPointerUp={() => { drawing.current = false }} onPointerCancel={() => { drawing.current = false }} style={{ display: 'block', width: '100%', height: 170, touchAction: 'none', cursor: 'crosshair' }} /><Button size="small" startIcon={<Autorenew />} onClick={clearCanvas} sx={{ position: 'absolute', top: 6, right: 6 }}>Effacer</Button><Typography variant="caption" color="text.disabled" sx={{ position: 'absolute', left: 16, bottom: 10, pointerEvents: 'none' }}>Signez dans cette zone</Typography></Box> : null}
                {captureMode === 1 ? <Box sx={{ mt: 1.5 }}><TextField fullWidth label="Nom affiché" value={typedName} onChange={(event) => setTypedName(event.target.value)} /><Box sx={{ mt: 1, minHeight: 110, display: 'grid', placeItems: 'center', border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}><Typography sx={{ fontFamily: '"Brush Script MT", cursive', fontSize: 42, color: 'primary.dark' }}>{typedName}</Typography></Box></Box> : null}
                {captureMode === 2 ? <Box sx={{ mt: 1.5 }}><Button component="label" fullWidth variant="outlined" startIcon={<CloudUploadOutlined />}>Importer une image PNG<input hidden type="file" accept="image/png,image/jpeg" onChange={(event) => { const file = event.target.files?.[0]; setUploadedName(file?.name ?? ''); if (file) { const reader = new FileReader(); reader.onload = () => setUploadedData(String(reader.result ?? '')); reader.readAsDataURL(file) } }} /></Button>{uploadedName ? <Alert severity="success" sx={{ mt: 1 }}>Image chargée : {uploadedName}</Alert> : null}</Box> : null}
              </Box>
            ) : null}

            {level === 'digital' ? <Box sx={{ pt: 1 }}><Alert severity={certificateState === 'valid' ? 'success' : 'error'} icon={<BadgeOutlined />} sx={{ mb: 1.5 }}>{certificateState === 'valid' ? 'Un certificat valide est disponible pour votre compte.' : certificateState === 'expired' ? 'Le certificat sélectionné a expiré. Renouvelez-le avant de signer.' : 'Aucun certificat de signature n’est associé à votre compte.'}</Alert><TextField select fullWidth label="Certificat de signature" value={certificateState} onChange={(event) => setCertificateState(event.target.value as 'valid' | 'missing' | 'expired')}><MenuItem value="valid">Kader Yao — ORGATECH-CA · expire le 04/02/2027</MenuItem><MenuItem value="expired">Certificat ORGATECH-CA · expiré</MenuItem><MenuItem value="missing">Aucun certificat disponible</MenuItem></TextField><Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>Une authentification renforcée sera demandée par le prestataire au moment de signer.</Typography></Box> : null}

            {level === 'electronic-validation' ? <Alert severity="info" sx={{ mt: 1 }}>Aucune signature visuelle ne sera ajoutée. Votre identité, l’action et l’empreinte du document constitueront la preuve auditable.</Alert> : null}

            <FormControlLabel sx={{ alignItems: 'flex-start', mt: 1 }} control={<Checkbox checked={consent} onChange={(event) => setConsent(event.target.checked)} />} label={<Typography variant="body2" sx={{ mt: 0.7 }}>Je confirme avoir vérifié le document et certifie être l’auteur de cette action de signature.</Typography>} />
            <Divider />
            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase' }}>Métadonnées enregistrées</Typography>
            <Box><MetadataRow label="Document" value={`${correspondence.reference} — v${documentVersion?.version ?? 3}`} mono /><MetadataRow label="Utilisateur" value="Identité OIDC courante" /><MetadataRow label="Type" value={signatureLevels.find((item) => item.id === level)!.title} /><MetadataRow label="Date et heure" value="Horodatage automatique" /><MetadataRow label="Empreinte" value={documentVersion ? `sha256:${documentVersion.sha256}` : 'Indisponible'} mono /><MetadataRow label="Adresse IP" value="Enregistrée côté serveur" mono /></Box>
          </Stack>
        </Card>

        <Stack spacing={2.5}>
          <Card>
            <Box sx={{ p: 2.5 }}><Stack direction="row" justifyContent="space-between" spacing={1}><Typography component="h2" variant="h2">Aperçu du rendu final</Typography><Chip label={`Document · v${documentVersion?.version ?? 3}`} size="small" variant="outlined" /></Stack></Box><Divider />
            <Box sx={{ p: { xs: 2, sm: 3 }, bgcolor: '#E9EDF4' }}>
              <Box sx={{ maxWidth: 650, mx: 'auto', minHeight: 660, bgcolor: 'white', boxShadow: '0 8px 28px rgba(15,23,42,.12)', p: { xs: 3, sm: 5 } }}>
                <Stack direction="row" justifyContent="space-between"><Box><Typography variant="caption" fontWeight={700} color="primary">ORGATECH · {correspondence.direction}</Typography><Typography variant="h3" sx={{ mt: 1 }}>{correspondence.subject}</Typography></Box><Typography variant="caption" color="text.secondary">13 août 2026</Typography></Stack>
                <Divider sx={{ my: 3 }} />
                <Typography variant="body2" sx={{ lineHeight: 1.8 }}>{internal ? 'Cette note interne formalise les instructions validées par la direction et précise les modalités d’application pour les services concernés.' : 'Nous accusons réception du document transmis. Son contenu a été contrôlé et validé par le service compétent conformément à la procédure en vigueur.'}</Typography>
                <Typography variant="body2" sx={{ mt: 2, lineHeight: 1.8 }}>Le présent document est soumis au circuit de validation et de signature NUMA avant son enregistrement définitif.</Typography>
                <Box sx={{ mt: 9, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, p: 2 }}>
                  <Typography variant="caption" fontWeight={700} color="text.secondary">DOCUMENT SIGNÉ ÉLECTRONIQUEMENT</Typography>
                  <Stack spacing={2} sx={{ mt: 2 }}>
                    <Stack direction="row" justifyContent="space-between" spacing={2}><Box><Typography sx={{ fontFamily: '"Brush Script MT", cursive', fontSize: 30, color: 'primary.dark' }}>Awa Kouassi</Typography><Typography variant="body2" fontWeight={700}>Awa Kouassi</Typography><Typography variant="caption" color="text.secondary">Directrice Technique · Signature graphique</Typography><Typography variant="caption" display="block" color="text.secondary">13/08/2026 · 10:42 — sha256:8f2a…c19d</Typography></Box><Chip icon={<VerifiedOutlined />} label="Vérifiée" color="success" variant="outlined" size="small" /></Stack>
                    <Divider />
                    <Stack direction="row" justifyContent="space-between" spacing={2}><Box><Typography sx={{ fontFamily: '"Brush Script MT", cursive', fontSize: 30, color: 'primary.main' }}>{captureMode === 1 ? typedName : 'K. Yao'}</Typography><Typography variant="body2" fontWeight={700}>Kader Yao</Typography><Typography variant="caption" color="text.secondary">Configurateur · {signatureLevels.find((item) => item.id === level)!.title}</Typography><Typography variant="caption" display="block" color="text.secondary">Horodatage automatique à la confirmation</Typography></Box><Chip icon={level === 'digital' ? <Fingerprint /> : <VerifiedOutlined />} label={level === 'digital' ? 'Certifiée' : 'À confirmer'} color={level === 'digital' ? 'secondary' : 'default'} variant="outlined" size="small" /></Stack>
                  </Stack>
                </Box>
              </Box>
            </Box>
          </Card>
          <Alert severity="warning">La signature graphique constitue une preuve interne auditable. La signature numérique qualifiée reste désactivée tant qu’aucun prestataire n’est configuré.</Alert>
        </Stack>
      </Box>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Confirmer la signature</DialogTitle><DialogContent><Alert severity="warning" sx={{ mb: 2 }}>Cette action est définitive pour la version {documentVersion?.version ?? 3} et sera inscrite au journal d’audit.</Alert><Typography variant="body2">Confirmez-vous la signature de l’empreinte <Box component="span" sx={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700 }}>{documentVersion ? `sha256:${documentVersion.sha256}` : 'indisponible'}</Box> avec le niveau « {signatureLevels.find((item) => item.id === level)!.title} » ?</Typography></DialogContent><DialogActions><Button onClick={() => setConfirmOpen(false)}>Annuler</Button><Button variant="contained" startIcon={<VerifiedOutlined />} onClick={() => void confirmSignature()}>Confirmer et signer</Button></DialogActions>
      </Dialog>
    </Box>
  )
}
