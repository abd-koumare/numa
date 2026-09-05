import { useEffect, useState } from 'react'
import { Alert, Box, Button, Card, Chip, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material'
import { Link as RouterLink, useParams } from 'react-router-dom'
import { API_DATA_ENABLED } from '../api/client'
import { createConfigurationDraft, publishConfiguration, resolveConfiguration, type ConfigurationDefinition } from '../api/configurations'
import { parseRuleCondition, ruleConditionToText } from '../app/ruleDsl'
import { PageContent } from './PublishedPage'

function useDefinition(kind: 'page' | 'workflow', id: string, loaded: (data: Record<string, unknown>) => void) {
  const [definition, setDefinition] = useState<ConfigurationDefinition | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(API_DATA_ENABLED)
  useEffect(() => {
    let active = true
    setDefinition(null); setError(''); setLoading(API_DATA_ENABLED)
    if (!API_DATA_ENABLED) return
    resolveConfiguration(kind, id).then((value) => {
      if (!value) throw new Error('Configuration introuvable.')
      if (active) { setDefinition(value); loaded((value.latest_version ?? value.current_version)?.data ?? {}) }
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Chargement impossible.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [kind, id])
  return { definition, setDefinition, error, setError, loading }
}
const blockTypes: Record<string, string> = { heading: 'Titre', text: 'Texte', callout: 'Encadré', button: 'Bouton', 'link-list': 'Liste de liens', metric: 'Indicateurs', chart: 'Graphique', 'list-view': 'Liste de courriers', 'task-list': 'Mes tâches', 'recent-activity': 'Activité récente' }
const blockSources: Record<string, string> = { metric: 'dashboard.metrics', chart: 'dashboard.series', 'list-view': 'correspondences.recent', 'task-list': 'tasks.mine', 'recent-activity': 'activity.recent' }
export function PageBuilderPage() {
  const { id = '' } = useParams()
  const [blocks, setBlocks] = useState<Record<string, unknown>[]>([])
  const [audience, setAudience] = useState('')
  const [name, setName] = useState('')
  const [selected, setSelected] = useState(0)
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const { definition, setDefinition, error, setError, loading } = useDefinition('page', id, (data) => {
    setBlocks(Array.isArray(data.blocks) ? data.blocks : []); setAudience(Array.isArray(data.audience) ? data.audience.join(', ') : ''); setSelected(0)
  })
  useEffect(() => setName(definition?.name ?? ''), [definition?.id])
  const block = blocks[selected]
  const update = (patch: Record<string, unknown>) => setBlocks((current) => current.map((item, index) => index === selected ? { ...item, ...patch } : item))
  const move = (offset: number) => {
    const target = selected + offset
    if (target < 0 || target >= blocks.length) return
    const next = [...blocks]; [next[selected], next[target]] = [next[target], next[selected]]; setBlocks(next); setSelected(target)
  }
  const save = async (publish: boolean) => {
    if (!definition) return
    setBusy(true); setError(''); setMessage('')
    try {
      let updated = await createConfigurationDraft(definition, { name: name || definition.name, data: { ...definition.latest_version?.data, blocks, audience: audience.split(',').map((role) => role.trim()).filter(Boolean) } })
      setDefinition(updated)
      if (publish) updated = await publishConfiguration(updated)
      setDefinition(updated); setMessage(publish ? 'Page publiée.' : 'Brouillon enregistré.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Publication impossible.') } finally { setBusy(false) }
  }
  const links = (Array.isArray(block?.links) ? block.links : []) as { label: string; path: string }[]
  return <Box sx={{ maxWidth: 1400, mx: 'auto', p: { xs: 2, md: 3 } }}><Typography component="h1" variant="h1" sx={{ mb: 2 }}>Page Builder — {definition?.name ?? id}</Typography><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}><Button onClick={() => setPreview(!preview)} variant="outlined">{preview ? 'Modifier les blocs' : 'Prévisualiser'}</Button><Button disabled={!definition || busy} variant="outlined" onClick={() => void save(false)}>Enregistrer le brouillon</Button><Button disabled={!definition || busy} variant="contained" onClick={() => void save(true)}>Enregistrer et publier</Button>{definition?.current_version ? <Button component={RouterLink} to={`/pages/${definition.slug}`}>Voir la page publiée</Button> : null}</Stack>{loading ? <Typography>Chargement…</Typography> : null}{error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}{message ? <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert> : null}<Stack spacing={2} sx={{ mb: 2 }}><TextField label="Nom de la page" value={name} onChange={(event) => setName(event.target.value)} /><TextField label="Rôles autorisés" value={audience} onChange={(event) => setAudience(event.target.value)} helperText="Vide : tous les utilisateurs habilités. Sinon : gestionnaire, validateur, admin, etc." /></Stack>{preview ? <Card sx={{ p: 3 }}><PageContent blocks={blocks} /></Card> : <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '230px 1fr 320px' }, gap: 2 }}><Card sx={{ p: 2, alignSelf: 'start' }}><Typography variant="h3">Ajouter un composant</Typography>{Object.entries(blockTypes).map(([type, label]) => <Button key={type} fullWidth sx={{ justifyContent: 'flex-start', mt: 1 }} onClick={() => { setBlocks([...blocks, { type, ...(blockSources[type] ? { source: blockSources[type] } : type === 'link-list' ? { links: [{ label: 'Courriers', path: '/courriers' }] } : { text: type === 'heading' ? 'Nouveau titre' : 'Nouveau contenu', ...(type === 'button' ? { path: '/courriers' } : {}) }) }]); setSelected(blocks.length) }}>{label}</Button>)}</Card><Card sx={{ p: 2 }}>{blocks.map((item, index) => <Button key={index} fullWidth variant={selected === index ? 'outlined' : 'text'} sx={{ justifyContent: 'flex-start', mb: 1 }} onClick={() => setSelected(index)}>{index + 1}. {String(item.text || blockTypes[String(item.type)])}</Button>)}</Card><Card sx={{ p: 2, alignSelf: 'start' }}>{block ? <Stack spacing={2}><Typography variant="h3">{blockTypes[String(block.type)]}</Typography><TextField label="Texte ou titre du bloc" value={String(block.text ?? '')} multiline onChange={(event) => update({ text: event.target.value })} />{block.type === 'button' ? <TextField label="Destination du bouton" value={String(block.path ?? '')} onChange={(event) => update({ path: event.target.value })} helperText="Chemin interne, par exemple /courriers" /> : null}{block.type === 'link-list' ? <>{links.map((link, index) => <Stack key={index} spacing={1}><TextField label={`Libellé du lien ${index + 1}`} value={link.label} onChange={(event) => update({ links: links.map((item, i) => i === index ? { ...item, label: event.target.value } : item) })} /><TextField label={`Destination du lien ${index + 1}`} value={link.path} onChange={(event) => update({ links: links.map((item, i) => i === index ? { ...item, path: event.target.value } : item) })} /><Button color="error" onClick={() => update({ links: links.filter((_, i) => i !== index) })}>Retirer le lien</Button></Stack>)}<Button onClick={() => update({ links: [...links, { label: 'Nouveau lien', path: '/' }] })}>Ajouter un lien</Button></> : null}<Stack direction="row"><Button disabled={selected === 0} onClick={() => move(-1)}>Monter</Button><Button disabled={selected === blocks.length - 1} onClick={() => move(1)}>Descendre</Button></Stack><Button color="error" onClick={() => { setBlocks(blocks.filter((_, index) => index !== selected)); setSelected(Math.max(0, selected - 1)) }}>Supprimer le bloc</Button></Stack> : <Typography>Ajoutez un composant.</Typography>}</Card></Box>}</Box>
}

type Step = { key: string; label: string; kind: string; actor: string; due_days?: number; optional?: boolean; [key: string]: unknown }
type Transition = { key: string; from: string; to: string; action: string; conditionText: string; [key: string]: unknown }
function automaticTransitions(steps: Step[]): Transition[] { return steps.slice(0, -1).map((step, index) => ({ key: `${step.key}-complete`, from: step.key, to: steps[index + 1].key, action: 'complete', conditionText: '' })) }
export function WorkflowBuilderPage() {
  const { id = '' } = useParams()
  const [steps, setSteps] = useState<Step[]>([])
  const [transitions, setTransitions] = useState<Transition[]>([])
  const [customTransitions, setCustomTransitions] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [tested, setTested] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const { definition, setDefinition, error, setError, loading } = useDefinition('workflow', id, (data) => {
    setSteps(Array.isArray(data.steps) ? data.steps : []); setCustomTransitions(Array.isArray(data.transitions))
    setTransitions((Array.isArray(data.transitions) ? data.transitions as Record<string, unknown>[] : []).map((transition) => ({ ...transition, conditionText: ruleConditionToText(transition.condition) } as Transition))); setSelectedIndex(0)
  })
  const step = steps[selectedIndex]
  const errors: string[] = []
  for (const item of steps) {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(item.key) || !item.label.trim()) errors.push('Chaque étape doit avoir une clé et un libellé valides.')
    if (!/^(creator|responsible-service|system|(?:role|group|user):.+)$/.test(item.actor)) errors.push(`Acteur invalide : ${item.actor}`)
    if (!Number.isInteger(item.due_days ?? 0) || Number(item.due_days ?? 0) < 0 || Number(item.due_days ?? 0) > 3650) errors.push('Le délai doit être un nombre entier entre 0 et 3650 jours.')
  }
  if (new Set(steps.map((item) => item.key)).size !== steps.length) errors.push('Les clés des étapes doivent être uniques.')
  const serializedTransitions = (customTransitions ? transitions : automaticTransitions(steps)).map(({ conditionText, ...transition }) => {
    if (!steps.some((item) => item.key === transition.from) || !steps.some((item) => item.key === transition.to)) errors.push('Une transition référence une étape absente.')
    let condition: unknown
    if (conditionText.trim()) { try { condition = parseRuleCondition(conditionText) } catch { errors.push('Condition de transition invalide.') } }
    return { ...transition, condition }
  })
  const updateStep = (patch: Partial<Step>) => {
    if (patch.key) setTransitions((current) => current.map((transition) => ({ ...transition, from: transition.from === step.key ? patch.key! : transition.from, to: transition.to === step.key ? patch.key! : transition.to })))
    setSteps((current) => current.map((item, index) => selectedIndex === index ? { ...item, ...patch } : item))
  }
  const move = (offset: number) => { const index = selectedIndex + offset; if (index < 0 || index >= steps.length) return; const next = [...steps]; [next[index], next[selectedIndex]] = [next[selectedIndex], next[index]]; setSteps(next); setSelectedIndex(index) }
  const save = async (publish: boolean) => {
    if (!definition || errors.length) return
    setBusy(true); setError(''); setMessage('')
    try {
      let updated = await createConfigurationDraft(definition, { data: { ...definition.latest_version?.data, steps, transitions: customTransitions ? serializedTransitions : undefined } })
      setDefinition(updated)
      if (publish) updated = await publishConfiguration(updated)
      setDefinition(updated); setMessage(publish ? 'Workflow publié.' : 'Brouillon enregistré.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Publication impossible.') } finally { setBusy(false) }
  }
  return <Box sx={{ maxWidth: 1350, mx: 'auto', p: { xs: 2, md: 3 } }}><Typography component="h1" variant="h1" sx={{ mb: 2 }}>Workflow Builder</Typography><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}><Button onClick={() => setTested(true)}>Vérifier</Button><Button variant="outlined" disabled={!definition || busy || !!errors.length} onClick={() => void save(false)}>Enregistrer le brouillon</Button><Button variant="contained" disabled={!definition || busy || !!errors.length} onClick={() => void save(true)}>Enregistrer et publier</Button></Stack>{loading ? <Typography>Chargement…</Typography> : null}{error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}{message ? <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert> : null}{tested ? <Alert severity={errors.length || !steps.length ? 'error' : 'success'} sx={{ mb: 2 }}>{errors.join(' · ') || (!steps.length ? 'Ajoutez au moins une étape.' : 'Structure locale valide ; le serveur valide l’ensemble à la publication.')}</Alert> : null}<Card sx={{ p: 2 }}><Stack direction="row" spacing={1} sx={{ overflowX: 'auto', pb: 2 }}>{steps.map((item, index) => <Button key={index} variant={selectedIndex === index ? 'contained' : 'outlined'} onClick={() => setSelectedIndex(index)} sx={{ minWidth: 140 }}>{index + 1}. {item.label}</Button>)}</Stack><Button onClick={() => { setSteps([...steps, { key: `step-${Date.now()}`, label: 'Nouvelle étape', kind: 'validation', actor: 'responsible-service', due_days: 2 }]); setSelectedIndex(steps.length) }}>Ajouter une étape</Button></Card>{step ? <Card sx={{ mt: 2, p: 2.5 }}><Stack spacing={2}><TextField label="Clé" value={step.key} onChange={(event) => updateStep({ key: event.target.value })} /><TextField label="Libellé" value={step.label} onChange={(event) => updateStep({ label: event.target.value })} /><TextField label="Type" select value={step.kind} onChange={(event) => updateStep({ kind: event.target.value })}>{['preparation', 'processing', 'validation', 'approval', 'signature', 'archive', 'automation'].map((kind) => <MenuItem key={kind} value={kind}>{kind}</MenuItem>)}</TextField><TextField label="Acteur" value={step.actor} onChange={(event) => updateStep({ actor: event.target.value })} helperText="creator, responsible-service, system, role:nom, group:id ou user:id" /><TextField label="Délai (jours)" type="number" value={step.due_days ?? 0} onChange={(event) => updateStep({ due_days: Number(event.target.value) })} /><FormControlLabel label="Étape facultative" control={<Switch checked={Boolean(step.optional)} onChange={(event) => updateStep({ optional: event.target.checked })} />} /><Stack direction="row"><Button disabled={selectedIndex === 0} onClick={() => move(-1)}>Monter</Button><Button disabled={selectedIndex === steps.length - 1} onClick={() => move(1)}>Descendre</Button><Button color="error" onClick={() => { setSteps(steps.filter((_, i) => i !== selectedIndex)); setTransitions(transitions.filter((transition) => transition.from !== step.key && transition.to !== step.key)); setSelectedIndex(Math.max(0, selectedIndex - 1)) }}>Supprimer l’étape</Button></Stack></Stack></Card> : null}<Card sx={{ mt: 2, p: 2.5 }}><Typography variant="h2">Transitions</Typography><FormControlLabel label="Transitions personnalisées" control={<Switch checked={customTransitions} onChange={(event) => { setCustomTransitions(event.target.checked); if (event.target.checked && !transitions.length) setTransitions(automaticTransitions(steps)) }} />} />{customTransitions ? <Stack spacing={2}>{transitions.map((transition, index) => {
    const update = (patch: Partial<Transition>) => setTransitions((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item))
    return <Card key={index} variant="outlined" sx={{ p: 2 }}><Stack spacing={1.5}><TextField label={`Clé transition ${index + 1}`} value={transition.key} onChange={(event) => update({ key: event.target.value })} /><TextField label={`Départ transition ${index + 1}`} select value={transition.from} onChange={(event) => update({ from: event.target.value })}>{steps.map((item) => <MenuItem key={item.key} value={item.key}>{item.label}</MenuItem>)}</TextField><TextField label={`Arrivée transition ${index + 1}`} select value={transition.to} onChange={(event) => update({ to: event.target.value })}>{steps.map((item) => <MenuItem key={item.key} value={item.key}>{item.label}</MenuItem>)}</TextField><TextField label={`Action transition ${index + 1}`} value={transition.action} onChange={(event) => update({ action: event.target.value })} helperText="complete, validate, approve, sign ou archive selon l’étape" /><TextField label={`Condition transition ${index + 1}`} multiline value={transition.conditionText} onChange={(event) => update({ conditionText: event.target.value })} helperText="Vide : toujours. Exemple : montant > 1000000 ; DSL JSON pour les conditions composées." /><Button color="error" onClick={() => setTransitions(transitions.filter((_, i) => i !== index))}>Retirer la transition</Button></Stack></Card>
  })}<Button disabled={!steps.length} onClick={() => setTransitions([...transitions, { key: `transition-${Date.now()}`, from: steps[0]?.key ?? '', to: steps[1]?.key ?? steps[0]?.key ?? '', action: 'complete', conditionText: '' }])}>Ajouter une transition</Button></Stack> : <Stack spacing={1}>{automaticTransitions(steps).map((transition) => <Chip key={transition.key} label={`${transition.from} → ${transition.to}`} />)}</Stack>}</Card></Box>
}
