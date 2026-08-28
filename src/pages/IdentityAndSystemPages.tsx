import { type FormEvent, useEffect, useState } from 'react'
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline'
import CloudOffOutlined from '@mui/icons-material/CloudOffOutlined'
import ErrorOutline from '@mui/icons-material/ErrorOutline'
import Fingerprint from '@mui/icons-material/Fingerprint'
import HourglassEmpty from '@mui/icons-material/HourglassEmpty'
import InboxOutlined from '@mui/icons-material/InboxOutlined'
import LockOutlined from '@mui/icons-material/LockOutlined'
import Add from '@mui/icons-material/Add'
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useLocation, useNavigate } from 'react-router-dom'
import { BrandLogo } from '../components/BrandLogo'
import { useSiteSettings } from '../app/SiteSettingsContext'
import { AppFooter } from '../components/AppFooter'
import { DEMO_MFA_CODE, sanitizeReturnTo, useAuth } from '../app/AuthContext'
import { API_DATA_ENABLED, apiFetch } from '../api/client'
import { applyIdentityProvider, getUserPreferences, saveIdentityProvider, saveUserPreferences, testIdentityProvider, type IdentityProviderConfiguration, type UserPreference, useIdentityProviders } from '../api/operations'

type IdentityMode = 'login' | 'mfa' | 'denied' | 'expired'

export function IdentityPage({ mode }: { mode: IdentityMode }) {
  const { branding } = useSiteSettings()
  const { login, logout, verifyMfa, mode: authMode } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [rememberDevice, setRememberDevice] = useState(false)
  const [verificationError, setVerificationError] = useState('')
  const [accessRequested, setAccessRequested] = useState(false)
  const returnTo = sanitizeReturnTo(new URLSearchParams(location.search).get('returnTo'))
  const content = {
    login: { icon: <Fingerprint />, title: `Connexion à ${branding.applicationName}`, text: `Utilisez votre compte professionnel ${branding.organizationName}. Aucun mot de passe distinct n’est stocké par ${branding.applicationName}.` },
    mfa: { icon: <LockOutlined />, title: 'Vérification renforcée', text: 'Saisissez le code à six chiffres de votre application d’authentification.' },
    denied: { icon: <ErrorOutline />, title: 'Accès non autorisé', text: `Votre identité est reconnue, mais aucun rôle ${branding.applicationName} ne vous permet d’accéder à cette ressource.` },
    expired: { icon: <HourglassEmpty />, title: 'Session expirée', text: 'Votre session a expiré pour protéger vos informations. Reconnectez-vous pour continuer.' },
  }[mode]

  const beginLogin = () => {
    login()
    if (authMode === 'demo') navigate(`/mfa?returnTo=${encodeURIComponent(returnTo)}`)
  }

  const submitMfa = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!verifyMfa(code)) {
      setVerificationError('Code incorrect. Utilisez le code de démonstration indiqué ci-dessous.')
      return
    }
    navigate(returnTo, { replace: true })
  }

  const reconnect = () => {
    logout()
    navigate(`/connexion?returnTo=${encodeURIComponent(returnTo)}`, { replace: true })
  }

  const changeAccount = () => {
    logout()
    navigate('/connexion', { replace: true })
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'primary.dark', backgroundImage: 'radial-gradient(circle at 80% 20%, rgba(32,196,199,.18), transparent 35%)' }}>
      <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', p: 2 }}>
        <Card sx={{ width: '100%', maxWidth: 480, p: { xs: 3, sm: 4 } }}>
          <BrandLogo sx={{ width: 130, height: 64, mb: 4 }} />
          <Avatar sx={{ bgcolor: mode === 'denied' ? 'error.light' : 'primary.main', color: mode === 'denied' ? 'error.dark' : 'white', mb: 2 }}>{content.icon}</Avatar>
          <Typography component="h1" variant="h1">{content.title}</Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>{content.text}</Typography>
          {mode === 'login' ? (
            <Stack spacing={1.5} sx={{ mt: 3 }}>
              <Button fullWidth variant="contained" size="large" startIcon={<Fingerprint />} onClick={beginLogin}>Se connecter avec {branding.organizationName}</Button>
              <Typography variant="caption" color="text.secondary" textAlign="center">{authMode === 'oidc' ? 'Connexion sécurisée OIDC via Keycloak' : 'Connexion SSO simulée pour le prototype UI'}</Typography>
            </Stack>
          ) : null}
          {mode === 'mfa' ? (
            <Box component="form" onSubmit={submitMfa} sx={{ mt: 3 }} noValidate>
              {verificationError ? <Alert severity="error" sx={{ mb: 2 }}>{verificationError}</Alert> : null}
              <TextField
                fullWidth
                autoFocus
                label="Code de vérification"
                value={code}
                error={Boolean(verificationError)}
                helperText={`Code de démonstration : ${DEMO_MFA_CODE}`}
                onChange={(event) => {
                  setCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                  setVerificationError('')
                }}
                slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 6, autoComplete: 'one-time-code' } }}
              />
              <FormControlLabel control={<Checkbox checked={rememberDevice} onChange={(event) => setRememberDevice(event.target.checked)} />} label="Mémoriser cet appareil pendant 8 heures" />
              <Button type="submit" fullWidth variant="contained" disabled={code.length !== 6} sx={{ mt: 1 }}>Vérifier</Button>
            </Box>
          ) : null}
          {mode === 'denied' ? (
            <Stack spacing={1} sx={{ mt: 3 }}>
              {accessRequested ? <Alert severity="success">Votre demande d’accès a été transmise à un administrateur.</Alert> : null}
              <Button variant="contained" disabled={accessRequested} onClick={() => setAccessRequested(true)}>Demander un accès</Button>
              <Button onClick={changeAccount}>Changer de compte</Button>
            </Stack>
          ) : null}
          {mode === 'expired' ? <Button fullWidth variant="contained" sx={{ mt: 3 }} onClick={reconnect}>Se reconnecter</Button> : null}
          <Divider sx={{ my: 3 }} />
          <Typography variant="caption" color="text.secondary">Besoin d’aide ? Contactez le support DSI · Référence de session NUMA-2026-0815</Typography>
        </Card>
      </Box>
      <AppFooter variant="inverse" />
    </Box>
  )
}

export function ProfilePage() {
  const { session } = useAuth()
  const [identity, setIdentity] = useState({ email: 'kader.yao@orgatech.ci', title: session?.user.roleLabel ?? 'Configurateur', unit: session?.user.organization ?? 'DSI' })
  const [preferences, setPreferences] = useState<UserPreference>({ locale: 'fr-FR', timezone: 'UTC', default_home: 'dashboard', theme: 'system', page_size: 25, compact_mode: false, web_notifications: true, email_notifications: true, settings: {}, row_version: 1, updated_at: '' })
  const [loading, setLoading] = useState(API_DATA_ENABLED)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!API_DATA_ENABLED) return
    let active = true
    Promise.all([
      apiFetch<{ email: string; title: string; organization_unit: { name: string } | null }>('/me/'),
      getUserPreferences(),
    ]).then(([profile, result]) => {
      if (!active) return
      setIdentity({ email: profile.email, title: profile.title || session?.user.roleLabel || '', unit: profile.organization_unit?.name ?? '' })
      setPreferences(result.data)
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Chargement du profil impossible.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [session?.user.roleLabel])

  const save = async () => {
    if (!API_DATA_ENABLED) { setSaved(true); return }
    setSaving(true); setError('')
    try {
      const result = await saveUserPreferences(preferences, preferences)
      setPreferences(result.data); setSaved(true)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.') }
    finally { setSaving(false) }
  }
  const update = <K extends keyof UserPreference,>(key: K, value: UserPreference[K]) => setPreferences((current) => ({ ...current, [key]: value }))
  const name = session?.user.name ?? 'Utilisateur NUMA'
  const initials = session?.user.initials ?? name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()

  return <Box sx={{ maxWidth: 900, mx: 'auto', px: { xs: 2, sm: 3 }, py: { xs: 3, md: 4 } }}><Typography component="h1" variant="h1">Mon profil et préférences</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2.5 }}>Votre identité provient de l’annuaire. Seules les préférences NUMA sont modifiables ici.</Typography>{error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}<Card>{loading ? <Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress /></Box> : <><Box sx={{ p: 2.5 }}><Stack direction="row" spacing={2} alignItems="center"><Avatar sx={{ width: 64, height: 64, bgcolor: 'primary.dark' }}>{initials}</Avatar><Box><Typography component="h2" variant="h2">{name}</Typography><Typography variant="body2" color="text.secondary">{identity.email} · {identity.title} · {identity.unit}</Typography></Box></Stack></Box><Divider /><Box sx={{ p: 2.5, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}><TextField label="Langue" select value={preferences.locale} onChange={(event) => update('locale', event.target.value)}><MenuItem value="fr-FR">Français</MenuItem><MenuItem value="en-US">English</MenuItem></TextField><TextField label="Fuseau horaire" select value={preferences.timezone} onChange={(event) => update('timezone', event.target.value)}><MenuItem value="UTC">UTC</MenuItem><MenuItem value="Africa/Abidjan">Africa/Abidjan</MenuItem><MenuItem value="Europe/Paris">Europe/Paris</MenuItem></TextField><TextField label="Page d’accueil" select value={preferences.default_home} onChange={(event) => update('default_home', event.target.value as UserPreference['default_home'])}><MenuItem value="dashboard">Tableau de bord</MenuItem><MenuItem value="tasks">Mes tâches</MenuItem><MenuItem value="correspondence">Courriers</MenuItem></TextField><TextField label="Éléments par page" select value={preferences.page_size} onChange={(event) => update('page_size', Number(event.target.value) as UserPreference['page_size'])}>{[10, 25, 50, 100].map((size) => <MenuItem key={size} value={size}>{size}</MenuItem>)}</TextField><FormControlLabel control={<Checkbox checked={preferences.compact_mode} onChange={(event) => update('compact_mode', event.target.checked)} />} label="Afficher les listes en mode compact" /><FormControlLabel control={<Checkbox checked={preferences.web_notifications} onChange={(event) => update('web_notifications', event.target.checked)} />} label="Recevoir les notifications dans l’application" /><FormControlLabel control={<Checkbox checked={preferences.email_notifications} onChange={(event) => update('email_notifications', event.target.checked)} />} label="Recevoir les échéances par courriel" /></Box><Divider /><Stack direction="row" justifyContent="flex-end" sx={{ p: 2.5 }}><Button variant="contained" disabled={saving} onClick={() => void save()}>{saving ? 'Enregistrement…' : 'Enregistrer les préférences'}</Button></Stack></>}</Card><Snackbar open={saved} autoHideDuration={3000} onClose={() => setSaved(false)}><Alert severity="success" variant="filled">Préférences enregistrées</Alert></Snackbar></Box>
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

const emptyProvider = { alias: '', display_name: '', provider: 'oidc' as IdentityProviderConfiguration['provider'], enabled: false, config: {} as Record<string, unknown> }

export function IdentityProvidersPage() {
  const { data, loading, error, reload } = useIdentityProviders()
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | undefined>()
  const [form, setForm] = useState(emptyProvider)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const config = form.config
  const setConfig = (key: string, value: unknown) => setForm((current) => ({ ...current, config: { ...current.config, [key]: value } }))
  const edit = (provider?: IdentityProviderConfiguration) => {
    setEditingId(provider?.id)
    setForm(provider ? { alias: provider.alias, display_name: provider.display_name, provider: provider.provider, enabled: provider.enabled, config: provider.config } : emptyProvider)
    setOpen(true); setActionError('')
  }
  const save = async () => {
    setBusy('save'); setActionError('')
    try {
      await saveIdentityProvider(form, editingId)
      setOpen(false); setMessage('Configuration chiffrée enregistrée. Testez-la puis appliquez-la à Keycloak.'); reload()
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Enregistrement impossible.') }
    finally { setBusy('') }
  }
  const runAction = async (provider: IdentityProviderConfiguration, action: 'test' | 'apply') => {
    setBusy(`${action}:${provider.id}`); setActionError('')
    try {
      if (action === 'test') await testIdentityProvider(provider.id); else await applyIdentityProvider(provider.id)
      setMessage(action === 'test' ? 'Connexion vérifiée.' : 'Configuration appliquée à Keycloak.'); reload()
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : 'L’opération a échoué.') }
    finally { setBusy('') }
  }
  return <Box sx={{ maxWidth: 1100, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 2.5 }}><Box><Typography component="h1" variant="h1">Fournisseurs d’identité</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Assistant OIDC, SAML, LDAP et Active Directory pilotant Keycloak sans exposer les secrets.</Typography></Box><Button variant="contained" startIcon={<Add />} onClick={() => edit()}>Ajouter</Button></Stack>
    {error || actionError ? <Alert severity="error" sx={{ mb: 2 }}>{actionError || error}</Alert> : null}
    <Alert severity="info" sx={{ mb: 2 }}>Ordre recommandé : enregistrer, tester la connexion, puis activer et appliquer. Les identifiants sensibles sont chiffrés par NUMA.</Alert>
    {loading ? <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress /></Box> : <Stack spacing={1.5}>{data.results.map((provider) => <Card key={provider.id} sx={{ p: 2.5 }}><Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}><Box><Stack direction="row" spacing={1} alignItems="center"><Typography component="h2" variant="h3">{provider.display_name}</Typography><Chip label={provider.provider.toUpperCase()} size="small" variant="outlined" /><Chip label={provider.status === 'ready' ? 'Opérationnel' : provider.status === 'error' ? 'Erreur' : 'Non testé'} size="small" color={provider.status === 'ready' ? 'success' : provider.status === 'error' ? 'error' : 'default'} /></Stack><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Alias Keycloak : {provider.alias} · {provider.enabled ? 'activé' : 'désactivé'}</Typography>{provider.last_error ? <Typography variant="caption" color="error">{provider.last_error}</Typography> : null}</Box><Stack direction="row" spacing={1} alignItems="center"><Button onClick={() => edit(provider)}>Modifier</Button><Button variant="outlined" disabled={Boolean(busy)} onClick={() => void runAction(provider, 'test')}>Tester</Button><Button variant="contained" disabled={Boolean(busy)} onClick={() => void runAction(provider, 'apply')}>Appliquer</Button></Stack></Stack></Card>)}{!data.results.length ? <Card sx={{ p: 5, textAlign: 'center' }}><Typography component="h2" variant="h2">Aucun fournisseur ajouté</Typography><Typography color="text.secondary">Keycloak reste le fournisseur local tant qu’aucun annuaire n’est configuré.</Typography></Card> : null}</Stack>}
    <Dialog open={open} onClose={() => !busy && setOpen(false)} fullWidth maxWidth="sm"><DialogTitle>{editingId ? 'Modifier le fournisseur' : 'Ajouter un fournisseur'}</DialogTitle><DialogContent><Stack spacing={2} sx={{ mt: 1 }}><TextField select label="Protocole" value={form.provider} onChange={(event) => setForm({ ...emptyProvider, provider: event.target.value as IdentityProviderConfiguration['provider'] })}><MenuItem value="oidc">OpenID Connect</MenuItem><MenuItem value="saml">SAML 2.0</MenuItem><MenuItem value="ldap">LDAP</MenuItem><MenuItem value="active_directory">Active Directory</MenuItem></TextField><TextField required label="Nom affiché" value={form.display_name} onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))} /><TextField required label="Alias technique" value={form.alias} onChange={(event) => setForm((current) => ({ ...current, alias: event.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-') }))} /><FormControlLabel control={<Checkbox checked={form.enabled} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))} />} label="Activer les connexions via ce fournisseur" />
      {form.provider === 'oidc' ? <><TextField required label="URL de l’issuer" value={String(config.issuer_url ?? '')} onChange={(event) => setConfig('issuer_url', event.target.value)} /><TextField required label="Client ID" value={String(config.client_id ?? '')} onChange={(event) => setConfig('client_id', event.target.value)} /><TextField type="password" label={config.has_client_secret ? 'Nouveau secret client (laisser vide pour conserver)' : 'Secret client'} value={String(config.client_secret ?? '')} onChange={(event) => setConfig('client_secret', event.target.value)} /><TextField label="Scopes" value={String(config.scopes ?? 'openid profile email')} onChange={(event) => setConfig('scopes', event.target.value)} /></> : null}
      {form.provider === 'saml' ? <TextField required label="URL des métadonnées SAML" value={String(config.metadata_url ?? '')} onChange={(event) => setConfig('metadata_url', event.target.value)} /> : null}
      {form.provider === 'ldap' || form.provider === 'active_directory' ? <><TextField required label="URL LDAP(S)" placeholder="ldaps://annuaire.exemple:636" value={String(config.connection_url ?? '')} onChange={(event) => setConfig('connection_url', event.target.value)} /><TextField required label="DN de connexion" value={String(config.bind_dn ?? '')} onChange={(event) => setConfig('bind_dn', event.target.value)} /><TextField type="password" required={!config.has_bind_credential} label={config.has_bind_credential ? 'Nouveau secret (laisser vide pour conserver)' : 'Secret de connexion'} value={String(config.bind_credential ?? '')} onChange={(event) => setConfig('bind_credential', event.target.value)} /><TextField required label="Base des utilisateurs" value={String(config.users_dn ?? '')} onChange={(event) => setConfig('users_dn', event.target.value)} /><TextField label="Filtre utilisateurs" value={String(config.user_filter ?? '')} onChange={(event) => setConfig('user_filter', event.target.value)} /></> : null}
    </Stack></DialogContent><DialogActions><Button onClick={() => setOpen(false)}>Annuler</Button><Button variant="contained" disabled={busy === 'save' || !form.alias || !form.display_name} onClick={() => void save()}>{busy === 'save' ? 'Enregistrement…' : 'Enregistrer'}</Button></DialogActions></Dialog>
    <Snackbar open={Boolean(message)} autoHideDuration={4000} onClose={() => setMessage('')}><Alert severity="success" variant="filled">{message}</Alert></Snackbar>
  </Box>
}
