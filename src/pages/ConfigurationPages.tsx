import { useEffect, useMemo, useState } from 'react'
import Add from '@mui/icons-material/Add'
import ArrowDownward from '@mui/icons-material/ArrowDownward'
import ArrowUpward from '@mui/icons-material/ArrowUpward'
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline'
import EditOutlined from '@mui/icons-material/EditOutlined'
import PlayArrow from '@mui/icons-material/PlayArrow'
import PublishOutlined from '@mui/icons-material/PublishOutlined'
import RestartAlt from '@mui/icons-material/RestartAlt'
import SaveOutlined from '@mui/icons-material/SaveOutlined'
import {
  Alert,
  Box,
  Button,
  Card,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Snackbar,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Switch,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom'
import { usePrototypeData } from '../app/PrototypeDataContext'
import { parseRuleAction, parseRuleCondition } from '../app/ruleDsl'
import { API_DATA_ENABLED } from '../api/client'
import { resolveConfiguration, saveConfiguration } from '../api/configurations'
import { rolloverListInstance, saveSystemSetting, transitionListInstance, type SystemSetting, useListInstances, useSystemSettings } from '../api/operations'
import type { ListDefinition, NavigationEntry, RuleDefinition } from '../types/ui'

function Heading({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'flex-start' }} spacing={2} sx={{ mb: 2.5 }}><Box><Typography component="h1" variant="h1">{title}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{description}</Typography></Box>{action}</Stack>
}

export function NavigationSettingsPage() {
  const { navigationEntries, updateNavigation } = usePrototypeData()
  const [draft, setDraft] = useState(navigationEntries)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => setDraft(navigationEntries), [navigationEntries])
  const move = (index: number, offset: number) => {
    const target = index + offset
    if (target < 0 || target >= draft.length) return
    const next = [...draft]
    ;[next[index], next[target]] = [next[target], next[index]]
    setDraft(next)
  }
  const update = (id: string, patch: Partial<NavigationEntry>) => setDraft((current) => current.map((entry) => entry.id === id ? { ...entry, ...patch } : entry))
  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await updateNavigation(draft)
      setSaved(true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Publication de la navigation impossible.')
    } finally {
      setSaving(false)
    }
  }
  return <Box sx={{ maxWidth: 1100, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}><Heading title="Navigation" description="Ordre, libellés et visibilité de la navigation principale." action={<Button variant="contained" startIcon={<SaveOutlined />} disabled={saving} onClick={() => void save()}>{saving ? 'Publication…' : 'Enregistrer et publier'}</Button>} />{error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}<Alert severity="info" sx={{ mb: 2 }}>Les éléments non autorisés sont automatiquement masqués pour l’utilisateur.</Alert><Card><Stack divider={<Divider flexItem />}>{draft.map((entry, index) => <Box key={entry.id} sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'auto 1.2fr 1.5fr 1.2fr auto' }, gap: 1.5, alignItems: 'center' }}><Stack direction="row"><Tooltip title="Monter"><span><IconButton disabled={index === 0} onClick={() => move(index, -1)}><ArrowUpward /></IconButton></span></Tooltip><Tooltip title="Descendre"><span><IconButton disabled={index === draft.length - 1} onClick={() => move(index, 1)}><ArrowDownward /></IconButton></span></Tooltip></Stack><TextField size="small" label="Libellé" value={entry.label} onChange={(event) => update(entry.id, { label: event.target.value })} /><TextField size="small" label="Destination" value={entry.path} onChange={(event) => update(entry.id, { path: event.target.value })} /><TextField select size="small" label="Visibilité" value={entry.visibility} onChange={(event) => update(entry.id, { visibility: event.target.value as NavigationEntry['visibility'] })}><MenuItem value="Tous les utilisateurs">Tous les utilisateurs</MenuItem><MenuItem value="Utilisateurs autorisés">Utilisateurs autorisés</MenuItem><MenuItem value="Administrateurs">Administrateurs</MenuItem></TextField><Switch checked={entry.enabled} onChange={(event) => update(entry.id, { enabled: event.target.checked })} inputProps={{ 'aria-label': `Activer ${entry.label}` }} /></Box>)}</Stack></Card><Snackbar open={saved} autoHideDuration={3000} onClose={() => setSaved(false)}><Alert severity="success" variant="filled">Navigation publiée et appliquée</Alert></Snackbar></Box>
}

export function SystemSettingsPage() {
  const [tab, setTab] = useState(0)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState('')
  const { data, loading, error, reload } = useSystemSettings()
  const [draft, setDraft] = useState<Record<string, Record<string, unknown>>>({
    general: { siteName: 'numa-orgatech', defaultHome: 'dashboard', allowBusinessAdminPublish: true },
    security: { sessionHours: 8, requireMfaForSensitiveActions: true, logAuthorizationDenials: true },
    files: { maxUploadBytes: 52_428_800, allowedExtensions: ['pdf', 'docx', 'xlsx', 'png', 'jpg'], antivirusRequired: true },
    notifications: { fromAddress: 'numa@orgatech.ci', webEnabled: true, emailEnabled: true },
    internationalization: { locale: 'fr-FR', timezone: 'UTC', dateFormat: 'DD/MM/YYYY' },
  })
  const sections: SystemSetting['section'][] = ['general', 'security', 'files', 'notifications', 'internationalization']
  const section = sections[tab]
  const sectionNotices: Partial<Record<SystemSetting['section'], string>> = {
    general: 'Le nom technique est conservé comme métadonnée. La page d’accueil effective se configure dans « Identité visuelle ».',
    security: 'Ces valeurs sont conservées comme politique de référence. Les sessions et le MFA effectifs se configurent dans Keycloak et les variables de déploiement.',
    files: 'Ces valeurs sont conservées comme politique de référence. Les limites d’envoi et l’antivirus effectifs restent pilotés par l’API, le proxy et ClamAV.',
    notifications: 'Ces valeurs sont conservées comme politique de référence. L’envoi de courriels nécessite la configuration SMTP du déploiement.',
    internationalization: 'Ces valeurs sont conservées comme préférences de référence. L’application complète de la langue, du fuseau et du format de date n’est pas encore disponible.',
  }
  useEffect(() => {
    if (!API_DATA_ENABLED || !data.results.length) return
    setDraft((current) => ({ ...current, ...Object.fromEntries(data.results.map((item) => [item.section, item.values])) }))
  }, [data.results])
  const values = draft[section] ?? {}
  const update = (key: string, value: unknown) => setDraft((current) => ({ ...current, [section]: { ...(current[section] ?? {}), [key]: value } }))
  const save = async () => {
    if (!API_DATA_ENABLED) { setSaved(true); return }
    const current = data.results.find((item) => item.section === section)
    if (!current) { setActionError('Cette section système est introuvable.'); return }
    setSaving(true); setActionError('')
    try { await saveSystemSetting(current, values); setSaved(true); reload() }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Enregistrement impossible.') }
    finally { setSaving(false) }
  }
  return <Box sx={{ maxWidth: 1100, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}><Heading title="Paramètres système" description="Politiques de référence et orientation vers leur configuration effective." action={<Button variant="contained" startIcon={<SaveOutlined />} disabled={saving || (API_DATA_ENABLED && loading)} onClick={() => void save()}>{saving ? 'Enregistrement…' : 'Enregistrer comme référence'}</Button>} />{error || actionError ? <Alert severity="error" sx={{ mb: 2 }}>{actionError || error}</Alert> : null}<Alert severity="warning" sx={{ mb: 2 }}>{sectionNotices[section] ?? 'Cette section est conservée comme politique de référence.'}</Alert><Card><Tabs value={tab} onChange={(_, value: number) => setTab(value)} variant="scrollable" scrollButtons="auto" sx={{ px: 1 }}><Tab label="Général" /><Tab label="Sécurité" /><Tab label="Fichiers" /><Tab label="Notifications" /><Tab label="Internationalisation" /></Tabs><Divider /><Stack spacing={2} sx={{ p: 2.5 }}>
    {tab === 0 ? <><TextField label="Nom technique du site" value={String(values.siteName ?? '')} onChange={(event) => update('siteName', event.target.value)} /><Button component={RouterLink} to="/administration/site" variant="outlined">Configurer l’identité et la page d’accueil effectives</Button><FormControlLabel control={<Switch checked={Boolean(values.allowBusinessAdminPublish)} onChange={(event) => update('allowBusinessAdminPublish', event.target.checked)} />} label="Politique souhaitée : autoriser les administrateurs métier à publier" /></> : null}
    {tab === 1 ? <><TextField label="Durée maximale d’une session" select value={Number(values.sessionHours ?? 8)} onChange={(event) => update('sessionHours', Number(event.target.value))}><MenuItem value={4}>4 heures</MenuItem><MenuItem value={8}>8 heures</MenuItem><MenuItem value={12}>12 heures</MenuItem></TextField><FormControlLabel control={<Switch checked={Boolean(values.requireMfaForSensitiveActions)} onChange={(event) => update('requireMfaForSensitiveActions', event.target.checked)} />} label="Exiger le MFA pour les opérations sensibles" /><FormControlLabel control={<Switch checked={Boolean(values.logAuthorizationDenials)} onChange={(event) => update('logAuthorizationDenials', event.target.checked)} />} label="Journaliser les refus d’autorisation" /></> : null}
    {tab === 2 ? <><TextField label="Taille maximale d’un fichier (Mo)" type="number" value={Math.round(Number(values.maxUploadBytes ?? 52_428_800) / 1024 / 1024)} onChange={(event) => update('maxUploadBytes', Number(event.target.value) * 1024 * 1024)} /><TextField label="Extensions autorisées" value={Array.isArray(values.allowedExtensions) ? values.allowedExtensions.join(', ') : ''} onChange={(event) => update('allowedExtensions', event.target.value.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean))} /><FormControlLabel control={<Switch checked={Boolean(values.antivirusRequired)} onChange={(event) => update('antivirusRequired', event.target.checked)} />} label="Analyse antivirus obligatoire" /></> : null}
    {tab === 3 ? <><TextField label="Adresse d’expédition" value={String(values.fromAddress ?? '')} onChange={(event) => update('fromAddress', event.target.value)} /><FormControlLabel control={<Switch checked={Boolean(values.webEnabled)} onChange={(event) => update('webEnabled', event.target.checked)} />} label="Notifications dans l’application" /><FormControlLabel control={<Switch checked={Boolean(values.emailEnabled)} onChange={(event) => update('emailEnabled', event.target.checked)} />} label="Notifications par courriel" /></> : null}
    {tab === 4 ? <><TextField label="Langue par défaut" select value={String(values.locale ?? 'fr-FR')} onChange={(event) => update('locale', event.target.value)}><MenuItem value="fr-FR">Français</MenuItem><MenuItem value="en-US">English</MenuItem></TextField><TextField label="Fuseau horaire" value={String(values.timezone ?? 'UTC')} onChange={(event) => update('timezone', event.target.value)} /><TextField label="Format de date" value={String(values.dateFormat ?? 'DD/MM/YYYY')} onChange={(event) => update('dateFormat', event.target.value)} /></> : null}
  </Stack></Card><Snackbar open={saved} autoHideDuration={3000} onClose={() => setSaved(false)}><Alert severity="success" variant="filled">Valeurs de référence enregistrées ; consultez l’avertissement pour leur application effective.</Alert></Snackbar></Box>
}

export function SignaturePoliciesPage() {
  const defaults = [
    { key: 'internalValidationEnabled', title: 'Validation électronique', description: 'Identité, action, date, adresse IP et empreinte du document.', enabled: true, roles: 'Gestionnaire, Validateur', retention: '10 ans' },
    { key: 'graphicSignatureEnabled', title: 'Signature graphique', description: 'Tracé ou nom stylisé associé à la preuve auditable.', enabled: true, roles: 'Gestionnaire, Validateur', retention: '10 ans' },
    { key: 'digitalSignatureEnabled', title: 'Signature numérique', description: 'Certificat, empreinte et horodatage qualifié.', enabled: false, roles: 'Validateur, Super administrateur', retention: '10 ans' },
  ]
  const [policies, setPolicies] = useState(defaults)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(API_DATA_ENABLED)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!API_DATA_ENABLED) return
    let active = true
    resolveConfiguration('signature_policy', 'default-signature-policy')
      .then((definition) => {
        if (!active || !definition) return
        const data = (definition.latest_version ?? definition.current_version)?.data ?? {}
        const roleAssignments = (data.roleAssignments ?? {}) as Record<string, string>
        const retention = (data.retentionByLevel ?? {}) as Record<string, string>
        setPolicies(defaults.map((policy) => ({
          ...policy,
          enabled: typeof data[policy.key] === 'boolean' ? Boolean(data[policy.key]) : policy.enabled,
          roles: roleAssignments[policy.key] ?? policy.roles,
          retention: retention[policy.key] ?? policy.retention,
        })))
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Chargement impossible.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  const update = (key: string, patch: Partial<(typeof policies)[number]>) => setPolicies((current) => current.map((policy) => policy.key === key ? { ...policy, ...patch } : policy))
  const save = async () => {
    if (!API_DATA_ENABLED) { setSaved(true); return }
    setSaving(true); setError('')
    try {
      await saveConfiguration({
        kind: 'signature_policy', slug: 'default-signature-policy', name: 'Politique de signature', publish: true,
        data: {
          ...Object.fromEntries(policies.map((policy) => [policy.key, policy.enabled])),
          roleAssignments: Object.fromEntries(policies.map((policy) => [policy.key, policy.roles])),
          retentionByLevel: Object.fromEntries(policies.map((policy) => [policy.key, policy.retention])),
        },
      })
      setSaved(true)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.') }
    finally { setSaving(false) }
  }
  return <Box sx={{ maxWidth: 1100, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}><Heading title="Politiques de signature" description="Niveaux autorisés, habilitations et exigences de preuve." action={<Button variant="contained" disabled={loading || saving} onClick={() => void save()}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>} />{error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}<Alert severity="warning" sx={{ mb: 2 }}>Les couleurs ou logos personnalisés ne modifient jamais les éléments de preuve cryptographique.</Alert><Stack spacing={2}>{policies.map((policy) => <Card key={policy.key} sx={{ p: 2.5 }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2}><Box><Typography component="h2" variant="h3">{policy.title}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{policy.description}</Typography></Box><Switch checked={policy.enabled} onChange={(event) => update(policy.key, { enabled: event.target.checked })} inputProps={{ 'aria-label': `Activer ${policy.title}` }} /></Stack><Divider sx={{ my: 2 }} /><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}><TextField size="small" label="Rôles habilités" value={policy.roles} onChange={(event) => update(policy.key, { roles: event.target.value })} /><TextField size="small" label="Durée de conservation" value={policy.retention} onChange={(event) => update(policy.key, { retention: event.target.value })} /></Box></Card>)}</Stack><Snackbar open={saved} autoHideDuration={3000} onClose={() => setSaved(false)}><Alert severity="success" variant="filled">Politiques enregistrées et publiées</Alert></Snackbar></Box>
}

export function ListsCatalogPage() {
  const { lists } = usePrototypeData()
  const [query, setQuery] = useState('')
  const filtered = lists.filter((list) => `${list.name} ${list.description}`.toLocaleLowerCase('fr').includes(query.toLocaleLowerCase('fr')))
  return <Box sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}><Heading title="Listes métier" description="Définitions, cycles, formulaires, règles et publications." action={<Button component={RouterLink} to="/administration/listes/nouvelle" variant="contained" startIcon={<Add />}>Nouvelle liste</Button>} /><TextField fullWidth value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une liste…" sx={{ mb: 2 }} slotProps={{ htmlInput: { 'aria-label': 'Rechercher une liste' } }} /><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 2 }}>{filtered.map((list) => <Card key={list.id} sx={{ p: 2.5 }}><Stack direction="row" justifyContent="space-between"><Chip label={list.icon} size="small" variant="outlined" /><Chip label={list.status} size="small" color={list.status === 'Publié' ? 'success' : list.status === 'Brouillon' ? 'warning' : 'default'} /></Stack><Typography component="h2" variant="h2" sx={{ mt: 2 }}>{list.name}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{list.description}</Typography><Typography variant="caption" display="block" sx={{ mt: 1.5 }}>{list.periodicity} · version {list.version} · {list.itemCount.toLocaleString('fr-FR')} éléments</Typography><Button component={RouterLink} to={`/administration/listes/${list.id}`} startIcon={<EditOutlined />} sx={{ mt: 1.5 }}>Configurer</Button></Card>)}</Box></Box>
}

const listWizardSteps = ['Source', 'Informations', 'Cycle', 'Configuration', 'Confirmation']
export function ListCreationWizardPage() {
  const { addList } = usePrototypeData()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [source, setSource] = useState('empty')
  const [name, setName] = useState('Registre des incidents')
  const [description, setDescription] = useState('Suivi des incidents déclarés par les services.')
  const [periodicity, setPeriodicity] = useState<ListDefinition['periodicity']>('Annuelle')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const id = name.toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'nouvelle-liste'
  const finish = async () => {
    setCreating(true); setError('')
    try {
      const created = await addList({ id, name, description, icon: 'Registre', periodicity, status: 'Brouillon', version: 1, itemCount: 0 })
      navigate(`/administration/listes/${created.id}`, { replace: true })
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Création de la liste impossible.') }
    finally { setCreating(false) }
  }
  return <Box sx={{ maxWidth: 1000, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}><Heading title="Créer une liste" description="Assistant de création d’une nouvelle définition métier." />{error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}<Card sx={{ p: 2, mb: 2 }}><Stepper activeStep={step} alternativeLabel>{listWizardSteps.map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}</Stepper></Card><Card sx={{ p: { xs: 2.5, md: 4 } }}>
    {step === 0 ? <Stack spacing={1.5}><Typography component="h2" variant="h2">Point de départ</Typography>{[['empty', 'Liste vide', 'Configurez tous les champs et règles.'], ['template', 'Depuis un template', 'Réutilisez une configuration publiée.'], ['copy', 'Copier une liste', 'Reprenez la configuration sans ses données.']].map(([value, label, detail]) => <Button key={value} variant={source === value ? 'contained' : 'outlined'} onClick={() => setSource(value)} sx={{ justifyContent: 'flex-start', p: 2 }}><Box textAlign="left"><Typography fontWeight={700}>{label}</Typography><Typography variant="caption">{detail}</Typography></Box></Button>)}</Stack> : null}
    {step === 1 ? <Stack spacing={2}><Typography component="h2" variant="h2">Informations générales</Typography><TextField required label="Nom" value={name} onChange={(event) => setName(event.target.value)} /><TextField multiline minRows={3} label="Description" value={description} onChange={(event) => setDescription(event.target.value)} /><TextField label="Icône" select defaultValue="registry"><MenuItem value="registry">Registre</MenuItem><MenuItem value="form">Formulaire</MenuItem><MenuItem value="folder">Dossier</MenuItem></TextField></Stack> : null}
    {step === 2 ? <Stack spacing={2}><Typography component="h2" variant="h2">Cycle temporel</Typography><TextField select label="Périodicité" value={periodicity} onChange={(event) => setPeriodicity(event.target.value as ListDefinition['periodicity'])}>{['Aucune', 'Annuelle', 'Mensuelle', 'Trimestrielle', 'Personnalisée'].map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}</TextField><Alert severity="info">Une nouvelle instance sera préparée automatiquement avant chaque nouveau cycle.</Alert></Stack> : null}
    {step === 3 ? <Stack spacing={1}><Typography component="h2" variant="h2">Configuration initiale</Typography><FormControlLabel control={<Checkbox defaultChecked />} label="Ajouter les champs système" /><FormControlLabel control={<Checkbox defaultChecked />} label="Créer une vue tabulaire par défaut" /><FormControlLabel control={<Checkbox defaultChecked />} label="Activer les brouillons" /><FormControlLabel control={<Checkbox />} label="Associer le workflow Courrier standard" /></Stack> : null}
    {step === 4 ? <Stack spacing={2}><Typography component="h2" variant="h2">Confirmer la création</Typography><Alert severity="success" icon={<CheckCircleOutline />}>La définition sera créée en brouillon, sans données.</Alert><Typography><strong>{name}</strong> · {periodicity} · source {source === 'empty' ? 'vide' : source === 'template' ? 'template' : 'copie'}</Typography></Stack> : null}
    <Stack direction="row" justifyContent="space-between" sx={{ mt: 4 }}><Button disabled={step === 0 || creating} onClick={() => setStep((value) => value - 1)}>Précédent</Button>{step < listWizardSteps.length - 1 ? <Button variant="contained" disabled={step === 1 && !name.trim()} onClick={() => setStep((value) => value + 1)}>Continuer</Button> : <Button variant="contained" disabled={creating} onClick={() => void finish()}>{creating ? 'Création…' : 'Créer la liste'}</Button>}</Stack>
  </Card></Box>
}

export function RulesCatalogPage() {
  const { rules } = usePrototypeData()
  return <Box sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}><Heading title="Règles métier" description="Validations et automatismes conditionnels versionnés." action={<Button component={RouterLink} to="/administration/regles/nouvelle" variant="contained" startIcon={<Add />}>Nouvelle règle</Button>} /><Stack spacing={1.5}>{rules.map((rule) => <Card key={rule.id} sx={{ p: 2.5 }}><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.2fr 1fr 1fr auto' }, gap: 2, alignItems: 'center' }}><Box><Typography component="h2" variant="h3">{rule.name}</Typography><Typography variant="caption" color="text.secondary">{rule.scope} · version {rule.version}</Typography></Box><Typography variant="body2"><strong>SI</strong> {rule.condition}</Typography><Typography variant="body2"><strong>ALORS</strong> {rule.action}</Typography><Stack direction="row" alignItems="center"><Chip label={rule.status} size="small" color={rule.status === 'Publié' ? 'success' : rule.status === 'Erreur' ? 'error' : 'warning'} /><Button component={RouterLink} to={`/administration/regles/${rule.id}`}>Modifier</Button></Stack></Box></Card>)}</Stack></Box>
}

export function RuleBuilderPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { rules, addRule, updateRule, loading } = usePrototypeData()
  const existing = rules.find((rule) => rule.id === id)
  const [name, setName] = useState(existing?.name ?? 'Nouvelle règle')
  const [scope, setScope] = useState(existing?.scope ?? 'Courriers externes')
  const [condition, setCondition] = useState(existing?.condition ?? 'priorité = Urgente')
  const [action, setAction] = useState(existing?.action ?? 'Notifier le responsable')
  const [tested, setTested] = useState(false)
  const [published, setPublished] = useState(existing?.status === 'Publié')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!existing) return
    setName(existing.name); setScope(existing.scope); setCondition(existing.condition); setAction(existing.action); setPublished(existing.status === 'Publié')
  }, [existing?.id, existing?.version])
  const save = async (publish: boolean) => {
    const rule: RuleDefinition = { id: existing?.id ?? `rule-${Date.now()}`, name, scope, condition, action, status: publish ? 'Publié' : 'Brouillon', version: existing?.version ?? 1 }
    setSaving(true); setError('')
    try {
      if (existing) await updateRule(existing.id, rule)
      else {
        const created = await addRule(rule)
        navigate(`/administration/regles/${created.id}`, { replace: true })
      }
      setPublished(publish)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Enregistrement de la règle impossible.') }
    finally { setSaving(false) }
  }
  const unavailable = loading || (API_DATA_ENABLED && id !== 'nouvelle' && !existing)
  let conflict = false
  try { parseRuleCondition(condition); parseRuleAction(action) } catch { conflict = true }
  return <Box sx={{ maxWidth: 1100, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}><Heading title="Rule Builder" description={`${existing ? existing.name : 'Nouvelle règle'} · éditeur SI/ALORS`} action={<Stack direction="row" spacing={1} flexWrap="wrap"><Button variant="outlined" startIcon={<PlayArrow />} onClick={() => setTested(true)}>Vérifier la structure</Button><Button variant="outlined" disabled={conflict || saving || unavailable} onClick={() => void save(false)}>Enregistrer le brouillon</Button><Button variant="contained" startIcon={<PublishOutlined />} disabled={conflict || saving || unavailable} onClick={() => void save(true)}>{saving ? 'Enregistrement…' : 'Publier'}</Button></Stack>} />{error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}{tested ? <Alert severity={conflict ? 'error' : 'success'} sx={{ mb: 2 }}>{conflict ? 'Condition ou action invalide : utilisez les exemples proposés ou le DSL JSON.' : 'Structure reconnue. L’API effectuera la validation complète lors de l’enregistrement.'}</Alert> : null}{published ? <Alert severity="success" sx={{ mb: 2 }}>Règle publiée et nouvelle version créée.</Alert> : null}<Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}><Card sx={{ p: 2.5 }}><Typography component="h2" variant="h2">Définition</Typography><Stack spacing={2} sx={{ mt: 2 }}><TextField label="Nom" value={name} onChange={(event) => setName(event.target.value)} /><TextField label="Périmètre" value={scope} onChange={(event) => setScope(event.target.value)} /><TextField multiline minRows={3} label="SI · Condition" value={condition} error={conflict} helperText="Exemple : priorité = Urgente. Les conditions composées utilisent le DSL JSON." onChange={(event) => { setCondition(event.target.value); setTested(false) }} /><TextField multiline minRows={3} label="ALORS · Action" value={action} helperText="Première action : Exiger une pièce jointe, Notifier le responsable, ou DSL JSON. Les autres actions sont conservées." onChange={(event) => { setAction(event.target.value); setTested(false) }} /></Stack></Card><Stack spacing={2}><Card sx={{ p: 2.5 }}><Typography component="h2" variant="h3">Aperçu lisible</Typography><Alert severity="info" sx={{ mt: 2 }}>Lorsque <strong>{condition}</strong>, NUMA doit <strong>{action.toLocaleLowerCase('fr')}</strong>.</Alert></Card><Card sx={{ p: 2.5 }}><Typography component="h2" variant="h3">Versions</Typography><Stack spacing={1} sx={{ mt: 1.5 }}>{['Version courante publiée', 'Brouillons et restaurations historisés', 'Audit de publication disponible'].map((version) => <Stack key={version} direction="row" justifyContent="space-between"><Typography variant="body2">{version}</Typography><RestartAlt fontSize="small" color="disabled" /></Stack>)}</Stack></Card></Stack></Box></Box>
}

export function InstancesManagementPage() {
  const { data, loading, error, reload } = useListInstances()
  const [dialog, setDialog] = useState<'rollover' | 'reopen' | 'close' | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const demoInstances = [
    { id: 'demo-2027', period_key: '2027', label: 'Courriers 2027', status: 'planned', registry: 'external', item_count: 0, opened_at: null, closed_at: null },
    { id: 'demo-2026', period_key: '2026', label: 'Courriers 2026', status: 'active', registry: 'external', item_count: 1482, opened_at: '2026-01-01T00:00:00Z', closed_at: null },
    { id: 'demo-2025', period_key: '2025', label: 'Courriers 2025', status: 'closed', registry: 'external', item_count: 1396, opened_at: '2025-01-01T00:00:00Z', closed_at: '2026-01-05T00:00:00Z' },
  ]
  const instances = API_DATA_ENABLED ? data.results : demoInstances
  const openAction = (action: typeof dialog, id = '') => { setDialog(action); setSelectedId(id); setReason(''); setActionError('') }
  const confirm = async () => {
    if (!dialog) return
    if (!API_DATA_ENABLED) { setMessage(dialog === 'rollover' ? 'Préparation des instances 2027 planifiée' : dialog === 'close' ? 'Clôture planifiée' : 'Instance rouverte en lecture/écriture contrôlée'); setDialog(null); return }
    setBusy(true); setActionError('')
    try {
      if (dialog === 'rollover') {
        const sources = data.results.filter((item) => item.status === 'active' && item.registry !== 'custom')
        const nextYear = String(Math.max(new Date().getFullYear() + 1, ...sources.map((item) => Number(item.period_key) + 1)))
        await Promise.all(sources.map((item) => rolloverListInstance(item, nextYear, `${item.registry === 'internal' ? 'Courriers internes' : 'Courriers externes'} ${nextYear}`)))
        setMessage(`Instances ${nextYear} préparées sans reprendre les données.`)
      } else {
        const instance = data.results.find((item) => item.id === selectedId)
        if (!instance) throw new Error('Instance introuvable.')
        await transitionListInstance(instance, dialog === 'close' ? 'close' : 'reopen', reason)
        setMessage(dialog === 'close' ? `${instance.label} clôturée.` : `${instance.label} rouverte.`)
      }
      setDialog(null); setReason(''); reload()
    } catch (failure) { setActionError(failure instanceof Error ? failure.message : 'Action impossible.') }
    finally { setBusy(false) }
  }
  const statusLabels: Record<string, string> = { planned: 'Future', active: 'Active', reopened: 'Rouverte', closed: 'Clôturée', archived: 'Archivée' }
  const formatLifecycleDate = (item: typeof instances[number]) => { const value = item.status === 'closed' ? item.closed_at : item.opened_at; return value ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(value)) : 'Date non définie' }
  return <Box sx={{ maxWidth: 1150, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}><Heading title="Cycles et instances" description="Ouverture, clôture, bascule annuelle et réouverture exceptionnelle." action={<Button variant="contained" disabled={API_DATA_ENABLED && !data.results.some((item) => item.status === 'active')} onClick={() => openAction('rollover')}>Préparer l’année suivante</Button>} />{error || actionError ? <Alert severity="error" sx={{ mb: 2 }}>{actionError || error}</Alert> : null}<Alert severity="info" sx={{ mb: 2 }}>Les compteurs Interne et Externe restent indépendants pour chaque instance annuelle.</Alert>{loading && API_DATA_ENABLED ? <Typography>Chargement des instances…</Typography> : <Stack spacing={1.5}>{instances.map((instance) => <Card key={instance.id} sx={{ p: 2.5 }}><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '100px 1fr auto' }, gap: 2, alignItems: 'center' }}><Typography variant="h2">{instance.period_key}</Typography><Box><Stack direction="row" spacing={1} flexWrap="wrap"><Chip label={statusLabels[instance.status] ?? instance.status} size="small" color={instance.status === 'active' ? 'success' : instance.status === 'reopened' ? 'warning' : instance.status === 'planned' ? 'info' : 'default'} /><Chip label={instance.registry === 'internal' ? 'Interne' : instance.registry === 'external' ? 'Externe' : 'Métier'} size="small" variant="outlined" /><Typography variant="body2">{instance.status === 'closed' ? 'Clôturée' : instance.status === 'active' ? 'Ouverte' : instance.status === 'reopened' ? 'Rouverte' : 'Préparée'} · {formatLifecycleDate(instance)}</Typography></Stack><Typography variant="caption" color="text.secondary">{instance.item_count.toLocaleString('fr-FR')} élément(s) · {instance.label}</Typography></Box>{instance.status === 'closed' ? <Button color="warning" onClick={() => openAction('reopen', instance.id)}>Réouvrir</Button> : ['active', 'reopened'].includes(instance.status) ? <Button variant="outlined" onClick={() => openAction('close', instance.id)}>Clôturer</Button> : null}</Box></Card>)}</Stack>}<Dialog open={Boolean(dialog)} onClose={() => setDialog(null)} fullWidth maxWidth="sm"><DialogTitle>{dialog === 'rollover' ? 'Préparer la bascule annuelle' : dialog === 'close' ? 'Clôturer l’instance' : 'Réouvrir une instance clôturée'}</DialogTitle><DialogContent><Alert severity={dialog === 'rollover' ? 'info' : 'warning'} sx={{ mb: 2 }}>{dialog === 'rollover' ? 'Les structures, permissions et compteurs seront copiés sans reprendre les données.' : 'Cette action modifie la disponibilité en écriture et sera entièrement auditée.'}</Alert><TextField fullWidth multiline minRows={3} required label="Justification" value={reason} onChange={(event) => setReason(event.target.value)} /></DialogContent><DialogActions><Button onClick={() => setDialog(null)}>Annuler</Button><Button variant="contained" color={dialog === 'reopen' || dialog === 'close' ? 'warning' : 'primary'} disabled={!reason.trim() || busy} onClick={() => void confirm()}>{busy ? 'Traitement…' : 'Confirmer'}</Button></DialogActions></Dialog><Snackbar open={Boolean(message)} autoHideDuration={3500} onClose={() => setMessage('')}><Alert severity="success" variant="filled">{message}</Alert></Snackbar></Box>
}
