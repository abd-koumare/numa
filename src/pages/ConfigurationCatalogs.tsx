import { useEffect, useState } from 'react'
import { Alert, Box, Button, Card, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom'
import { API_DATA_ENABLED } from '../api/client'
import { configurationVersions, createConfiguration, createConfigurationDraft, instantiateTemplate, publishConfiguration, renderTemplate, resolveConfiguration, useConfigurations, type ConfigurationDefinition, type ConfigurationKind, type ConfigurationVersion } from '../api/configurations'
import { configurationDefaults, configurationPath, slugify } from '../app/configurationEditing'
import { templateContext } from '../app/templateContext'

const targetKinds: ConfigurationKind[] = ['list', 'form', 'view', 'rule', 'workflow', 'page']
const kindLabels: Partial<Record<ConfigurationKind, string>> = { list: 'Liste', form: 'Formulaire', view: 'Vue', rule: 'Règle', workflow: 'Workflow', page: 'Page' }
function errorMessage(reason: unknown) { return reason instanceof Error ? reason.message : 'Enregistrement impossible.' }

export function ConfigurationCreateDialog({ kind, onClose, onCreated, source, template }: {
  kind: ConfigurationKind; onClose: () => void; onCreated: (value: ConfigurationDefinition) => void;
  source?: ConfigurationDefinition; template?: ConfigurationDefinition;
}) {
  const [name, setName] = useState(source ? `${source.name} — copie` : '')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [target, setTarget] = useState<ConfigurationKind>('form')
  const [templateType, setTemplateType] = useState('configuration')
  const [sourceId, setSourceId] = useState('')
  const { data: sources } = useConfigurations(target)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const resolvedSlug = slug || slugify(name)
  const create = async () => {
    setBusy(true); setError('')
    try {
      let data = source?.latest_version?.data ?? configurationDefaults(kind)
      if (kind === 'template' && !source) {
        const selected = sources.find((item) => item.id === sourceId)
        data = templateType === 'document'
          ? { template_type: 'document', format: 'docx', variables: ['subject'], body: '{{ subject }}' }
          : { template_type: 'configuration', target_kind: target, payload: selected?.current_version?.data ?? configurationDefaults(target) }
      }
      const created = template ? await instantiateTemplate(template.id, { name, slug: resolvedSlug, description }) : await createConfiguration({ kind, name, slug: resolvedSlug, description, data })
      onCreated(created)
    } catch (reason) { setError(errorMessage(reason)) } finally { setBusy(false) }
  }
  return <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm"><DialogTitle>{template ? 'Créer depuis ce template' : source ? 'Dupliquer la configuration' : `Créer ${kind === 'template' ? 'un template' : kindLabels[kind]?.toLowerCase()}`}</DialogTitle><DialogContent><Stack spacing={2} sx={{ mt: 1 }}>{error ? <Alert severity="error">{error}</Alert> : null}<TextField label="Nom" value={name} onChange={(event) => setName(event.target.value)} required /><TextField label="Identifiant" value={resolvedSlug} onChange={(event) => setSlug(event.target.value)} helperText="Minuscules, chiffres et tirets. Identifiant unique." /><TextField label="Description" value={description} onChange={(event) => setDescription(event.target.value)} multiline />{kind === 'template' && !source && !template ? <><TextField label="Type de template" select value={templateType} onChange={(event) => setTemplateType(event.target.value)}><MenuItem value="configuration">Configuration réutilisable</MenuItem><MenuItem value="document">Document DOCX</MenuItem></TextField>{templateType === 'configuration' ? <><TextField label="Type de configuration" select value={target} onChange={(event) => { setTarget(event.target.value as ConfigurationKind); setSourceId('') }}>{targetKinds.map((value) => <MenuItem key={value} value={value}>{kindLabels[value]}</MenuItem>)}</TextField><TextField label="Source" select value={sourceId} onChange={(event) => setSourceId(event.target.value)}><MenuItem value="">Configuration initiale</MenuItem>{sources.filter((item) => item.current_version).map((item) => <MenuItem key={item.id} value={item.id}>{item.name} · v{item.current_version?.version}</MenuItem>)}</TextField></> : null}</> : null}<Alert severity="info">La nouvelle configuration sera créée en brouillon.</Alert></Stack></DialogContent><DialogActions><Button disabled={busy} onClick={onClose}>Annuler</Button><Button variant="contained" disabled={busy || !name.trim() || !/^[a-z0-9][a-z0-9_-]*$/.test(resolvedSlug)} onClick={() => void create()}>{busy ? 'Création…' : 'Créer le brouillon'}</Button></DialogActions></Dialog>
}

function ConfigurationCatalog({ kind, title, actionLabel }: { kind: ConfigurationKind; title: string; actionLabel: string }) {
  const { data, loading, error } = useConfigurations(kind)
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [source, setSource] = useState<ConfigurationDefinition>()
  return <Box sx={{ maxWidth: 1200, mx: 'auto', p: { xs: 2, md: 3 } }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}><Typography component="h1" variant="h1">{title}</Typography><Button variant="contained" disabled={!API_DATA_ENABLED} onClick={() => { setSource(undefined); setCreating(true) }}>{actionLabel}</Button></Stack>{error ? <Alert severity="error">{error}</Alert> : null}{loading ? <Typography>Chargement…</Typography> : null}{!API_DATA_ENABLED ? <Alert severity="info">Ces configurations sont disponibles en mode connecté.</Alert> : null}<Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>{data.map((definition) => <Card key={definition.id} sx={{ p: 2.5 }}><Chip size="small" label={definition.latest_version?.state === 'published' ? 'Publié' : 'Brouillon'} /><Typography component="h2" variant="h2" sx={{ mt: 2 }}>{definition.name}</Typography><Typography color="text.secondary" sx={{ my: 1 }}>{definition.description || definition.slug} · v{definition.latest_version?.version}</Typography><Stack direction="row" spacing={1} flexWrap="wrap"><Button component={RouterLink} to={configurationPath(kind, definition.id)}>Configurer</Button><Button onClick={() => { setSource(definition); setCreating(true) }}>Dupliquer</Button>{kind === 'page' && definition.current_version ? <Button component={RouterLink} to={`/pages/${definition.slug}`}>Voir la page publiée</Button> : null}</Stack></Card>)}</Box>{!loading && API_DATA_ENABLED && !data.length ? <Alert severity="info">Aucune configuration enregistrée.</Alert> : null}{creating ? <ConfigurationCreateDialog kind={kind} source={source} onClose={() => setCreating(false)} onCreated={(created) => navigate(configurationPath(created.kind, created.id))} /> : null}</Box>
}
export function PagesCatalogPage() { return <ConfigurationCatalog kind="page" title="Pages" actionLabel="Nouvelle page" /> }
export function WorkflowsCatalogPage() { return <ConfigurationCatalog kind="workflow" title="Workflows" actionLabel="Nouveau workflow" /> }
export function TemplatesCatalogPage() { return <ConfigurationCatalog kind="template" title="Templates" actionLabel="Nouveau template" /> }

export function TemplateDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [definition, setDefinition] = useState<ConfigurationDefinition | null>(null)
  const [versions, setVersions] = useState<ConfigurationVersion[]>([])
  const [data, setData] = useState<Record<string, unknown>>({})
  const [payload, setPayload] = useState('{}')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(API_DATA_ENABLED)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [instantiate, setInstantiate] = useState(false)
  const [context, setContext] = useState<Record<string, string>>({})
  useEffect(() => {
    let active = true
    setDefinition(null); setLoading(API_DATA_ENABLED); setError('')
    if (!API_DATA_ENABLED) return
    resolveConfiguration('template', id).then(async (value) => {
      if (!value) throw new Error('Template introuvable.')
      const history = await configurationVersions(value.id)
      if (!active) return
      const content = value.latest_version?.data ?? {}
      setDefinition(value); setName(value.name); setData(content); setPayload(JSON.stringify(content.payload ?? {}, null, 2)); setVersions(history)
    }).catch((reason) => { if (active) setError(errorMessage(reason)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [id])
  const document = data.template_type === 'document' || (data.template_type == null && 'body' in data)
  const save = async (publish: boolean) => {
    if (!definition) return
    setBusy(true); setError(''); setMessage('')
    try {
      const content = document ? { ...data, template_type: 'document', format: 'docx' } : { ...data, template_type: 'configuration', payload: JSON.parse(payload) }
      let updated = await createConfigurationDraft(definition, { name, data: content })
      setDefinition(updated)
      if (publish) updated = await publishConfiguration(updated)
      setDefinition(updated); setVersions(await configurationVersions(updated.id)); setMessage(publish ? 'Template publié.' : 'Brouillon enregistré.')
    } catch (reason) { setError(errorMessage(reason)) } finally { setBusy(false) }
  }
  const render = async () => {
    if (!definition) return
    setBusy(true); setError('')
    try {
      const result = await renderTemplate(definition.id, templateContext(context))
      const url = URL.createObjectURL(result.blob); const link = window.document.createElement('a')
      link.href = url; link.download = `${definition.slug}.docx`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (reason) { setError(errorMessage(reason)) } finally { setBusy(false) }
  }
  if (!definition) return <Box sx={{ p: 3 }}><Alert severity={error ? 'error' : 'info'}>{error || (loading ? 'Chargement…' : 'Template indisponible en mode démonstration.')}</Alert></Box>
  return <Box sx={{ maxWidth: 1100, mx: 'auto', p: { xs: 2, md: 3 } }}><Typography component="h1" variant="h1" sx={{ mb: 2 }}>{definition.name}</Typography><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}><Button disabled={busy} onClick={() => void save(false)} variant="outlined">Enregistrer le brouillon</Button><Button disabled={busy || !name.trim()} onClick={() => void save(true)} variant="contained">Enregistrer et publier</Button>{!document ? <Button disabled={!definition.current_version || busy} onClick={() => setInstantiate(true)}>Créer depuis ce template</Button> : null}</Stack>{error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}{message ? <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert> : null}<Card sx={{ p: 2.5 }}><Stack spacing={2}><TextField label="Nom" value={name} onChange={(event) => setName(event.target.value)} />{document ? <><TextField label="Texte du document" multiline minRows={7} value={String(data.body ?? '')} onChange={(event) => setData({ ...data, body: event.target.value })} helperText="Insérez les variables sous la forme {{ subject }}." /><TextField label="Variables" value={Array.isArray(data.variables) ? data.variables.join(', ') : ''} onChange={(event) => setData({ ...data, variables: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} /><Typography variant="h3">Générer un document depuis la version publiée</Typography>{(Array.isArray(definition.current_version?.data.variables) ? definition.current_version!.data.variables as string[] : []).map((variable) => <TextField key={variable} label={`Valeur : ${variable}`} value={context[variable] ?? ''} onChange={(event) => setContext({ ...context, [variable]: event.target.value })} />)}<Button variant="outlined" disabled={busy || !definition.current_version} onClick={() => void render()}>Télécharger le DOCX</Button></> : <><TextField label="Type de configuration" select value={String(data.target_kind ?? 'form')} onChange={(event) => setData({ ...data, target_kind: event.target.value })}>{targetKinds.map((kind) => <MenuItem key={kind} value={kind}>{kindLabels[kind]}</MenuItem>)}</TextField><TextField label="Contenu de la configuration (JSON)" multiline minRows={12} value={payload} onChange={(event) => setPayload(event.target.value)} helperText="La structure complète est validée par le serveur avant publication." /></>}</Stack></Card><Card sx={{ p: 2.5, mt: 2 }}><Typography variant="h3">Historique des versions</Typography>{versions.map((version) => <Typography key={version.id}>v{version.version} · {version.state}</Typography>)}</Card>{instantiate ? <ConfigurationCreateDialog kind={String(definition.current_version?.data.target_kind) as ConfigurationKind} template={definition} onClose={() => setInstantiate(false)} onCreated={(created) => navigate(configurationPath(created.kind, created.id))} /> : null}</Box>
}
