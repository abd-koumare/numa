import { useEffect, useState } from 'react'
import { Alert, Box, Button, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material'
import { apiFetch, API_DATA_ENABLED } from '../api/client'
import { defaultChoices } from '../app/configurationEditing'
import { evaluateCalculation, evaluateCondition, formValues, type FieldDefinition } from '../app/formRuntime'

function DynamicField({ field, values, onChange, onFiles }: { field: FieldDefinition; values: Record<string, unknown>; onChange: (value: unknown) => void; onFiles?: (files: File[]) => void }) {
  const [choices, setChoices] = useState(field.options ?? defaultChoices[field.key] ?? [])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const reference = ['user', 'group', 'organization-unit', 'relation'].includes(field.type)
  useEffect(() => {
    setChoices(field.options ?? defaultChoices[field.key] ?? []); setError('')
    if (!reference || !API_DATA_ENABLED || (field.type === 'relation' && !field.target_list)) return
    const controller = new AbortController()
    setLoading(true)
    apiFetch<{ results: { value: string; label: string }[] }>(`/runtime/choices/${field.type}/${field.target_list ? `?list=${encodeURIComponent(field.target_list)}` : ''}`, { signal: controller.signal }).then((data) => { if (!controller.signal.aborted) setChoices(data.results) }).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Choix indisponibles.') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [field.type, field.target_list, field.key, field.options, reference])
  if (field.visible_when && !evaluateCondition(field.visible_when, values)) return null
  if (field.type === 'file') return <Box><Button component="label" variant="outlined">{field.label}<input type="file" multiple hidden aria-label={field.label} onChange={(event) => onFiles?.(Array.from(event.target.files ?? []))} /></Button><Typography variant="caption" display="block">Les documents sont analysés avant la soumission.</Typography></Box>
  if (field.type === 'boolean') return <FormControlLabel label={field.label} control={<Switch checked={Boolean(values[field.key])} onChange={(event) => onChange(event.target.checked)} />} />
  if (field.type === 'computed') return <TextField label={field.label} value={String(evaluateCalculation(field.expression, values) ?? '')} slotProps={{ input: { readOnly: true } }} helperText="Calculé automatiquement ; le serveur vérifie le résultat." />
  if (reference || ['choice', 'multi-choice'].includes(field.type)) return <Stack spacing={1}><TextField select label={field.label} required={field.required} disabled={loading} value={field.type === 'multi-choice' ? (Array.isArray(values[field.key]) ? values[field.key] : []) : (values[field.key] ?? '')} onChange={(event) => onChange(event.target.value)} slotProps={{ select: { multiple: field.type === 'multi-choice' } }}><MenuItem value="" disabled={field.type === 'multi-choice'}>Choisir</MenuItem>{choices.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}</TextField>{error ? <Alert severity="error">{error}</Alert> : null}</Stack>
  return <TextField label={field.label} required={field.required} multiline={field.type === 'textarea'} minRows={field.type === 'textarea' ? 3 : undefined} type={field.type === 'number' ? 'number' : field.type === 'datetime' ? 'datetime-local' : field.type === 'date' ? 'date' : 'text'} value={values[field.key] ?? ''} onChange={(event) => onChange(field.type === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value)} slotProps={{ inputLabel: ['date', 'datetime'].includes(field.type) ? { shrink: true } : {}, htmlInput: field.type === 'number' ? { step: 'any' } : {} }} />
}
export function DynamicFields({ fields, values, onChange, onFiles }: { fields: FieldDefinition[]; values: Record<string, unknown>; onChange: (values: Record<string, unknown>) => void; onFiles?: (files: File[]) => void }) {
  const normalized = formValues(fields, values)
  return <Stack spacing={2}>{fields.map((field) => <DynamicField key={field.key} field={field} values={normalized} onFiles={onFiles} onChange={(value) => onChange({ ...values, [field.key]: value })} />)}</Stack>
}
