import { useState } from 'react'
import DoneAll from '@mui/icons-material/DoneAll'
import NotificationsNone from '@mui/icons-material/NotificationsNone'
import {
  Avatar,
  Box,
  Button,
  Card,
  Chip,
  Divider,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { usePrototypeData } from '../app/PrototypeDataContext'

export function NotificationsPage() {
  const { notifications, markNotificationRead, markAllNotificationsRead } = usePrototypeData()
  const [view, setView] = useState<'all' | 'unread'>('all')
  const [kind, setKind] = useState('')
  const items = notifications.filter((item) => (view === 'all' || !item.read) && (!kind || item.kind === kind))
  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'flex-start' }} spacing={2} sx={{ mb: 2.5 }}>
        <Box>
          <Typography component="h1" variant="h1">Notifications</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Validations, signatures, échéances et événements système.</Typography>
        </Box>
        <Button startIcon={<DoneAll />} onClick={markAllNotificationsRead}>Tout marquer comme lu</Button>
      </Stack>
      <Card sx={{ mb: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }}>
          <Tabs value={view} onChange={(_, value: 'all' | 'unread') => setView(value)} sx={{ flex: 1 }}>
            <Tab value="all" label="Toutes" />
            <Tab value="unread" label="Non lues" />
          </Tabs>
          <TextField select size="small" label="Type" value={kind} onChange={(event) => setKind(event.target.value)} sx={{ minWidth: 190, m: 1.25 }}>
            <MenuItem value="">Tous</MenuItem>
            <MenuItem value="validation">Validations</MenuItem>
            <MenuItem value="signature">Signatures</MenuItem>
            <MenuItem value="deadline">Échéances</MenuItem>
            <MenuItem value="system">Système</MenuItem>
          </TextField>
        </Stack>
      </Card>
      {items.length ? (
        <Card>
          <Stack divider={<Divider flexItem />}>
            {items.map((item) => (
              <Button
                key={item.id}
                component={RouterLink}
                to={item.path}
                color="inherit"
                onClick={() => markNotificationRead(item.id)}
                data-testid="notification-row"
                sx={{
                  height: 'auto',
                  minHeight: 86,
                  alignSelf: 'stretch',
                  p: 2.25,
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  textTransform: 'none',
                  bgcolor: item.read ? 'transparent' : 'action.hover',
                }}
              >
                <Stack direction="row" spacing={2} alignItems="flex-start" width="100%">
                  <Avatar
                    data-testid={item.read ? 'notification-icon-read' : 'notification-icon-unread'}
                    sx={{
                      flexShrink: 0,
                      bgcolor: item.read ? 'action.disabledBackground' : 'primary.main',
                      color: item.read ? 'text.secondary' : 'common.white',
                    }}
                  >
                    <NotificationsNone />
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'flex-start' }} spacing={0.5}>
                      <Typography fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{item.title}</Typography>
                      {!item.read ? <Chip label="Nouvelle" size="small" color="primary" sx={{ alignSelf: 'flex-start' }} /> : null}
                    </Stack>
                    <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{item.detail}</Typography>
                    <Typography variant="caption" color="text.disabled" display="block" sx={{ mt: 0.25 }}>{item.createdAt}</Typography>
                  </Box>
                </Stack>
              </Button>
            ))}
          </Stack>
        </Card>
      ) : (
        <Card sx={{ p: 5, textAlign: 'center' }}>
          <DoneAll color="success" sx={{ fontSize: 52 }} />
          <Typography component="h2" variant="h2" sx={{ mt: 1 }}>Aucune notification</Typography>
          <Typography color="text.secondary">Vous avez traité toutes les notifications de cette vue.</Typography>
        </Card>
      )}
    </Box>
  )
}
