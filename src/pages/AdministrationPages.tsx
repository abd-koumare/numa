import { ListBindingsEditor } from '../components/ListBindingsEditor'
import { defaultBindings } from '../app/configurationEditing'
export { PageBuilderPage, WorkflowBuilderPage } from './PageWorkflowBuilders'
import { useEffect, useState } from 'react'
import Add from '@mui/icons-material/Add'
import BackupOutlined from '@mui/icons-material/BackupOutlined'
import CheckCircle from '@mui/icons-material/CheckCircle'
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined'
import DragIndicator from '@mui/icons-material/DragIndicator'
import EditOutlined from '@mui/icons-material/EditOutlined'
import History from '@mui/icons-material/History'
import PlayArrow from '@mui/icons-material/PlayArrow'
import PublishOutlined from '@mui/icons-material/PublishOutlined'
import RestoreOutlined from '@mui/icons-material/RestoreOutlined'
import Search from '@mui/icons-material/Search'
import SettingsOutlined from '@mui/icons-material/SettingsOutlined'
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  InputAdornment,
  LinearProgress,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import { Link as RouterLink, useParams } from 'react-router-dom'
import { NumberingBuilderPanel } from '../components/NumberingBuilderPanel'
import { usePrototypeData } from '../app/PrototypeDataContext'
import { API_DATA_ENABLED } from '../api/client'
import { createConfigurationDraft, publishConfiguration, resolveConfiguration, type ConfigurationDefinition } from '../api/configurations'

const adminModules = [
  ['/administration/site', 'Identité visuelle', 'Logo de l’entreprise et identité affichée'],
  ['/administration/utilisateurs', 'Utilisateurs et accès', 'Annuaire, groupes, rôles et permissions fines'],
  ['/administration/navigation', 'Navigation', 'Menus, ordre et visibilité par permission'],
  ['/administration/listes', 'Listes et formulaires', 'Champs, vues, numérotation, règles et permissions'],
  ['/administration/regles', 'Règles métier', 'Conditions, actions, tests et versions'],
  ['/administration/pages', 'Pages et navigation', 'Composition responsive et publication'],
  ['/administration/templates', 'Templates', 'Modèles métier versionnés et réutilisables'],
  ['/administration/workflows', 'Workflows', 'États, transitions, acteurs et automatisations'],
  ['/administration/audit', 'Audit', 'Événements métier et techniques traçables'],
  ['/administration/sauvegardes', 'Sauvegardes', 'Rétention et restauration sécurisée'],
  ['/administration/exploitation', 'Exploitation', 'Services, stockage, alertes et intégrations'],
  ['/administration/parametres', 'Paramètres système', 'Sécurité, fichiers, notifications et langue'],
]

export function AdministrationOverviewPage() {
  return <Box sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 2, sm: 3, lg: 4 }, py: { xs: 3, md: 4 } }}><Typography component="h1" variant="h1">Administration</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 3 }}>Configurez NUMA sans modifier son cœur applicatif.</Typography><Alert severity="info" sx={{ mb: 2.5 }}>Vous travaillez avec le rôle Configurateur. Les opérations sensibles restent soumises aux permissions fines.</Alert><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 2 }}>{adminModules.map(([path, title, description]) => <Card key={path} sx={{ p: 2.5 }}><SettingsOutlined color="primary" /><Typography component="h2" variant="h2" sx={{ mt: 1.5 }}>{title}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>{description}</Typography><Button component={RouterLink} to={path} sx={{ mt: 1.5, px: 0 }}>Configurer</Button></Card>)}</Box></Box>
}

const listSections = ['Paramètres', 'Champs', 'Formulaire', 'Vues', 'Cycle annuel', 'Numérotation', 'Règles', 'Workflow', 'Permissions', 'Publication']

export function ListBuilderPage() {
  const { id = 'courriers-externes' } = useParams()
  const { lists } = usePrototypeData()
  const fallback = lists.find((item) => item.id === id) ?? lists[0]
  const [section, setSection] = useState('Champs')
  const [definition, setDefinition] = useState<ConfigurationDefinition | null>(null)
  const [name, setName] = useState(fallback?.name ?? '')
  const [description, setDescription] = useState(fallback?.description ?? '')
  const [active, setActive] = useState(true)
  const [data, setData] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(API_DATA_ENABLED)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    if (!API_DATA_ENABLED) { setLoading(false); return }
    let mounted = true
    resolveConfiguration('list', id).then((value) => {
      if (!mounted || !value) return
      setDefinition(value); setName(value.name); setDescription(value.description); setActive(value.active)
      setData((value.latest_version ?? value.current_version)?.data ?? {})
    }).catch((reason) => { if (mounted) setError(reason instanceof Error ? reason.message : 'Chargement impossible.') }).finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [id])
  const save = async (publish: boolean) => {
    if (!definition) return
    setSaving(true); setError(''); setMessage('')
    try {
      let updated = await createConfigurationDraft(definition, { name, description, active, data })
      setDefinition(updated)
      if (publish) updated = await publishConfiguration(updated)
      setDefinition(updated)
      setMessage(publish ? 'Liste publiée. Les nouvelles instances utilisent cette version ; les instances existantes conservent leur version de liste.' : 'Brouillon enregistré. Le contenu versionné attend sa publication ; les métadonnées sont enregistrées immédiatement.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.') }
    finally { setSaving(false) }
  }
  const bindings = { ...defaultBindings[definition?.slug ?? id], ...((data.bindings ?? {}) as Record<string, unknown>) }
  const columns = Array.isArray(data.columns) ? data.columns.map(String) : []
  const rules = Array.isArray(bindings.rules) ? bindings.rules.map(String) : []
  const version = definition?.latest_version
  return <Box sx={{ maxWidth: 1440, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}><Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'flex-start' }} spacing={2} sx={{ mb: 2.5 }}><Box><Typography component="h1" variant="h1">Configuration — {name || 'Liste'}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>Définition réelle · v{version?.version ?? '—'} · {version?.state === 'published' ? 'publiée' : 'brouillon'}</Typography></Box><Stack direction="row" spacing={1} flexWrap="wrap"><Button component={RouterLink} to={`/administration/listes/${id}/formulaire`} variant="outlined">Formulaire</Button><Button variant="outlined" disabled={!definition || saving} onClick={() => void save(false)}>Enregistrer le brouillon</Button><Button variant="contained" startIcon={<PublishOutlined />} disabled={!definition || saving} onClick={() => void save(true)}>{saving ? 'Enregistrement…' : 'Enregistrer et publier'}</Button></Stack></Stack>{loading ? <Typography sx={{ mb: 2 }}>Chargement…</Typography> : null}{error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}{message ? <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert> : null}{!API_DATA_ENABLED ? <Alert severity="info" sx={{ mb: 2 }}>Mode démonstration : aucune modification ne peut être publiée.</Alert> : null}<Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '230px minmax(0, 1fr)' }, gap: 2 }}><Card sx={{ alignSelf: 'start' }}><List disablePadding>{listSections.map((item) => <ListItemButton key={item} selected={section === item} onClick={() => setSection(item)}><ListItemText primary={item} primaryTypographyProps={{ fontSize: 13, fontWeight: section === item ? 700 : 500 }} /></ListItemButton>)}</List></Card><Card><Box sx={{ p: 2.5 }}><Typography component="h2" variant="h2">{section}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Valeurs enregistrées pour cette définition de liste.</Typography></Box><Divider />
  {section === 'Champs' ? <Box sx={{ p: 2.5 }}><Alert severity="info" sx={{ mb: 2 }}>Les colonnes de la liste sont ci-dessous. Les champs de saisie se configurent dans le formulaire associé.</Alert><Stack direction="row" gap={1} flexWrap="wrap">{columns.map((column) => <Chip key={column} label={column} variant="outlined" />)}</Stack></Box> : null}
  {section === 'Numérotation' ? <Box><Alert severity="info" sx={{ m: 2.5, mb: 0 }}>Moteur associé : {String(bindings.numbering ?? 'aucun')}</Alert><NumberingBuilderPanel /></Box> : null}
  {section === 'Workflow' ? <Box sx={{ p: 2.5 }}><Typography fontWeight={700}>Workflow associé : {String(bindings.workflow ?? 'aucun')}</Typography><Button component={RouterLink} to="/administration/workflows" variant="outlined" sx={{ mt: 2 }}>Consulter les workflows</Button></Box> : null}
  {section === 'Formulaire' ? <Box sx={{ p: 2.5 }}><Alert severity="info">Formulaire associé : {String(bindings.form ?? 'aucun')}</Alert><Button component={RouterLink} to={`/administration/listes/${id}/formulaire`} variant="contained" sx={{ mt: 2 }}>Ouvrir le Form Builder</Button></Box> : null}
  {section === 'Paramètres' ? <Stack spacing={1.5} sx={{ p: 2.5 }}><TextField label="Nom d'affichage" value={name} onChange={(event) => setName(event.target.value)} /><TextField label="Description" value={description} onChange={(event) => setDescription(event.target.value)} multiline minRows={2} /><ListBindingsEditor slug={definition?.slug ?? id} value={bindings} onChange={(value) => setData({ ...data, bindings: value })} /><TextField select label="Périodicité" value={String(data.periodicity ?? 'none')} onChange={(event) => setData((current) => ({ ...current, periodicity: event.target.value }))}><MenuItem value="yearly">Annuelle</MenuItem><MenuItem value="monthly">Mensuelle</MenuItem><MenuItem value="quarterly">Trimestrielle</MenuItem><MenuItem value="none">Aucune</MenuItem></TextField><Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography fontWeight={700}>Liste active</Typography><Typography variant="caption" color="text.secondary">Disponible pour les utilisateurs autorisés</Typography></Box><Switch checked={active} onChange={(event) => setActive(event.target.checked)} /></Stack></Stack> : null}
  {section === 'Vues' ? <Box sx={{ p: 2.5 }}><Alert severity="info">Vue associée : {String(bindings.view ?? 'aucune vue explicite ; les colonnes de la liste sont utilisées')}</Alert></Box> : null}
  {section === 'Cycle annuel' ? <Box sx={{ p: 2.5 }}><Typography fontWeight={700}>Périodicité enregistrée : {String(data.periodicity ?? 'none')}</Typography><Button component={RouterLink} to="/administration/instances" variant="outlined" sx={{ mt: 2 }}>Gérer les instances</Button></Box> : null}
  {section === 'Règles' ? <Box sx={{ p: 2.5 }}><Typography fontWeight={700}>{rules.length} règle(s) associée(s)</Typography><Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 1.5 }}>{rules.map((rule) => <Chip key={rule} label={rule} variant="outlined" />)}</Stack><Button component={RouterLink} to="/administration/regles" variant="outlined" sx={{ mt: 2 }}>Gérer les règles</Button></Box> : null}
  {section === 'Permissions' ? <Box sx={{ p: 2.5 }}><Alert severity="info">Les permissions sont gérées par les rôles et groupes Keycloak, pas dans le document de liste.</Alert><Button component={RouterLink} to="/administration/permissions" variant="outlined" sx={{ mt: 2 }}>Ouvrir la matrice des permissions</Button></Box> : null}
  {section === 'Publication' ? <Box sx={{ p: 2.5 }}><Alert severity={version?.state === 'published' ? 'success' : 'warning'}>{version?.state === 'published' ? 'La dernière version est publiée.' : 'La dernière version est un brouillon sans effet sur les nouvelles créations.'}</Alert>{version?.validation_errors?.length ? <Alert severity="error" sx={{ mt: 2 }}>{version.validation_errors.map((item) => `${item.path}: ${item.message}`).join(' · ')}</Alert> : <Alert severity="success" sx={{ mt: 2 }}>Aucune erreur de validation enregistrée par le serveur.</Alert>}<Button variant="contained" startIcon={<PublishOutlined />} sx={{ mt: 2 }} disabled={!definition || saving} onClick={() => void save(true)}>Enregistrer et publier</Button></Box> : null}
  </Card></Box></Box>
}

export function TemplatesPage() {
  const templates = [['Courrier externe standard', 'Courrier', 'v8', 'Publié'], ['Demande Direction Technique', 'Formulaire', 'v4', 'Publié'], ['Validation à deux niveaux', 'Workflow', 'v6', 'Brouillon'], ['Accueil de direction', 'Page', 'v3', 'Publié']]
  return <Box sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'flex-start' }} spacing={2} sx={{ mb: 2.5 }}><Box><Typography component="h1" variant="h1">Templates</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Catalogue des modèles métier versionnés.</Typography></Box><Button variant="contained" startIcon={<Add />}>Nouveau template</Button></Stack><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 2 }}>{templates.map(([name, type, version, status]) => <Card key={name} sx={{ p: 2.5 }}><Stack direction="row" justifyContent="space-between"><Chip label={type} size="small" variant="outlined" /><Chip label={status} size="small" color={status === 'Publié' ? 'success' : 'default'} /></Stack><Typography component="h2" variant="h3" sx={{ mt: 2 }}>{name}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{version} · mis à jour le 12/08/2026</Typography><Stack direction="row" spacing={1} sx={{ mt: 2 }}><Button startIcon={<EditOutlined />}>Modifier</Button><Button startIcon={<ContentCopyOutlined />}>Dupliquer</Button></Stack></Card>)}</Box></Box>
}

export function AuditPage() {
  const events = [['15/08/2026 15:48:22', 'Kader Yao', 'Signature', 'EXT-0040/2026', 'Signature graphique · v3'], ['15/08/2026 14:05:11', 'Awa Kouassi', 'Validation', 'EXT-0052/2026', 'Direction → Signature'], ['15/08/2026 11:12:04', 'Mariam Diarra', 'Rejet', 'EXT-0039/2026', 'Pièce justificative manquante'], ['15/08/2026 09:00:00', 'Système', 'Import', 'Externe 2026', '1 218 lignes créées']]
  return <Box sx={{ maxWidth: 1300, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}><Typography component="h1" variant="h1">Journal d’audit</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2.5 }}>Traçabilité immuable des événements métier et techniques.</Typography><Card sx={{ mb: 2 }}><Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr 1fr' }, gap: 1.5 }}><TextField size="small" placeholder="Acteur, ressource ou détail…" slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search /></InputAdornment> } }} /><TextField size="small" select label="Action" defaultValue=""><MenuItem value="">Toutes</MenuItem><MenuItem value="signature">Signature</MenuItem><MenuItem value="validation">Validation</MenuItem></TextField><TextField size="small" type="date" label="Date" defaultValue="2026-08-15" slotProps={{ inputLabel: { shrink: true } }} /></Box></Card><Card><Stack divider={<Divider flexItem />}>{events.map(([date, actor, action, resource, detail]) => <Box key={`${date}-${action}`} sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '180px 150px 140px 180px 1fr' }, gap: 1.5 }}><Typography variant="caption" sx={{ fontFamily: 'IBM Plex Mono, monospace' }}>{date}</Typography><Typography variant="body2" fontWeight={700}>{actor}</Typography><Chip label={action} size="small" variant="outlined" sx={{ justifySelf: 'start' }} /><Typography variant="body2" color="primary">{resource}</Typography><Typography variant="body2" color="text.secondary">{detail}</Typography></Box>)}</Stack></Card></Box>
}

export function BackupsPage() {
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [reason, setReason] = useState('')
  const backups = [['15/08/2026 · 03:00', 'Incrémentale', '184 Mo', 'Réussie'], ['14/08/2026 · 03:00', 'Incrémentale', '176 Mo', 'Réussie'], ['10/08/2026 · 03:00', 'Complète', '2,4 Go', 'Réussie'], ['09/08/2026 · 03:00', 'Incrémentale', '—', 'Échouée']]
  return <Box sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'flex-start' }} spacing={2} sx={{ mb: 2.5 }}><Box><Typography component="h1" variant="h1">Sauvegardes et restauration</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Restauration réservée au Super administrateur et toujours auditée.</Typography></Box><Button variant="contained" startIcon={<BackupOutlined />}>Lancer une sauvegarde</Button></Stack><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.5fr 1fr' }, gap: 2, mb: 2 }}><Card sx={{ p: 2.5 }}><Typography component="h2" variant="h3">Planification</Typography><Typography variant="body2" sx={{ mt: 1.5 }}>Quotidienne · 03:00 UTC</Typography><Typography variant="body2" color="text.secondary">Complète chaque dimanche + incrémentale quotidienne · rétention 30 jours · stockage chiffré hors site.</Typography></Card><Alert severity="warning"><strong>Restauration destructive</strong><br />Confirmation renforcée et justification obligatoires avant exécution.</Alert></Box><Card><Box sx={{ p: 2.5 }}><Typography component="h2" variant="h2">Historique</Typography></Box><Divider /><Stack divider={<Divider flexItem />}>{backups.map(([date, type, size, status]) => <Box key={date} sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1.2fr 1fr .7fr .8fr auto' }, gap: 1.5, alignItems: 'center' }}><Typography variant="body2" fontWeight={700}>{date}</Typography><Typography variant="body2">{type}</Typography><Typography variant="body2">{size}</Typography><Chip label={status} size="small" color={status === 'Réussie' ? 'success' : 'error'} variant="outlined" sx={{ justifySelf: 'start' }} /><Stack direction="row"><Button size="small">Journal</Button><Button size="small" startIcon={<RestoreOutlined />} disabled={status !== 'Réussie'} onClick={() => setRestoreOpen(true)}>Restaurer</Button></Stack></Box>)}</Stack></Card><Dialog open={restoreOpen} onClose={() => setRestoreOpen(false)} fullWidth maxWidth="sm"><DialogTitle>Préparer la restauration</DialogTitle><DialogContent><Alert severity="error" sx={{ mb: 2 }}>La restauration remplace l’état courant du périmètre sélectionné. Une sauvegarde de sécurité sera créée avant exécution.</Alert><TextField fullWidth required multiline minRows={4} label="Justification" value={reason} onChange={(event) => setReason(event.target.value)} /></DialogContent><DialogActions><Button onClick={() => setRestoreOpen(false)}>Annuler</Button><Button variant="contained" color="error" disabled={!reason.trim()}>Continuer avec authentification renforcée</Button></DialogActions></Dialog></Box>
}

export function OperationsPage() {
  const services = [['API Django', 'Opérationnel', '82 ms'], ['PostgreSQL', 'Opérationnel', '18 ms'], ['MinIO Documents', 'Opérationnel', '64 % utilisé'], ['Celery / Redis', 'Dégradé', '3 tâches en reprise']]
  return <Box sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}><Typography component="h1" variant="h1">État de la plateforme</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2.5 }}>Supervision fonctionnelle des services, du stockage et des intégrations.</Typography><Alert severity="warning" sx={{ mb: 2.5 }}>Le traitement asynchrone est dégradé : trois tâches seront automatiquement rejouées.</Alert><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5 }}>{services.map(([service, status, detail]) => <Card key={service} sx={{ p: 2.5 }}><Stack direction="row" justifyContent="space-between"><Typography component="h2" variant="h3">{service}</Typography><Chip label={status} size="small" color={status === 'Opérationnel' ? 'success' : 'warning'} variant="outlined" /></Stack><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{detail}</Typography>{service === 'MinIO Documents' ? <LinearProgress variant="determinate" value={64} sx={{ mt: 1.5 }} /> : null}</Card>)}</Box><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mt: 2 }}><Card sx={{ p: 2.5 }}><Typography component="h2" variant="h2">Webhooks</Typography><Stack spacing={1.25} sx={{ mt: 2 }}>{['courrier.created', 'workflow.validated', 'signature.completed'].map((event) => <Stack key={event} direction="row" justifyContent="space-between"><Typography variant="body2" sx={{ fontFamily: 'IBM Plex Mono, monospace' }}>{event}</Typography><Chip label="Actif" size="small" color="success" /></Stack>)}</Stack><Button variant="outlined" sx={{ mt: 2 }}>Configurer les intégrations</Button></Card><Card sx={{ p: 2.5 }}><Typography component="h2" variant="h2">Documentation API</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>OpenAPI v3 · authentification OIDC · environnement interne.</Typography><Button variant="outlined" sx={{ mt: 2 }}>Ouvrir la documentation</Button></Card></Box></Box>
}
