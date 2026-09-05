import { type FormEvent, useState, type ReactNode } from 'react'
import {
  AppBar,
  Avatar,
  Badge,
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined'
import BackupOutlined from '@mui/icons-material/BackupOutlined'
import DashboardOutlined from '@mui/icons-material/DashboardOutlined'
import ExpandMore from '@mui/icons-material/ExpandMore'
import HelpOutline from '@mui/icons-material/HelpOutline'
import HistoryOutlined from '@mui/icons-material/HistoryOutlined'
import HomeOutlined from '@mui/icons-material/HomeOutlined'
import MailOutlined from '@mui/icons-material/MailOutlined'
import MenuIcon from '@mui/icons-material/Menu'
import NotificationsNone from '@mui/icons-material/NotificationsNone'
import Search from '@mui/icons-material/Search'
import SettingsOutlined from '@mui/icons-material/SettingsOutlined'
import TaskAltOutlined from '@mui/icons-material/TaskAltOutlined'
import ViewQuiltOutlined from '@mui/icons-material/ViewQuiltOutlined'
import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined'
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom'
import { getRouteContext, navigation } from '../app/navigation'
import { currentUser } from '../data/dashboard'
import type { NavGroup, NavItem } from '../types/ui'
import { useSiteSettings } from '../app/SiteSettingsContext'
import { BrandLogo } from './BrandLogo'
import { AppFooter } from './AppFooter'
import { useAuth } from '../app/AuthContext'
import { usePrototypeData } from '../app/PrototypeDataContext'

const iconMap: Record<NonNullable<NavItem['icon']>, ReactNode> = {
  home: <HomeOutlined />,
  mail: <MailOutlined />,
  archive: <ArchiveOutlined />,
  tasks: <TaskAltOutlined />,
  settings: <SettingsOutlined />,
  page: <ViewQuiltOutlined />,
  template: <ContentCopyOutlined />,
  workflow: <AccountTreeOutlined />,
  audit: <HistoryOutlined />,
  backup: <BackupOutlined />,
}

type AppShellProps = {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openGroup, setOpenGroup] = useState<NavGroup | null>(null)
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const [profileAnchor, setProfileAnchor] = useState<HTMLElement | null>(null)
  const [notificationAnchor, setNotificationAnchor] = useState<HTMLElement | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const location = useLocation()
  const navigate = useNavigate()
  const context = getRouteContext(location.pathname)
  const theme = useTheme()
  const desktop = useMediaQuery(theme.breakpoints.up('md'))
  const { branding } = useSiteSettings()
  const { logout, session } = useAuth()
  const { notifications, markNotificationRead, navigationEntries } = usePrototypeData()
  const unreadNotifications = notifications.filter((item) => !item.read).length
  const displayUser = session?.user ?? currentUser
  const capabilities = new Set(displayUser.capabilities ?? [])
  const baseNavigationById = new Map<string, NavGroup>([
    ['nav-home', navigation[0]],
    ['nav-mail', { ...navigation[1], children: navigation[1].children?.filter((item) => item.path !== '/taches') }],
    ['nav-tasks', { label: 'Mes tâches', path: '/taches', icon: 'tasks' }],
    ['nav-admin', navigation[2]],
  ])
  const configuredNavigation = navigationEntries.length
    ? navigationEntries
      .filter((entry) => entry.enabled)
      .filter((entry) => entry.visibility !== 'Administrateurs' || capabilities.has('configuration.read'))
      .map((entry) => {
        const base = baseNavigationById.get(entry.id)
        return {
          ...(base ?? { label: entry.label, path: entry.path, icon: 'page' as const }),
          label: entry.label,
          path: entry.path,
        }
      })
    : navigation
  const visibleNavigation = configuredNavigation
    .filter((group) => !group.permissions?.length || group.permissions.some((permission) => capabilities.has(permission)))
    .map((group) => ({
      ...group,
      children: group.children?.filter((item) => !item.permissions?.length || item.permissions.some((permission) => capabilities.has(permission))),
    }))

  const signOut = () => {
    setProfileAnchor(null)
    logout()
    navigate('/connexion', { replace: true })
  }

  const closeGroupMenu = () => {
    setMenuAnchor(null)
    setOpenGroup(null)
  }

  const groupIsActive = (group: NavGroup) => {
    if (group.path === '/') return location.pathname === '/'
    return location.pathname.startsWith(group.path) || Boolean(group.children?.some((item) => location.pathname.startsWith(item.path)))
  }

  const openNavigationMenu = (event: React.MouseEvent<HTMLElement>, group: NavGroup) => {
    setMenuAnchor(event.currentTarget)
    setOpenGroup(group)
  }

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    navigate(`/recherche${searchQuery.trim() ? `?q=${encodeURIComponent(searchQuery.trim())}` : ''}`)
  }

  const brand = (
    <Box
      component={RouterLink}
      to="/"
      aria-label={`Retour à l’accueil ${branding.applicationName}`}
      sx={{ display: 'flex', alignItems: 'center', gap: 1.25, textDecoration: 'none', flexShrink: 0 }}
    >
      <BrandLogo sx={{ width: { xs: 92, lg: 110 }, height: 46 }} />
      <Typography
        variant="caption"
        sx={{
          display: { xs: 'none', lg: 'block' },
          color: 'text.disabled',
          fontWeight: 700,
          letterSpacing: '0.08em',
          whiteSpace: 'nowrap',
        }}
      >
        {branding.organizationName}
      </Typography>
    </Box>
  )

  const mobileDrawer = (
    <Box sx={{ width: 300, height: '100%', bgcolor: 'background.paper' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', height: 72, px: 2.5 }}>{brand}</Box>
      <Divider />
      <Box component="nav" aria-label="Navigation mobile" sx={{ py: 1.5 }}>
        {visibleNavigation.map((group) => (
          <Box key={group.path} sx={{ mb: 0.5 }}>
            <List disablePadding>
              <ListItemButton
                component={RouterLink}
                to={group.path}
                selected={groupIsActive(group)}
                onClick={() => setMobileOpen(false)}
                sx={{ mx: 1.5, borderRadius: 1 }}
              >
                <ListItemIcon sx={{ minWidth: 40, color: 'inherit' }}>{group.icon ? iconMap[group.icon] : null}</ListItemIcon>
                <ListItemText primary={group.label} slotProps={{ primary: { fontWeight: 700 } }} />
              </ListItemButton>
              {group.children?.map((item) => (
                <ListItemButton
                  key={item.path}
                  component={RouterLink}
                  to={item.path}
                  selected={location.pathname === item.path}
                  onClick={() => setMobileOpen(false)}
                  sx={{ mx: 1.5, pl: 4.5, borderRadius: 1 }}
                >
                  <ListItemIcon sx={{ minWidth: 36, color: 'inherit', '& svg': { fontSize: 19 } }}>
                    {item.icon ? iconMap[item.icon] : null}
                  </ListItemIcon>
                  <ListItemText primary={item.label} slotProps={{ primary: { fontSize: 14 } }} />
                </ListItemButton>
              ))}
            </List>
            {group.children ? <Divider sx={{ mx: 2, my: 1 }} /> : null}
          </Box>
        ))}
      </Box>
    </Box>
  )

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Box
        component="a"
        href="#contenu-principal"
        sx={{
          position: 'fixed',
          left: 16,
          top: -80,
          zIndex: 2000,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          px: 2,
          py: 1,
          borderRadius: 1,
          '&:focus': { top: 12 },
        }}
      >
        Aller au contenu
      </Box>

      <AppBar position="fixed" color="inherit" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
        <Toolbar sx={{ minHeight: { xs: 64, md: 72 }, px: { xs: 1.5, md: 3 }, gap: { xs: 1, md: 2.5 } }}>
          <IconButton
            aria-label="Ouvrir le menu"
            onClick={() => setMobileOpen(true)}
            sx={{ display: { md: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          {brand}

          <Box component="nav" aria-label="Navigation principale" sx={{ display: { xs: 'none', md: 'flex' }, alignSelf: 'stretch', ml: 1 }}>
            {visibleNavigation.map((group) => {
              const active = groupIsActive(group)
              if (!group.children) {
                return (
                  <Button
                    key={group.path}
                    component={RouterLink}
                    to={group.path}
                    color="inherit"
                    sx={{
                      minWidth: 0,
                      height: 'auto',
                      alignSelf: 'stretch',
                      px: 1.5,
                      mx: 0.25,
                      borderRadius: 0,
                      borderBottom: '3px solid',
                      borderColor: active ? 'accent.main' : 'transparent',
                      color: active ? 'primary.main' : 'text.secondary',
                      fontFamily: 'Sora, sans-serif',
                    }}
                  >
                    {group.label}
                  </Button>
                )
              }

              return (
                <Button
                  key={group.path}
                  color="inherit"
                  endIcon={<ExpandMore fontSize="small" />}
                  aria-haspopup="menu"
                  aria-expanded={openGroup?.path === group.path ? 'true' : undefined}
                  onClick={(event) => openNavigationMenu(event, group)}
                  sx={{
                    minWidth: 0,
                    height: 'auto',
                    alignSelf: 'stretch',
                    px: 1.5,
                    mx: 0.25,
                    borderRadius: 0,
                    borderBottom: '3px solid',
                    borderColor: active ? 'accent.main' : 'transparent',
                    color: active ? 'primary.main' : 'text.secondary',
                    fontFamily: 'Sora, sans-serif',
                  }}
                >
                  {group.label}
                </Button>
              )
            })}
          </Box>

          <Box sx={{ flex: 1 }} />
          <Box component="form" role="search" onSubmit={submitSearch} sx={{ display: { xs: 'none', xl: 'block' } }}>
            <TextField size="small" type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Rechercher un numéro, un objet…" sx={{ width: 280, '& .MuiOutlinedInput-root': { bgcolor: 'background.default' } }} slotProps={{ htmlInput: { 'aria-label': 'Recherche globale' }, input: { startAdornment: <InputAdornment position="start"><Search color="action" fontSize="small" /></InputAdornment> } }} />
          </Box>
          <Tooltip title="Rechercher">
            <IconButton component={RouterLink} to="/recherche" aria-label="Rechercher" sx={{ display: { xl: 'none' } }}>
              <Search />
            </IconButton>
          </Tooltip>
          <Tooltip title="Notifications">
            <IconButton aria-label="Notifications" aria-haspopup="menu" aria-expanded={Boolean(notificationAnchor)} onClick={(event) => setNotificationAnchor(event.currentTarget)} sx={{ border: { md: '1px solid' }, borderColor: { md: 'divider' }, borderRadius: 1 }}>
              <Badge badgeContent={unreadNotifications} color="error">
                <NotificationsNone />
              </Badge>
            </IconButton>
          </Tooltip>
          <Tooltip title="Aide">
            <IconButton component={RouterLink} to="/aide" aria-label="Aide" sx={{ border: { md: '1px solid' }, borderColor: { md: 'divider' }, borderRadius: 1 }}>
              <HelpOutline />
            </IconButton>
          </Tooltip>
          <Button
            color="inherit"
            aria-label="Ouvrir le menu du profil"
            aria-haspopup="menu"
            aria-expanded={Boolean(profileAnchor)}
            onClick={(event) => setProfileAnchor(event.currentTarget)}
            sx={{ minWidth: 0, px: { xs: 0.5, sm: 1 }, gap: 1, color: 'text.primary' }}
          >
            <Avatar sx={{ width: 36, height: 36, bgcolor: 'primary.dark', fontSize: 12, fontFamily: 'Sora, sans-serif', fontWeight: 700 }}>
              {displayUser.initials}
            </Avatar>
            <Box sx={{ display: { xs: 'none', lg: 'block' }, textAlign: 'left', lineHeight: 1.2 }}>
              <Typography variant="body2" fontWeight={700}>{displayUser.name}</Typography>
              <Typography variant="caption" color="text.disabled">{displayUser.roleLabel}</Typography>
            </Box>
          </Button>
        </Toolbar>

        <Box
          sx={{
            minHeight: { xs: 36, md: 40 },
            px: { xs: 2, md: 3 },
            bgcolor: 'primary.dark',
            color: '#B9C6E2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
          }}
        >
          <Box component="nav" aria-label="Fil d’Ariane" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
            {context.breadcrumbs.map((crumb, index) => (
              <Box key={`${crumb}-${index}`} sx={{ display: 'flex', gap: 0.75, minWidth: 0 }}>
                {index ? <Typography variant="caption" sx={{ color: '#4C6390' }}>›</Typography> : null}
                <Typography
                  variant="caption"
                  noWrap
                  sx={{ color: index === context.breadcrumbs.length - 1 ? '#FFFFFF' : 'inherit', fontWeight: index === context.breadcrumbs.length - 1 ? 700 : 500 }}
                >
                  {crumb}
                </Typography>
              </Box>
            ))}
          </Box>
          <Box
            sx={{
              display: { xs: 'none', sm: 'flex' },
              alignItems: 'center',
              gap: 0.75,
              px: 1.5,
              py: 0.5,
              borderRadius: 4,
              border: '1px solid rgba(255,255,255,0.14)',
              bgcolor: 'rgba(255,255,255,0.08)',
            }}
          >
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'accent.main' }} />
            <Typography variant="caption" sx={{ color: '#FFFFFF', fontWeight: 700 }}>{context.context}</Typography>
          </Box>
        </Box>
      </AppBar>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor && openGroup)}
        onClose={closeGroupMenu}
        slotProps={{ paper: { sx: { minWidth: 230, mt: 0.75 } } }}
      >
        {openGroup?.children?.map((item) => (
          <MenuItem
            key={item.path}
            component={RouterLink}
            to={item.path}
            selected={location.pathname === item.path}
            onClick={closeGroupMenu}
            sx={{ gap: 1.25, minHeight: 44 }}
          >
            <Box sx={{ display: 'flex', color: 'text.secondary', '& svg': { fontSize: 19 } }}>
              {item.icon ? iconMap[item.icon] : null}
            </Box>
            {item.label}
          </MenuItem>
        ))}
      </Menu>

      <Menu
        anchorEl={notificationAnchor}
        open={Boolean(notificationAnchor)}
        onClose={() => setNotificationAnchor(null)}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        slotProps={{ paper: { sx: { width: 340, maxWidth: 'calc(100vw - 24px)' } } }}
      >
        <Box sx={{ px: 2, py: 1.25 }}><Typography fontWeight={700}>Notifications</Typography><Typography variant="caption" color="text.secondary">{unreadNotifications} non lue{unreadNotifications > 1 ? 's' : ''}</Typography></Box>
        <Divider />
        {notifications.slice(0, 3).map((item) => <MenuItem key={item.id} component={RouterLink} to={item.path} onClick={() => { markNotificationRead(item.id); setNotificationAnchor(null) }} sx={{ whiteSpace: 'normal', py: 1.5, bgcolor: item.read ? 'transparent' : 'action.hover' }}><Box><Typography variant="body2" fontWeight={700}>{item.title}</Typography><Typography variant="caption" color="text.secondary">{item.detail}</Typography></Box></MenuItem>)}
        <Divider />
        <MenuItem component={RouterLink} to="/notifications" onClick={() => setNotificationAnchor(null)}>Voir toutes les notifications</MenuItem>
      </Menu>

      <Menu
        anchorEl={profileAnchor}
        open={Boolean(profileAnchor)}
        onClose={() => setProfileAnchor(null)}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <MenuItem component={RouterLink} to="/profil" onClick={() => setProfileAnchor(null)}>Mon profil</MenuItem>
        <MenuItem onClick={() => setProfileAnchor(null)}>Préférences</MenuItem>
        <Divider />
        <MenuItem onClick={signOut}>Se déconnecter</MenuItem>
      </Menu>

      <Drawer
        variant="temporary"
        open={!desktop && mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{ display: { md: 'none' } }}
      >
        {mobileDrawer}
      </Drawer>

      <Box
        id="contenu-principal"
        component="main"
        tabIndex={-1}
        sx={{ flex: 1, pt: { xs: '100px', md: '112px' } }}
      >
        {children}
      </Box>
      <AppFooter />
    </Box>
  )
}
