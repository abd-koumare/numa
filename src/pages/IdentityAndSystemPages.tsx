import { useState } from 'react'
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline'
import CloudOffOutlined from '@mui/icons-material/CloudOffOutlined'
import ErrorOutline from '@mui/icons-material/ErrorOutline'
import Fingerprint from '@mui/icons-material/Fingerprint'
import HourglassEmpty from '@mui/icons-material/HourglassEmpty'
import InboxOutlined from '@mui/icons-material/InboxOutlined'
import LockOutlined from '@mui/icons-material/LockOutlined'
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  Checkbox,
  CircularProgress,
  Divider,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { BrandLogo } from '../components/BrandLogo'
import { useSiteSettings } from '../app/SiteSettingsContext'
import { AppFooter } from '../components/AppFooter'

type IdentityMode = 'login' | 'mfa' | 'denied' | 'expired'

export function IdentityPage({ mode }: { mode: IdentityMode }) {
  const { branding } = useSiteSettings()
  const content = {
    login: { icon: <Fingerprint />, title: `Connexion à ${branding.applicationName}`, text: `Utilisez votre compte professionnel ${branding.organizationName}. Aucun mot de passe distinct n’est stocké par ${branding.applicationName}.` },
    mfa: { icon: <LockOutlined />, title: 'Vérification renforcée', text: 'Saisissez le code à six chiffres de votre application d’authentification.' },
    denied: { icon: <ErrorOutline />, title: 'Accès non autorisé', text: `Votre identité est reconnue, mais aucun rôle ${branding.applicationName} ne vous permet d’accéder à cette ressource.` },
    expired: { icon: <HourglassEmpty />, title: 'Session expirée', text: 'Votre session a expiré pour protéger vos informations. Reconnectez-vous pour continuer.' },
  }[mode]
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'primary.dark', backgroundImage: 'radial-gradient(circle at 80% 20%, rgba(32,196,199,.18), transparent 35%)' }}>
      <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', p: 2 }}>
        <Card sx={{ width: '100%', maxWidth: 480, p: { xs: 3, sm: 4 } }}>
          <BrandLogo sx={{ width: 130, height: 64, mb: 4 }} />
          <Avatar sx={{ bgcolor: mode === 'denied' ? 'error.light' : 'primary.main', color: mode === 'denied' ? 'error.dark' : 'white', mb: 2 }}>{content.icon}</Avatar>
          <Typography component="h1" variant="h1">{content.title}</Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>{content.text}</Typography>
          {mode === 'login' ? <Button component={RouterLink} to="/" fullWidth variant="contained" size="large" startIcon={<Fingerprint />} sx={{ mt: 3 }}>Se connecter avec {branding.organizationName}</Button> : null}
          {mode === 'mfa' ? <Box sx={{ mt: 3 }}><TextField fullWidth autoFocus label="Code de vérification" inputProps={{ inputMode: 'numeric', maxLength: 6 }} /><FormControlLabel control={<Checkbox />} label="Mémoriser cet appareil pendant 8 heures" /><Button component={RouterLink} to="/" fullWidth variant="contained" sx={{ mt: 1 }}>Vérifier</Button></Box> : null}
          {mode === 'denied' ? <Stack spacing={1} sx={{ mt: 3 }}><Button variant="contained">Demander un accès</Button><Button component={RouterLink} to="/connexion">Changer de compte</Button></Stack> : null}
          {mode === 'expired' ? <Button component={RouterLink} to="/connexion" fullWidth variant="contained" sx={{ mt: 3 }}>Se reconnecter</Button> : null}
          <Divider sx={{ my: 3 }} />
          <Typography variant="caption" color="text.secondary">Besoin d’aide ? Contactez le support DSI · Référence de session NUMA-2026-0815</Typography>
        </Card>
      </Box>
      <AppFooter variant="inverse" />
    </Box>
  )
}

export function ProfilePage() {
  return <Box sx={{ maxWidth: 900, mx: 'auto', px: { xs: 2, sm: 3 }, py: { xs: 3, md: 4 } }}><Typography component="h1" variant="h1">Mon profil et préférences</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2.5 }}>Votre identité provient de l’annuaire ORGATECH. Seules les préférences NUMA sont modifiables ici.</Typography><Card><Box sx={{ p: 2.5 }}><Stack direction="row" spacing={2} alignItems="center"><Avatar sx={{ width: 64, height: 64, bgcolor: 'primary.dark' }}>KY</Avatar><Box><Typography component="h2" variant="h2">Kader Yao</Typography><Typography variant="body2" color="text.secondary">kader.yao@orgatech.ci · Configurateur · DSI</Typography></Box></Stack></Box><Divider /><Box sx={{ p: 2.5, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}><TextField label="Langue" select defaultValue="fr" SelectProps={{ native: true }}><option value="fr">Français</option><option value="en">English</option></TextField><TextField label="Fuseau horaire" value="UTC" slotProps={{ input: { readOnly: true } }} /><TextField label="Page d’accueil" select defaultValue="dashboard" SelectProps={{ native: true }}><option value="dashboard">Tableau de bord</option><option value="tasks">Mes tâches</option></TextField><TextField label="Densité des listes" select defaultValue="comfortable" SelectProps={{ native: true }}><option value="comfortable">Confortable</option><option value="compact">Compacte</option></TextField><FormControlLabel control={<Checkbox defaultChecked />} label="Recevoir les notifications dans l’application" /><FormControlLabel control={<Checkbox defaultChecked />} label="Recevoir les échéances par courriel" /></Box><Divider /><Stack direction="row" justifyContent="flex-end" sx={{ p: 2.5 }}><Button variant="contained">Enregistrer les préférences</Button></Stack></Card></Box>
}

const systemStates = [
  { title: 'Chargement', icon: <CircularProgress size={34} />, text: 'Chargement des courriers…', tone: 'info' },
  { title: 'État vide', icon: <InboxOutlined />, text: 'Aucun élément dans cette vue.', tone: 'info' },
  { title: 'Erreur récupérable', icon: <ErrorOutline />, text: 'Impossible de charger les données.', tone: 'error' },
  { title: 'Accès interdit', icon: <LockOutlined />, text: 'Vous n’avez pas la permission requise.', tone: 'warning' },
  { title: 'Hors ligne', icon: <CloudOffOutlined />, text: 'Connexion perdue. Les changements sont suspendus.', tone: 'warning' },
  { title: 'Succès', icon: <CheckCircleOutline />, text: 'L’opération a été enregistrée.', tone: 'success' },
]

export function SystemStatesPage() {
  const [confirming, setConfirming] = useState(false)
  return <Box sx={{ maxWidth: 1100, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}><Typography component="h1" variant="h1">États système transversaux</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2.5 }}>Référence des états communs appliqués aux écrans NUMA.</Typography><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 1.5 }}>{systemStates.map((state) => <Card key={state.title} sx={{ p: 2.5, textAlign: 'center' }}><Box sx={{ color: `${state.tone}.main`, minHeight: 42 }}>{state.icon}</Box><Typography component="h2" variant="h3" sx={{ mt: 1 }}>{state.title}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{state.text}</Typography><Button size="small" sx={{ mt: 1.5 }}>Action principale</Button></Card>)}</Box><Card sx={{ mt: 2, p: 2.5 }}><Typography component="h2" variant="h2">Confirmation destructive</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>Une action irréversible explique ses conséquences, exige une justification et reste auditée.</Typography>{confirming ? <Alert severity="error" sx={{ mt: 2 }} action={<Button color="inherit" onClick={() => setConfirming(false)}>Annuler</Button>}>Confirmez la suppression définitive en saisissant le nom de la ressource.</Alert> : <Button color="error" variant="outlined" sx={{ mt: 2 }} onClick={() => setConfirming(true)}>Afficher la confirmation</Button>}</Card></Box>
}
