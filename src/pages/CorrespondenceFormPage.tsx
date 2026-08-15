import { type FormEvent, useState } from 'react'
import ArrowBack from '@mui/icons-material/ArrowBack'
import AttachFileOutlined from '@mui/icons-material/AttachFileOutlined'
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline'
import CloudUploadOutlined from '@mui/icons-material/CloudUploadOutlined'
import SaveOutlined from '@mui/icons-material/SaveOutlined'
import SendOutlined from '@mui/icons-material/SendOutlined'
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Divider,
  FormControlLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Snackbar,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material'
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { correspondenceDirections } from '../data/correspondences'
import { formatCorrespondenceReference, useSiteSettings } from '../app/SiteSettingsContext'

const workflowLabels = ['Brouillon', 'Chef de service', 'Direction', 'Signature', 'Enregistrement']
const responsibleServices = [
  ['DSI', 'Direction des systèmes d’information'],
  ['RH', 'Ressources humaines'],
  ['FIN', 'Direction financière'],
  ['SG', 'Secrétariat général'],
]

export function CorrespondenceFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const editing = Boolean(id)
  const [searchParams] = useSearchParams()
  const [saved, setSaved] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [files, setFiles] = useState<string[]>(['demande-partenariat.pdf'])
  const [type, setType] = useState(searchParams.get('type') === 'interne' ? 'interne' : 'externe')
  const [serviceCode, setServiceCode] = useState('DSI')
  const { numbering } = useSiteSettings()
  const simulatedReference = formatCorrespondenceReference(numbering, serviceCode, { type: type.toLocaleUpperCase('fr'), direction: 'DT' })
  const registryPath = type === 'interne' ? '/courriers/internes' : '/courriers/externes'
  const returnPath = editing ? `${registryPath}/${id}` : registryPath

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitted(true)
  }

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ maxWidth: 1240, mx: 'auto', px: { xs: 2, sm: 3, lg: 4 }, py: { xs: 3, md: 4 } }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'flex-start' }} spacing={2.5} sx={{ mb: 3 }}>
        <Box>
          <Button component={RouterLink} to={returnPath} startIcon={<ArrowBack />} sx={{ px: 0, mb: 1 }}>
            Retour au registre
          </Button>
          <Stack direction="row" alignItems="center" spacing={1.25} flexWrap="wrap">
            <Typography component="h1" variant="h1">{editing ? 'Modifier le courrier' : 'Nouveau courrier'}</Typography>
            <Chip label={editing ? 'Version en modification' : 'Brouillon non enregistré'} size="small" variant="outlined" />
          </Stack>
          <Typography color="text.secondary" variant="body2" sx={{ mt: 0.75 }}>
            {editing ? `Référence ${id} · toute modification documentaire créera une nouvelle version.` : 'Les champs marqués d’un astérisque sont obligatoires. Le numéro sera généré à la soumission.'}
          </Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ '& .MuiButton-root': { width: { xs: '100%', sm: 'auto' } } }}>
          <Button component={RouterLink} to={returnPath} variant="outlined">Annuler</Button>
          <Button variant="outlined" startIcon={<SaveOutlined />} onClick={() => setSaved(true)}>Enregistrer le brouillon</Button>
          <Button type="submit" variant="contained" startIcon={<SendOutlined />}>{editing ? 'Enregistrer les modifications' : 'Soumettre'}</Button>
        </Stack>
      </Stack>

      <Alert severity="info" sx={{ mb: 2.5 }}>
        Le workflow proposé dépend du type de courrier, de la direction et du niveau de confidentialité. Il reste visible avant soumission.
      </Alert>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 2fr) 340px' }, gap: 2.5, alignItems: 'start' }}>
        <Stack spacing={2.5}>
          <Card>
            <Box sx={{ p: 2.5 }}>
              <Typography component="h2" variant="h2">Identification</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Nature, provenance et classement du courrier.</Typography>
            </Box>
            <Divider />
            <Box sx={{ p: 2.5 }}>
              <Typography component="label" variant="body2" fontWeight={700}>Type de courrier *</Typography>
              <RadioGroup row value={type} onChange={(event) => setType(event.target.value)} sx={{ mb: 2 }}>
                <FormControlLabel value="externe" control={<Radio />} label="Courrier externe" />
                <FormControlLabel value="interne" control={<Radio />} label="Courrier interne" />
              </RadioGroup>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
                <TextField required label={type === 'externe' ? 'Expéditeur' : 'Service émetteur'} defaultValue={type === 'externe' ? 'Société KORHOGO BTP' : ''} />
                <TextField label="Référence d’origine" placeholder="Ex. KBT/DG/2026-118" />
                <TextField required label="Date de réception" type="date" defaultValue="2026-08-13" slotProps={{ inputLabel: { shrink: true } }} />
                <TextField label="Canal de réception" select defaultValue="email">
                  <MenuItem value="email">Courriel</MenuItem><MenuItem value="paper">Courrier papier</MenuItem><MenuItem value="portal">Portail</MenuItem><MenuItem value="hand">Remise en main propre</MenuItem>
                </TextField>
                <TextField required label="Objet" defaultValue="Demande de partenariat technique" sx={{ gridColumn: { sm: '1 / -1' } }} />
                <TextField required label="Direction destinataire" select defaultValue="DT">
                  {correspondenceDirections.map((direction) => <MenuItem key={direction} value={direction}>{direction}</MenuItem>)}
                </TextField>
                <TextField required label="Service responsable" select value={serviceCode} onChange={(event) => setServiceCode(event.target.value)}>
                  {responsibleServices.map(([code, label]) => <MenuItem key={code} value={code}>{code} — {label}</MenuItem>)}
                </TextField>
                <TextField required label="Priorité" select defaultValue="Haute">
                  {['Basse', 'Normale', 'Haute', 'Urgente'].map((priority) => <MenuItem key={priority} value={priority}>{priority}</MenuItem>)}
                </TextField>
                <TextField label="Confidentialité" select defaultValue="Standard">
                  {['Standard', 'Restreint', 'Confidentiel'].map((level) => <MenuItem key={level} value={level}>{level}</MenuItem>)}
                </TextField>
                <TextField label="Échéance de traitement" type="date" defaultValue="2026-08-20" slotProps={{ inputLabel: { shrink: true } }} />
                <TextField label="Résumé / instructions" multiline minRows={4} defaultValue="Étudier la proposition et préparer un avis technique avant transmission à la Direction générale." sx={{ gridColumn: { sm: '1 / -1' } }} />
              </Box>
            </Box>
          </Card>

          <Card>
            <Box sx={{ p: 2.5 }}>
              <Typography component="h2" variant="h2">Documents</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>PDF, Word ou image · 25 Mo maximum par fichier.</Typography>
            </Box>
            <Divider />
            <Box sx={{ p: 2.5 }}>
              <Button component="label" variant="outlined" startIcon={<CloudUploadOutlined />} sx={{ width: { xs: '100%', sm: 'auto' } }}>
                Ajouter des fichiers
                <input hidden multiple type="file" onChange={(event) => setFiles((current) => [...current, ...Array.from(event.target.files ?? []).map((file) => file.name)])} />
              </Button>
              <Stack spacing={1} sx={{ mt: 2 }}>
                {files.map((file, index) => (
                  <Stack key={`${file}-${index}`} direction="row" alignItems="center" justifyContent="space-between" spacing={1.5} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
                    <Stack direction="row" alignItems="center" spacing={1}><AttachFileOutlined color="action" /><Box><Typography variant="body2" fontWeight={700}>{file}</Typography><Typography variant="caption" color="text.secondary">Version 1 · Analyse antivirus réussie</Typography></Box></Stack>
                    <Button color="error" size="small" onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}>Retirer</Button>
                  </Stack>
                ))}
              </Stack>
            </Box>
          </Card>
        </Stack>

        <Stack spacing={2.5} sx={{ position: { lg: 'sticky' }, top: { lg: 112 } }}>
          <Card>
            <Box sx={{ p: 2.5 }}>
              <Typography component="h2" variant="h3">Numérotation</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Référence simulée, attribuée définitivement à la soumission.</Typography>
              <Typography data-testid="creation-numbering-preview" sx={{ mt: 1.5, fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, color: 'primary.main', overflowWrap: 'anywhere' }}>{simulatedReference}</Typography>
              <Chip label={`Compteur ${serviceCode} partagé`} size="small" variant="outlined" sx={{ mt: 1.25 }} />
            </Box>
          </Card>
          <Card>
            <Box sx={{ p: 2.5 }}>
              <Typography component="h2" variant="h3">Workflow proposé</Typography>
              <Stepper activeStep={0} orientation="vertical" sx={{ mt: 2 }}>
                {workflowLabels.map((label, index) => <Step key={label} completed={false}><StepLabel optional={index === 3 ? <Typography variant="caption">Selon habilitation</Typography> : undefined}>{label}</StepLabel></Step>)}
              </Stepper>
            </Box>
          </Card>
          <Card>
            <Box sx={{ p: 2.5 }}>
              <Typography component="h2" variant="h3">Avant la soumission</Typography>
              <Stack spacing={1.25} sx={{ mt: 1.5 }}>
                {['Les champs obligatoires sont renseignés', 'Au moins un document est joint', 'Le destinataire et le workflow sont confirmés'].map((label, index) => (
                  <Stack key={label} direction="row" spacing={1} alignItems="flex-start"><CheckCircleOutline color={index < 2 ? 'success' : 'disabled'} fontSize="small" /><Typography variant="body2">{label}</Typography></Stack>
                ))}
              </Stack>
            </Box>
          </Card>
        </Stack>
      </Box>

      <Snackbar open={saved} autoHideDuration={3500} onClose={() => setSaved(false)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity="success" variant="filled" onClose={() => setSaved(false)}>Brouillon enregistré à 15:42</Alert>
      </Snackbar>
      <Snackbar open={submitted} onClose={() => setSubmitted(false)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity="success" variant="filled" action={<Button color="inherit" onClick={() => navigate(editing ? returnPath : '/courriers/externes/ext-0042-2026')}>Ouvrir la fiche</Button>}>
          <Box><span>{editing ? 'Modifications enregistrées' : 'Courrier soumis au Chef de service'}</span><Typography variant="caption" display="block" color="inherit">{editing ? 'Une nouvelle trace a été ajoutée à l’historique.' : `Référence attribuée : ${simulatedReference}`}</Typography></Box>
        </Alert>
      </Snackbar>
    </Box>
  )
}
