import { useEffect, useState } from 'react'
import { Alert, MenuItem, Stack, TextField } from '@mui/material'
import { API_DATA_ENABLED } from '../api/client'
import { listConfigurations, type ConfigurationDefinition, type ConfigurationKind } from '../api/configurations'
import { defaultBindings } from '../app/configurationEditing'

const roles: [string, ConfigurationKind, string][] = [['form', 'form', 'Formulaire associé'], ['workflow', 'workflow', 'Workflow associé'], ['numbering', 'numbering', 'Numérotation associée'], ['view', 'view', 'Vue associée'], ['signature_policy', 'signature_policy', 'Politique de signature associée']]
export function ListBindingsEditor({ slug, value, onChange }: { slug: string; value: Record<string, unknown>; onChange: (value: Record<string, unknown>) => void }) {
  const [definitions, setDefinitions] = useState<ConfigurationDefinition[]>([])
  const [error, setError] = useState('')
  const bindings = { ...defaultBindings[slug], ...value }
  useEffect(() => {
    let active = true
    if (API_DATA_ENABLED) listConfigurations().then((data) => { if (active) setDefinitions(data.filter((item) => item.current_version && item.active)) }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Chargement impossible.') })
    return () => { active = false }
  }, [])
  return <Stack spacing={1.5}>{error ? <Alert severity="error">{error}</Alert> : null}{roles.map(([role, kind, label]) => <TextField key={role} select label={label} value={String(bindings[role] ?? '')} onChange={(event) => onChange({ ...bindings, [role]: event.target.value || null })}><MenuItem value="">Aucun</MenuItem>{definitions.filter((item) => item.kind === kind).map((item) => <MenuItem key={item.id} value={item.slug}>{item.name}</MenuItem>)}</TextField>)}<TextField select label="Règles associées" value={Array.isArray(bindings.rules) ? bindings.rules : []} slotProps={{ select: { multiple: true } }} onChange={(event) => onChange({ ...bindings, rules: event.target.value })}>{definitions.filter((item) => item.kind === 'rule').map((item) => <MenuItem key={item.id} value={item.slug}>{item.name}</MenuItem>)}</TextField></Stack>
}
