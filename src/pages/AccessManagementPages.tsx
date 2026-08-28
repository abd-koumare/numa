import { useEffect, useMemo, useState } from 'react'
import Add from '@mui/icons-material/Add'
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined'
import GroupOutlined from '@mui/icons-material/GroupOutlined'
import PersonOutline from '@mui/icons-material/PersonOutline'
import Search from '@mui/icons-material/Search'
import SecurityOutlined from '@mui/icons-material/SecurityOutlined'
import {
  Alert,
  Avatar,
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
  InputAdornment,
  MenuItem,
  Snackbar,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom'
import { usePrototypeData } from '../app/PrototypeDataContext'
import type { DirectoryGroup, DirectoryUser, UserRole } from '../types/ui'
import { API_DATA_ENABLED, apiFetch } from '../api/client'

const demoDirectoryCandidates = [
  { id: 'user-aminata', name: 'Aminata Traoré', email: 'aminata.traore@orgatech.ci', department: 'Direction juridique', title: 'Juriste', initials: 'AT' },
  { id: 'user-jean', name: 'Jean Kouassi', email: 'jean.kouassi@orgatech.ci', department: 'Direction générale', title: 'Assistant de direction', initials: 'JK' },
  { id: 'user-issa', name: 'Issa Diallo', email: 'issa.diallo@orgatech.ci', department: 'Finance', title: 'Contrôleur', initials: 'ID' },
]

const allPermissions = [
  'correspondence.read', 'correspondence.read_all', 'correspondence.create', 'correspondence.update',
  'correspondence.submit', 'correspondence.validate', 'correspondence.reject', 'correspondence.cancel',
  'correspondence.reopen', 'correspondence.archive', 'correspondence.sign', 'correspondence.manage_acl',
  'document.upload', 'document.download', 'task.read', 'task.act', 'task.assign', 'search.use',
  'configuration.read', 'configuration.manage', 'configuration.publish', 'identity.read', 'identity.manage',
  'audit.read', 'audit.export', 'notification.read', 'transfer.import', 'transfer.export', 'backup.manage',
  'integration.manage', 'system.manage',
]

function PageHeading({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'flex-start' }} spacing={2} sx={{ mb: 2.5 }}><Box><Typography component="h1" variant="h1">{title}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{description}</Typography></Box>{action}</Stack>
}

export function UsersPage() {
  const { users, roles } = usePrototypeData()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [role, setRole] = useState('')
  const filtered = useMemo(() => users.filter((user) => {
    const text = `${user.name} ${user.email} ${user.department}`.toLocaleLowerCase('fr')
    return text.includes(query.toLocaleLowerCase('fr')) && (!status || user.status === status) && (!role || user.roles.includes(role as UserRole))
  }), [query, role, status, users])

  return <Box sx={{ maxWidth: 1280, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}>
    <PageHeading title="Utilisateurs" description="Comptes issus de l’annuaire d’entreprise et autorisations NUMA." action={<Button component={RouterLink} to="/administration/utilisateurs/nouveau" variant="contained" startIcon={<Add />}>Ajouter depuis l’annuaire</Button>} />
    <Alert severity="info" sx={{ mb: 2 }}>NUMA ne crée ni ne stocke de mot de passe. L’identité reste administrée dans Active Directory.</Alert>
    <Card sx={{ mb: 2 }}><Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr 1fr' }, gap: 1.5 }}><TextField size="small" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom, courriel ou service…" slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }, htmlInput: { 'aria-label': 'Rechercher un utilisateur' } }} /><TextField select size="small" label="Statut" value={status} onChange={(event) => setStatus(event.target.value)}><MenuItem value="">Tous</MenuItem><MenuItem value="Actif">Actifs</MenuItem><MenuItem value="Inactif">Inactifs</MenuItem><MenuItem value="Invitation en attente">En attente</MenuItem></TextField><TextField select size="small" label="Rôle" value={role} onChange={(event) => setRole(event.target.value)}><MenuItem value="">Tous</MenuItem>{roles.map((item) => <MenuItem key={item.id} value={item.id}>{item.label}</MenuItem>)}</TextField></Box></Card>
    <Card><TableContainer><Table aria-label="Utilisateurs NUMA"><TableHead><TableRow><TableCell>Utilisateur</TableCell><TableCell>Service</TableCell><TableCell>Rôles</TableCell><TableCell>Dernière connexion</TableCell><TableCell>Statut</TableCell><TableCell align="right">Action</TableCell></TableRow></TableHead><TableBody>{filtered.map((user) => <TableRow key={user.id} hover><TableCell><Stack direction="row" spacing={1.5} alignItems="center"><Avatar sx={{ width: 36, height: 36, bgcolor: 'primary.dark', fontSize: 12 }}>{user.initials}</Avatar><Box><Typography fontWeight={700} variant="body2">{user.name}</Typography><Typography variant="caption" color="text.secondary">{user.email}</Typography></Box></Stack></TableCell><TableCell><Typography variant="body2">{user.department}</Typography><Typography variant="caption" color="text.secondary">{user.title}</Typography></TableCell><TableCell><Stack direction="row" spacing={0.5} flexWrap="wrap">{user.roles.map((item) => <Chip key={item} label={roles.find((entry) => entry.id === item)?.label ?? item} size="small" variant="outlined" />)}</Stack></TableCell><TableCell><Typography variant="body2">{user.lastLogin}</Typography></TableCell><TableCell><Chip label={user.status} size="small" color={user.status === 'Actif' ? 'success' : user.status === 'Inactif' ? 'default' : 'warning'} /></TableCell><TableCell align="right"><Button component={RouterLink} to={`/administration/utilisateurs/${user.id}`}>Gérer</Button></TableCell></TableRow>)}</TableBody></Table></TableContainer>{!filtered.length ? <Box sx={{ p: 5, textAlign: 'center' }}><Typography fontWeight={700}>Aucun utilisateur trouvé</Typography><Button sx={{ mt: 1 }} onClick={() => { setQuery(''); setStatus(''); setRole('') }}>Réinitialiser les filtres</Button></Box> : null}</Card>
  </Box>
}

export function AddUserPage() {
  const { users, roles, groups, addUser } = usePrototypeData()
  const navigate = useNavigate()
  const [directoryCandidates, setDirectoryCandidates] = useState<(typeof demoDirectoryCandidates[number] & { identitySubject?: string })[]>(API_DATA_ENABLED ? [] : demoDirectoryCandidates)
  const available = directoryCandidates.filter((candidate) => !users.some((user) => user.email === candidate.email))
  const [candidateId, setCandidateId] = useState(API_DATA_ENABLED ? '' : available[0]?.id ?? '')
  const [role, setRole] = useState<UserRole>('utilisateur')
  const [groupId, setGroupId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const candidate = available.find((item) => item.id === candidateId)

  useEffect(() => {
    if (!API_DATA_ENABLED) return
    apiFetch<{ results: { subject: string; name: string; email: string; active: boolean }[] }>('/identity/users/directory-candidates/')
      .then((response) => {
        const values = response.results.filter((item) => item.active).map((item) => ({
          id: item.subject, identitySubject: item.subject, name: item.name, email: item.email,
          department: '', title: '', initials: item.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
        }))
        setDirectoryCandidates(values)
        setCandidateId(values[0]?.id ?? '')
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'L’annuaire ne peut pas être interrogé.'))
  }, [])

  const submit = async () => {
    if (!candidate) return
    const user: DirectoryUser = { ...candidate, identitySubject: candidate.identitySubject, status: 'Actif', roles: [role], groups: groupId ? [groupId] : [], lastLogin: 'Jamais' }
    setSaving(true); setError('')
    try {
      const created = await addUser(user)
      navigate(`/administration/utilisateurs/${created.id}`, { replace: true })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'L’utilisateur n’a pas pu être ajouté.')
    } finally { setSaving(false) }
  }

  return <Box sx={{ maxWidth: 900, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}><PageHeading title="Ajouter un utilisateur" description="Sélectionnez un compte existant dans l’annuaire et attribuez ses accès NUMA." />{error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}<Card><Box sx={{ p: 2.5 }}><Typography component="h2" variant="h2">Compte d’annuaire</Typography></Box><Divider /><Stack spacing={2} sx={{ p: 2.5 }}><TextField select label="Utilisateur Active Directory" value={candidateId} onChange={(event) => setCandidateId(event.target.value)}>{available.map((item) => <MenuItem key={item.id} value={item.id}>{item.name} · {item.email}</MenuItem>)}</TextField>{candidate ? <Alert severity="info"><strong>{candidate.title}</strong><br />{candidate.department} · identité gérée par le fournisseur configuré</Alert> : <Alert severity="warning">Aucun candidat disponible.</Alert>}<TextField select label="Rôle initial" value={role} onChange={(event) => setRole(event.target.value as UserRole)}>{roles.map((item) => <MenuItem key={item.id} value={item.id}>{item.label}</MenuItem>)}</TextField><TextField select label="Groupe NUMA" value={groupId} onChange={(event) => setGroupId(event.target.value)}><MenuItem value="">Aucun groupe</MenuItem>{groups.map((group) => <MenuItem key={group.id} value={group.id}>{group.name}</MenuItem>)}</TextField></Stack><Divider /><Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ p: 2.5 }}><Button component={RouterLink} to="/administration/utilisateurs">Annuler</Button><Button variant="contained" disabled={!candidate || saving} onClick={() => void submit()}>{saving ? 'Ajout…' : 'Ajouter à NUMA'}</Button></Stack></Card></Box>
}

export function UserDetailPage() {
  const { id } = useParams()
  const { users, roles, groups, updateUser } = usePrototypeData()
  const user = users.find((item) => item.id === id)
  const [saved, setSaved] = useState(false)
  if (!user) return <Box sx={{ p: 4 }}><Alert severity="error">Utilisateur introuvable.</Alert></Box>
  const toggleRole = (role: UserRole) => updateUser(user.id, { roles: user.roles.includes(role) ? user.roles.filter((item) => item !== role) : [...user.roles, role] })
  const effectivePermissions = [...new Set(roles.filter((role) => user.roles.includes(role.id)).flatMap((role) => role.permissions))]

  return <Box sx={{ maxWidth: 1100, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}><PageHeading title={user.name} description="Identité d’annuaire, rôles et périmètres d’accès." action={<Button variant="contained" onClick={() => setSaved(true)}>Enregistrer</Button>} /><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1.4fr' }, gap: 2 }}><Stack spacing={2}><Card sx={{ p: 2.5 }}><Stack direction="row" spacing={2} alignItems="center"><Avatar sx={{ width: 72, height: 72, bgcolor: 'primary.dark' }}>{user.initials}</Avatar><Box><Typography component="h2" variant="h2">{user.name}</Typography><Typography color="text.secondary">{user.email}</Typography><Chip label="Source · Active Directory" size="small" variant="outlined" sx={{ mt: 1 }} /></Box></Stack><Divider sx={{ my: 2 }} /><Typography variant="body2"><strong>Fonction :</strong> {user.title}</Typography><Typography variant="body2" sx={{ mt: 1 }}><strong>Service :</strong> {user.department}</Typography><Typography variant="body2" sx={{ mt: 1 }}><strong>Dernière connexion :</strong> {user.lastLogin}</Typography><FormControlLabel sx={{ mt: 2 }} control={<Switch checked={user.status === 'Actif'} onChange={(event) => updateUser(user.id, { status: event.target.checked ? 'Actif' : 'Inactif' })} />} label="Compte actif dans NUMA" /></Card><Card sx={{ p: 2.5 }}><Typography component="h2" variant="h3">Groupes</Typography><Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1.5 }}>{groups.filter((group) => user.groups.includes(group.id)).map((group) => <Chip key={group.id} label={group.name} icon={<GroupOutlined />} />)}{!user.groups.length ? <Typography variant="body2" color="text.secondary">Aucun groupe affecté.</Typography> : null}</Stack></Card></Stack><Stack spacing={2}><Card sx={{ p: 2.5 }}><Typography component="h2" variant="h2">Rôles attribués</Typography><Stack sx={{ mt: 1.5 }}>{roles.map((role) => <FormControlLabel key={role.id} control={<Checkbox checked={user.roles.includes(role.id)} onChange={() => toggleRole(role.id)} />} label={<Box><Typography variant="body2" fontWeight={700}>{role.label}</Typography><Typography variant="caption" color="text.secondary">{role.description}</Typography></Box>} />)}</Stack></Card><Card sx={{ p: 2.5 }}><Typography component="h2" variant="h3">Permissions effectives</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Union des permissions accordées par les rôles actifs.</Typography><Stack direction="row" spacing={0.75} flexWrap="wrap" sx={{ mt: 1.5, gap: 0.75 }}>{effectivePermissions.map((permission) => <Chip key={permission} label={permission} size="small" color="primary" variant="outlined" />)}</Stack></Card></Stack></Box><Snackbar open={saved} autoHideDuration={3000} onClose={() => setSaved(false)}><Alert severity="success" variant="filled">Autorisations enregistrées</Alert></Snackbar></Box>
}

export function GroupsPage() {
  const { groups, users, roles, addGroup, updateGroup } = usePrototypeData()
  const [selectedId, setSelectedId] = useState(groups[0]?.id ?? '')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState('')
  const selected = groups.find((group) => group.id === selectedId)
  const create = async () => {
    const id = `grp-${Date.now()}`
    try {
      const created = await addGroup({ id, name: name.trim(), description: 'Groupe métier NUMA', source: 'NUMA', memberIds: [], roleIds: [] })
      setSelectedId(created.id); setName(''); setDialogOpen(false)
    } catch (reason) { window.alert(reason instanceof Error ? reason.message : 'Le groupe n’a pas pu être créé.') }
  }
  const toggleMember = (userId: string) => selected && updateGroup(selected.id, { memberIds: selected.memberIds.includes(userId) ? selected.memberIds.filter((id) => id !== userId) : [...selected.memberIds, userId] })
  return <Box sx={{ maxWidth: 1250, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}><PageHeading title="Groupes" description="Groupes Active Directory synchronisés et groupes métier propres à NUMA." action={<Button variant="contained" startIcon={<Add />} onClick={() => setDialogOpen(true)}>Nouveau groupe NUMA</Button>} /><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '330px minmax(0, 1fr)' }, gap: 2 }}><Card sx={{ alignSelf: 'start' }}>{groups.map((group) => <Box key={group.id}><Button fullWidth onClick={() => setSelectedId(group.id)} sx={{ justifyContent: 'flex-start', p: 2, borderRadius: 0, bgcolor: selectedId === group.id ? 'action.selected' : 'transparent' }}><Box textAlign="left"><Typography fontWeight={700}>{group.name}</Typography><Typography variant="caption" color="text.secondary">{group.source} · {group.memberIds.length} membre(s)</Typography></Box></Button><Divider /></Box>)}</Card>{selected ? <Stack spacing={2}><Card sx={{ p: 2.5 }}><Stack direction="row" justifyContent="space-between"><Box><Typography component="h2" variant="h2">{selected.name}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{selected.description}</Typography></Box><Chip label={selected.source} variant="outlined" /></Stack><Divider sx={{ my: 2 }} /><Typography variant="body2" fontWeight={700}>Rôles hérités</Typography><Stack direction="row" spacing={1} sx={{ mt: 1 }}>{selected.roleIds.map((id) => <Chip key={id} label={roles.find((role) => role.id === id)?.label ?? id} color="primary" variant="outlined" />)}</Stack></Card><Card><Box sx={{ p: 2.5 }}><Typography component="h2" variant="h3">Membres</Typography></Box><Divider /><Stack>{users.map((user) => <FormControlLabel key={user.id} sx={{ px: 2.5, py: 0.75, m: 0, borderBottom: '1px solid', borderColor: 'divider' }} control={<Checkbox checked={selected.memberIds.includes(user.id)} onChange={() => toggleMember(user.id)} />} label={<Stack direction="row" spacing={1.5} alignItems="center"><Avatar sx={{ width: 30, height: 30, fontSize: 11 }}>{user.initials}</Avatar><Box><Typography variant="body2" fontWeight={700}>{user.name}</Typography><Typography variant="caption" color="text.secondary">{user.department}</Typography></Box></Stack>} />)}</Stack></Card></Stack> : null}</Box><Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm"><DialogTitle>Créer un groupe NUMA</DialogTitle><DialogContent><TextField autoFocus fullWidth label="Nom du groupe" value={name} onChange={(event) => setName(event.target.value)} sx={{ mt: 1 }} /><Alert severity="info" sx={{ mt: 2 }}>Les groupes locaux organisent les accès NUMA sans modifier Active Directory.</Alert></DialogContent><DialogActions><Button onClick={() => setDialogOpen(false)}>Annuler</Button><Button variant="contained" disabled={!name.trim()} onClick={create}>Créer</Button></DialogActions></Dialog></Box>
}

export function RolesPage() {
  const { roles } = usePrototypeData()
  const [message, setMessage] = useState('')
  return <Box sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}><PageHeading title="Rôles" description="Profils d’autorisation réutilisables dans les listes et workflows." action={<Button component={RouterLink} to="/administration/permissions" variant="contained" startIcon={<SecurityOutlined />}>Matrice des permissions</Button>} /><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 2 }}>{roles.map((role) => <Card key={role.id} sx={{ p: 2.5 }}><Stack direction="row" justifyContent="space-between"><Avatar sx={{ bgcolor: 'primary.light', color: 'primary.dark' }}><SecurityOutlined /></Avatar>{role.protected ? <Chip label="Rôle système" size="small" /> : null}</Stack><Typography component="h2" variant="h3" sx={{ mt: 2 }}>{role.label}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{role.description}</Typography><Typography variant="caption" display="block" sx={{ mt: 1.5 }}>{role.permissions.length} permission(s)</Typography><Button startIcon={<ContentCopyOutlined />} sx={{ mt: 1 }} onClick={() => setMessage(`Copie de « ${role.label} » préparée en brouillon`)}>Dupliquer</Button></Card>)}</Box><Snackbar open={Boolean(message)} autoHideDuration={3000} onClose={() => setMessage('')}><Alert severity="success" variant="filled">{message}</Alert></Snackbar></Box>
}

export function PermissionsPage() {
  const { roles, updateRolePermissions } = usePrototypeData()
  const editableRoles = roles.filter((role) => !role.protected)
  const toggle = (roleId: UserRole, permission: string) => {
    const role = roles.find((item) => item.id === roleId)
    if (!role) return
    updateRolePermissions(roleId, role.permissions.includes(permission) ? role.permissions.filter((item) => item !== permission) : [...role.permissions, permission])
  }
  return <Box sx={{ maxWidth: 1450, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}><PageHeading title="Permissions fines" description="Matrice des capacités accordées à chaque rôle NUMA." /><Alert severity="warning" sx={{ mb: 2 }}>Les modifications ont un impact sur tous les utilisateurs portant le rôle concerné.</Alert><Card><TableContainer><Table size="small" aria-label="Matrice des permissions"><TableHead><TableRow><TableCell sx={{ minWidth: 190 }}>Permission</TableCell>{editableRoles.map((role) => <TableCell key={role.id} align="center" sx={{ minWidth: 125 }}>{role.label}</TableCell>)}</TableRow></TableHead><TableBody>{allPermissions.map((permission) => <TableRow key={permission} hover><TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}>{permission}</TableCell>{editableRoles.map((role) => <TableCell key={role.id} align="center"><Checkbox inputProps={{ 'aria-label': `${permission} · ${role.label}` }} checked={role.permissions.includes(permission)} onChange={() => toggle(role.id, permission)} /></TableCell>)}</TableRow>)}</TableBody></Table></TableContainer></Card></Box>
}
