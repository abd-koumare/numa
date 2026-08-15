import { useState } from 'react'
import Add from '@mui/icons-material/Add'
import ArrowDownward from '@mui/icons-material/ArrowDownward'
import ArrowUpward from '@mui/icons-material/ArrowUpward'
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined'
import DeleteOutline from '@mui/icons-material/DeleteOutline'
import EditOutlined from '@mui/icons-material/EditOutlined'
import History from '@mui/icons-material/History'
import PublishOutlined from '@mui/icons-material/PublishOutlined'
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
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import { Link as RouterLink, useParams } from 'react-router-dom'

function Heading({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'flex-start' }} spacing={2} sx={{ mb: 2.5 }}><Box><Typography component="h1" variant="h1">{title}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{description}</Typography></Box>{action}</Stack>
}

export function PagesCatalogPage() {
  const pages = [
    ['accueil-dt', 'Accueil Direction Technique', 'Publiée', 'v6', 'Bureau · Tablette · Mobile'],
    ['accueil-finance', 'Accueil Direction Financière', 'Brouillon', 'v2', 'Bureau · Mobile'],
    ['portail-courrier', 'Portail Courrier', 'Publiée', 'v11', 'Bureau · Tablette · Mobile'],
  ]
  return <Box sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}><Heading title="Pages" description="Pages configurables, versions et visibilité par audience." action={<Button variant="contained" startIcon={<Add />}>Nouvelle page</Button>} /><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 2 }}>{pages.map(([id, name, status, version, devices]) => <Card key={id} sx={{ p: 2.5 }}><Stack direction="row" justifyContent="space-between"><Chip label={status} color={status === 'Publiée' ? 'success' : 'warning'} size="small" /><Typography variant="caption">{version}</Typography></Stack><Typography component="h2" variant="h2" sx={{ mt: 2 }}>{name}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{devices}</Typography><Stack direction="row" spacing={1} sx={{ mt: 2 }}><Button component={RouterLink} to={`/administration/pages/${id}`} startIcon={<EditOutlined />}>Modifier</Button><Button startIcon={<History />}>Versions</Button></Stack></Card>)}</Box></Box>
}

export function WorkflowsCatalogPage() {
  const workflows = [
    ['courrier-standard', 'Courrier externe — standard', 'Publié', '7 états · 6 transitions', 'v6'],
    ['courrier-interne', 'Courrier interne — validation courte', 'Publié', '5 états · 4 transitions', 'v4'],
    ['achat-validation', 'Demande d’achat — validation conditionnelle', 'Brouillon', '6 états · 2 conditions', 'v2'],
  ]
  return <Box sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}><Heading title="Workflows" description="Processus versionnés, acteurs, conditions et automatisations." action={<Button variant="contained" startIcon={<Add />}>Nouveau workflow</Button>} /><Stack spacing={1.5}>{workflows.map(([id, name, status, detail, version]) => <Card key={id} sx={{ p: 2.5 }}><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.4fr 1fr auto' }, gap: 2, alignItems: 'center' }}><Box><Typography component="h2" variant="h3">{name}</Typography><Typography variant="caption" color="text.secondary">{detail} · {version}</Typography></Box><Chip label={status} size="small" color={status === 'Publié' ? 'success' : 'warning'} sx={{ justifySelf: 'start' }} /><Button component={RouterLink} to={`/administration/workflows/${id}`} startIcon={<EditOutlined />}>Configurer</Button></Box></Card>)}</Stack></Box>
}

const templateRecords = [
  ['courrier-externe', 'Courrier externe standard', 'Liste', 'v8', 'Publié'],
  ['demande-dt', 'Demande Direction Technique', 'Formulaire', 'v4', 'Publié'],
  ['validation-deux-niveaux', 'Validation à deux niveaux', 'Workflow', 'v6', 'Brouillon'],
  ['accueil-direction', 'Accueil de direction', 'Page', 'v3', 'Publié'],
]

export function TemplatesCatalogPage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [message, setMessage] = useState('')
  return <Box sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}><Heading title="Templates" description="Configurations réutilisables et versionnées." action={<Button variant="contained" startIcon={<Add />} onClick={() => setDialogOpen(true)}>Nouveau template</Button>} /><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 2 }}>{templateRecords.map(([id, name, type, version, status]) => <Card key={id} sx={{ p: 2.5 }}><Stack direction="row" justifyContent="space-between"><Chip label={type} size="small" variant="outlined" /><Chip label={status} size="small" color={status === 'Publié' ? 'success' : 'warning'} /></Stack><Typography component="h2" variant="h3" sx={{ mt: 2 }}>{name}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{version} · mis à jour le 12/08/2026</Typography><Stack direction="row" spacing={1} sx={{ mt: 2 }}><Button component={RouterLink} to={`/administration/templates/${id}`} startIcon={<EditOutlined />}>Détail</Button><Button startIcon={<ContentCopyOutlined />} onClick={() => setMessage(`Copie de « ${name} » créée en brouillon`)}>Dupliquer</Button></Stack></Card>)}</Box><Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm"><DialogTitle>Créer un template</DialogTitle><DialogContent><Stack spacing={2} sx={{ mt: 1 }}><TextField label="Nom" defaultValue="Nouveau template métier" /><TextField select label="Type" defaultValue="list"><MenuItem value="list">Liste</MenuItem><MenuItem value="form">Formulaire</MenuItem><MenuItem value="workflow">Workflow</MenuItem><MenuItem value="page">Page</MenuItem></TextField><TextField select label="Source" defaultValue="current"><MenuItem value="current">Configuration actuelle</MenuItem><MenuItem value="empty">Template vide</MenuItem></TextField></Stack></DialogContent><DialogActions><Button onClick={() => setDialogOpen(false)}>Annuler</Button><Button variant="contained" onClick={() => { setDialogOpen(false); setMessage('Template créé en brouillon') }}>Créer</Button></DialogActions></Dialog><Snackbar open={Boolean(message)} autoHideDuration={3000} onClose={() => setMessage('')}><Alert severity="success" variant="filled">{message}</Alert></Snackbar></Box>
}

export function TemplateDetailPage() {
  const { id } = useParams()
  const record = templateRecords.find((item) => item[0] === id) ?? templateRecords[0]
  const [published, setPublished] = useState(record[4] === 'Publié')
  const [created, setCreated] = useState(false)
  return <Box sx={{ maxWidth: 1050, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}><Heading title={record[1]} description={`${record[2]} · ${record[3]} · configuration réutilisable`} action={<Stack direction="row" spacing={1}><Button variant="outlined" startIcon={<ContentCopyOutlined />} onClick={() => setCreated(true)}>Créer depuis ce template</Button><Button variant="contained" startIcon={<PublishOutlined />} onClick={() => setPublished(true)}>Publier</Button></Stack>} />{published ? <Alert severity="success" sx={{ mb: 2 }}>Cette version est disponible dans les assistants de création.</Alert> : null}{created ? <Alert severity="success" sx={{ mb: 2 }}>Nouvelle configuration créée en brouillon depuis ce template.</Alert> : null}<Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.4fr 1fr' }, gap: 2 }}><Card sx={{ p: 2.5 }}><Typography component="h2" variant="h2">Contenu de la configuration</Typography><Stack spacing={1.5} sx={{ mt: 2 }}>{['12 champs configurés', '4 vues enregistrées', '1 moteur de numérotation', '1 workflow associé', '6 règles de validation'].map((item) => <Stack key={item} direction="row" spacing={1}><Checkbox checked readOnly size="small" /><Typography variant="body2">{item}</Typography></Stack>)}</Stack></Card><Card sx={{ p: 2.5 }}><Typography component="h2" variant="h3">Historique des versions</Typography><Stack divider={<Divider flexItem />} sx={{ mt: 1.5 }}>{['v8 · Publiée · 12/08/2026', 'v7 · Archivée · 08/07/2026', 'v6 · Archivée · 14/05/2026'].map((item) => <Stack key={item} direction="row" justifyContent="space-between" alignItems="center" sx={{ py: 1.25 }}><Typography variant="body2">{item}</Typography><Button size="small">Comparer</Button></Stack>)}</Stack></Card></Box></Box>
}

type BuilderField = { id: string; label: string; type: string; required: boolean; condition: string }
const initialFields: BuilderField[] = [
  { id: 'subject', label: 'Objet', type: 'Texte court', required: true, condition: '' },
  { id: 'sender', label: 'Expéditeur', type: 'Texte court', required: true, condition: '' },
  { id: 'received', label: 'Date de réception', type: 'Date', required: true, condition: '' },
  { id: 'priority', label: 'Priorité', type: 'Choix', required: true, condition: '' },
  { id: 'confidentiality', label: 'Confidentialité', type: 'Choix', required: false, condition: 'Afficher si priorité = Urgente' },
]

export function FieldFormBuilderPage() {
  const { id } = useParams()
  const [tab, setTab] = useState(0)
  const [fields, setFields] = useState(initialFields)
  const [selectedId, setSelectedId] = useState(fields[0].id)
  const [preview, setPreview] = useState(false)
  const selected = fields.find((field) => field.id === selectedId)!
  const updateSelected = (patch: Partial<BuilderField>) => setFields((current) => current.map((field) => field.id === selectedId ? { ...field, ...patch } : field))
  const move = (offset: number) => { const index = fields.findIndex((field) => field.id === selectedId); const target = index + offset; if (target < 0 || target >= fields.length) return; const next = [...fields]; [next[index], next[target]] = [next[target], next[index]]; setFields(next) }
  const errors = fields.filter((field) => !field.label.trim())
  return <Box sx={{ maxWidth: 1350, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}><Heading title="Field & Form Builder" description={`${id ?? 'liste'} · champs, mise en page, conditions et aperçu`} action={<Stack direction="row" spacing={1}><Button variant="outlined" onClick={() => setPreview((value) => !value)}>{preview ? 'Fermer l’aperçu' : 'Prévisualiser'}</Button><Button variant="contained" disabled={Boolean(errors.length)}>Enregistrer</Button></Stack>} /><Card><Tabs value={tab} onChange={(_, value: number) => setTab(value)} variant="scrollable" scrollButtons="auto"><Tab label="Catalogue de champs" /><Tab label="Mise en page" /><Tab label="Conditions" /><Tab label="Calculs et relations" /><Tab label="Aperçu et erreurs" /></Tabs></Card>{preview ? <Card sx={{ mt: 2, p: 3 }}><Typography component="h2" variant="h2">Aperçu du formulaire</Typography><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mt: 2 }}>{fields.map((field) => <TextField key={field.id} label={field.label || 'Champ sans nom'} required={field.required} select={field.type === 'Choix'}>{field.type === 'Choix' ? <MenuItem value="demo">Valeur de démonstration</MenuItem> : null}</TextField>)}</Box></Card> : <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '340px minmax(0, 1fr)' }, gap: 2, mt: 2 }}><Card sx={{ alignSelf: 'start' }}><Box sx={{ p: 2 }}><Button fullWidth variant="outlined" startIcon={<Add />} onClick={() => { const field = { id: `field-${Date.now()}`, label: 'Nouveau champ', type: 'Texte court', required: false, condition: '' }; setFields((current) => [...current, field]); setSelectedId(field.id) }}>Ajouter un champ</Button></Box><Divider />{fields.map((field) => <Button key={field.id} fullWidth onClick={() => setSelectedId(field.id)} sx={{ justifyContent: 'flex-start', borderRadius: 0, p: 1.5, bgcolor: field.id === selectedId ? 'action.selected' : 'transparent' }}><Box textAlign="left"><Typography variant="body2" fontWeight={700}>{field.label || 'Sans nom'}</Typography><Typography variant="caption" color="text.secondary">{field.type}{field.required ? ' · obligatoire' : ''}</Typography></Box></Button>)}</Card><Card sx={{ p: 2.5 }}>
      {tab === 0 ? <Stack spacing={2}><Typography component="h2" variant="h2">Propriétés du champ</Typography><TextField label="Libellé" value={selected.label} onChange={(event) => updateSelected({ label: event.target.value })} /><TextField select label="Type" value={selected.type} onChange={(event) => updateSelected({ type: event.target.value })}>{['Texte court', 'Texte long', 'Nombre', 'Date', 'Choix', 'Utilisateur', 'Document', 'Relation', 'Calculé'].map((type) => <MenuItem key={type} value={type}>{type}</MenuItem>)}</TextField><FormControlLabel control={<Switch checked={selected.required} onChange={(event) => updateSelected({ required: event.target.checked })} />} label="Champ obligatoire" /><Button color="error" startIcon={<DeleteOutline />} disabled={fields.length === 1} onClick={() => { setFields((current) => current.filter((field) => field.id !== selected.id)); setSelectedId(fields.find((field) => field.id !== selected.id)!.id) }}>Supprimer le champ</Button></Stack> : null}
      {tab === 1 ? <Stack spacing={2}><Typography component="h2" variant="h2">Mise en page</Typography><Stack direction="row"><IconButton onClick={() => move(-1)} aria-label="Monter le champ"><ArrowUpward /></IconButton><IconButton onClick={() => move(1)} aria-label="Descendre le champ"><ArrowDownward /></IconButton></Stack><TextField select label="Largeur" defaultValue="6"><MenuItem value="12">Pleine largeur</MenuItem><MenuItem value="6">Demi-largeur</MenuItem><MenuItem value="4">Un tiers</MenuItem></TextField><TextField label="Section" defaultValue="Informations générales" /></Stack> : null}
      {tab === 2 ? <Stack spacing={2}><Typography component="h2" variant="h2">Visibilité conditionnelle</Typography><TextField multiline minRows={3} label="Condition" value={selected.condition} onChange={(event) => updateSelected({ condition: event.target.value })} placeholder="Ex. Afficher si priorité = Urgente" /><Alert severity="info">Une condition vide affiche toujours le champ.</Alert></Stack> : null}
      {tab === 3 ? <Stack spacing={2}><Typography component="h2" variant="h2">Calculs et relations</Typography><TextField select label="Mode" defaultValue="none"><MenuItem value="none">Aucun</MenuItem><MenuItem value="formula">Formule calculée</MenuItem><MenuItem value="relation">Relation avec une liste</MenuItem></TextField><TextField label="Expression ou liste cible" placeholder="montant_ht * 1.18" /></Stack> : null}
      {tab === 4 ? <Stack spacing={2}><Typography component="h2" variant="h2">Contrôle de la configuration</Typography>{errors.length ? <Alert severity="error">{errors.length} champ(s) sans libellé.</Alert> : <Alert severity="success">Configuration valide : {fields.length} champs, aucun conflit.</Alert>}<Button variant="outlined" onClick={() => setPreview(true)}>Ouvrir l’aperçu responsive</Button></Stack> : null}
    </Card></Box>}</Box>
}
