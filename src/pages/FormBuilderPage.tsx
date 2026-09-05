import { useEffect, useState } from 'react'
import { Alert, Box, Button, Card, FormControlLabel, MenuItem, Stack, Switch, Tab, Tabs, TextField, Typography } from '@mui/material'
import { useParams } from 'react-router-dom'
import { API_DATA_ENABLED } from '../api/client'
import { createConfigurationDraft, publishConfiguration, resolveConfiguration, useConfigurations, type ConfigurationDefinition } from '../api/configurations'
import { configurationDefaults, defaultBindings, defaultChoices } from '../app/configurationEditing'
import { parseRuleCondition, ruleConditionToText } from '../app/ruleDsl'
import type { FieldDefinition } from '../app/formRuntime'
import { ExpressionEditor } from '../components/ExpressionEditor'
import { DynamicFields } from '../components/DynamicFields'

const types: Record<string, string> = { text: 'Texte court', textarea: 'Texte long', number: 'Nombre', date: 'Date', datetime: 'Date et heure', boolean: 'Oui/Non', choice: 'Choix', 'multi-choice': 'Choix multiple', user: 'Utilisateur', group: 'Groupe', 'organization-unit': 'Unité organisationnelle', file: 'Document', relation: 'Relation', computed: 'Calculé' }
type EditableField = FieldDefinition & { condition: string }
export function FieldFormBuilderPage() {
  const { id, formId } = useParams()
  const [definition, setDefinition] = useState<ConfigurationDefinition | null>(null)
  const [fields, setFields] = useState<EditableField[]>((configurationDefaults('form').fields as FieldDefinition[]).map((field) => ({ ...field, condition: '' })))
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [tab, setTab] = useState(0)
  const [preview, setPreview] = useState(false)
  const [previewValues, setPreviewValues] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(API_DATA_ENABLED)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const { data: lists } = useConfigurations('list')
  useEffect(() => {
    let active = true
    setDefinition(null); setLoading(API_DATA_ENABLED); setError('')
    if (!API_DATA_ENABLED) return
    const load = async () => {
      let identifier = formId
      if (!identifier) {
        const list = await resolveConfiguration('list', id ?? '')
        if (!list) throw new Error('Liste introuvable.')
        const data = (list.latest_version ?? list.current_version)?.data ?? {}
        const bindings = { ...(defaultBindings[list.slug] ?? {}), ...(data.bindings as Record<string, unknown> ?? {}) }
        if (typeof bindings.form !== 'string') throw new Error('Associez un formulaire à cette liste dans ses paramètres.')
        identifier = bindings.form
      }
      const form = await resolveConfiguration('form', identifier)
      if (!form) throw new Error('Formulaire introuvable.')
      if (!active) return
      const data = (form.latest_version ?? form.current_version)?.data ?? {}
      setDefinition(form)
      setFields((Array.isArray(data.fields) ? data.fields as FieldDefinition[] : []).map((field) => ({ ...field, options: field.options ?? defaultChoices[field.key], condition: ruleConditionToText(field.visible_when) })))
      setSelectedIndex(0)
    }
    load().catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Chargement impossible.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [id, formId])
  const selected = fields[selectedIndex]
  const update = (patch: Partial<EditableField>) => setFields((current) => current.map((field, index) => index === selectedIndex ? { ...field, ...patch } : field))
  const add = () => { setFields((current) => [...current, { key: `field_${Date.now()}`, label: 'Nouveau champ', type: 'text', condition: '' }]); setSelectedIndex(fields.length) }
  const move = (offset: number) => {
    const target = selectedIndex + offset
    if (target < 0 || target >= fields.length) return
    const next = [...fields]; [next[target], next[selectedIndex]] = [next[selectedIndex], next[target]]; setFields(next); setSelectedIndex(target)
  }
  const errors: string[] = []
  const serialized = fields.map(({ condition, ...field }) => {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(field.key)) errors.push(`Clé invalide : ${field.key}`)
    if (!field.label.trim()) errors.push(`Libellé manquant : ${field.key}`)
    if ((field.type === 'choice' || field.type === 'multi-choice') && (!field.options?.length || field.options.some((item) => !item.value || !item.label))) errors.push(`Définissez les choix de ${field.label}.`)
    if (field.type === 'relation' && !field.target_list) errors.push(`Choisissez la liste liée à ${field.label}.`)
    let visible_when: unknown
    if (condition.trim()) { try { visible_when = parseRuleCondition(condition) } catch (reason) { errors.push(reason instanceof Error ? reason.message : 'Condition invalide.') } }
    return { ...field, visible_when }
  })
  if (new Set(fields.map((field) => field.key)).size !== fields.length) errors.push('Les clés de champs doivent être uniques.')
  const save = async (publish: boolean) => {
    if (!definition || errors.length) return
    setBusy(true); setError(''); setMessage('')
    try {
      let updated = await createConfigurationDraft(definition, { data: { ...definition.latest_version?.data, fields: serialized } })
      setDefinition(updated)
      if (publish) updated = await publishConfiguration(updated)
      setDefinition(updated); setMessage(publish ? 'Formulaire publié. Les nouvelles créations utilisent cette version.' : 'Brouillon enregistré.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.') } finally { setBusy(false) }
  }
  return <Box sx={{ maxWidth: 1350, mx: 'auto', p: { xs: 2, md: 3 } }}><Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 2 }}><Box><Typography component="h1" variant="h1">Field & Form Builder</Typography><Typography color="text.secondary">{definition?.name ?? id ?? formId} · v{definition?.latest_version?.version ?? '—'}</Typography></Box><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><Button onClick={() => setPreview(!preview)} variant="outlined">{preview ? 'Fermer l’aperçu' : 'Prévisualiser'}</Button><Button disabled={!definition || busy || !!errors.length} onClick={() => void save(false)} variant="outlined">Enregistrer le brouillon</Button><Button disabled={!definition || busy || !!errors.length} onClick={() => void save(true)} variant="contained">Enregistrer et publier</Button></Stack></Stack>{loading ? <Typography>Chargement…</Typography> : null}{error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}{message ? <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert> : null}{!API_DATA_ENABLED ? <Alert severity="info">Mode démonstration : aperçu local.</Alert> : null}<Card sx={{ mb: 2 }}><Tabs value={tab} onChange={(_, value: number) => setTab(value)} variant="scrollable"><Tab label="Catalogue de champs" /><Tab label="Mise en page" /><Tab label="Conditions" /><Tab label="Calculs et relations" /><Tab label="Aperçu et erreurs" /></Tabs></Card>{preview ? <Card sx={{ p: 3 }}><Typography variant="h2" sx={{ mb: 2 }}>Aperçu du formulaire</Typography><DynamicFields fields={serialized} values={previewValues} onChange={setPreviewValues} /></Card> : <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '280px minmax(0, 1fr)' }, gap: 2 }}><Card sx={{ p: 2, alignSelf: 'start' }}><Button fullWidth onClick={add} variant="outlined">Ajouter un champ</Button>{fields.map((field, index) => <Button key={index} fullWidth sx={{ justifyContent: 'flex-start', mt: 1, bgcolor: selectedIndex === index ? 'action.selected' : undefined }} onClick={() => setSelectedIndex(index)}>{field.label || field.key}</Button>)}</Card><Card sx={{ p: 2.5 }}>{selected ? <Stack spacing={2}>{tab === 0 ? <><TextField label="Clé technique" value={selected.key} disabled={!!(definition?.latest_version?.data.fields as FieldDefinition[] | undefined)?.some((field) => field.key === selected.key)} onChange={(event) => update({ key: event.target.value })} /><TextField label="Libellé" value={selected.label} onChange={(event) => update({ label: event.target.value })} /><TextField select label="Type" value={selected.type} onChange={(event) => update({ type: event.target.value, ...(event.target.value === 'computed' ? { expression: selected.expression ?? { operator: 'add', operands: [0, 0] } } : {}) })}>{Object.entries(types).map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}</TextField><FormControlLabel label="Champ obligatoire" control={<Switch checked={Boolean(selected.required)} onChange={(event) => update({ required: event.target.checked })} />} />{['choice', 'multi-choice'].includes(selected.type) ? <><Typography variant="h3">Choix disponibles</Typography>{(selected.options ?? []).map((option, index) => <Stack key={index} direction="row" spacing={1}><TextField label={`Valeur du choix ${index + 1}`} value={option.value} onChange={(event) => update({ options: selected.options!.map((item, i) => i === index ? { ...item, value: event.target.value } : item) })} /><TextField label={`Libellé du choix ${index + 1}`} value={option.label} onChange={(event) => update({ options: selected.options!.map((item, i) => i === index ? { ...item, label: event.target.value } : item) })} /><Button color="error" onClick={() => update({ options: selected.options!.filter((_, i) => i !== index) })}>Retirer</Button></Stack>)}<Button onClick={() => update({ options: [...(selected.options ?? []), { value: '', label: '' }] })}>Ajouter un choix</Button></> : null}<Button color="error" onClick={() => { setFields(fields.filter((_, i) => i !== selectedIndex)); setSelectedIndex(Math.max(0, selectedIndex - 1)) }}>Supprimer le champ</Button></> : null}{tab === 1 ? <><Typography variant="h2">Ordre des champs</Typography><Button disabled={selectedIndex === 0} onClick={() => move(-1)}>Monter le champ</Button><Button disabled={selectedIndex === fields.length - 1} onClick={() => move(1)}>Descendre le champ</Button></> : null}{tab === 2 ? <><TextField label="Condition de visibilité" multiline minRows={3} value={selected.condition} onChange={(event) => update({ condition: event.target.value })} helperText="Exemple : priorité = Urgente. Une condition vide affiche toujours le champ. Les conditions composées acceptent le DSL JSON." /></> : null}{tab === 3 ? selected.type === 'computed' ? <ExpressionEditor value={selected.expression} fields={fields.filter((field) => field.key !== selected.key).map((field) => field.key)} onChange={(value) => update({ expression: value })} /> : selected.type === 'relation' ? <TextField select label="Liste cible" value={selected.target_list ?? ''} onChange={(event) => update({ target_list: event.target.value })}><MenuItem value="">Choisir une liste</MenuItem>{lists.map((list) => <MenuItem key={list.id} value={list.slug}>{list.name}</MenuItem>)}</TextField> : <Alert severity="info">Choisissez le type « Calculé » ou « Relation » dans les propriétés du champ.</Alert> : null}{tab === 4 ? <Alert severity={errors.length ? 'error' : 'success'}>{errors.join(' · ') || 'Structure locale valide. La publication effectue la validation serveur complète.'}</Alert> : null}</Stack> : <Alert severity="info">Ajoutez un champ pour commencer.</Alert>}</Card></Box>}</Box>
}
