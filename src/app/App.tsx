import { type ReactNode, useMemo } from 'react'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { DashboardPage } from '../pages/DashboardPage'
import { ModulePlaceholderPage } from '../pages/ModulePlaceholderPage'
import { ExternalRegistryPage } from '../pages/ExternalRegistryPage'
import { CorrespondenceFormPage } from '../pages/CorrespondenceFormPage'
import { CorrespondenceDetailPage } from '../pages/CorrespondenceDetailPage'
import { SignaturePage } from '../pages/SignaturePage'
import { TasksPage } from '../pages/TasksPage'
import { ImportWizardPage } from '../pages/ImportWizardPage'
import { ArchivedInstancePage, ArchivesPage, CorrespondenceOverviewPage } from '../pages/CorrespondenceCatalogPages'
import { InternalRegistryPage } from '../pages/InternalRegistryPage'
import {
  AdministrationOverviewPage,
  ListBuilderPage,
  PageBuilderPage,
  WorkflowBuilderPage,
} from '../pages/AdministrationPages'
import { ActivityPage, GlobalSearchPage } from '../pages/SearchAndActivityPages'
import { IdentityPage, IdentityProvidersPage, ProfilePage, SystemStatesPage } from '../pages/IdentityAndSystemPages'
import { SiteSettingsProvider, useSiteSettings } from './SiteSettingsContext'
import { createNumaTheme } from './theme'
import { SiteBrandingPage } from '../pages/SiteBrandingPage'
import { AuthProvider, sanitizeReturnTo, useAuth } from './AuthContext'
import { PrototypeDataProvider } from './PrototypeDataContext'
import { AddUserPage, GroupsPage, PermissionsPage, RolesPage, UserDetailPage, UsersPage } from '../pages/AccessManagementPages'
import { InstancesManagementPage, ListCreationWizardPage, ListsCatalogPage, NavigationSettingsPage, RuleBuilderPage, RulesCatalogPage, SignaturePoliciesPage, SystemSettingsPage } from '../pages/ConfigurationPages'
import { FieldFormBuilderPage, PagesCatalogPage, TemplateDetailPage, TemplatesCatalogPage, WorkflowsCatalogPage } from '../pages/AdvancedBuilderPages'
import { CompleteAuditPage, CompleteBackupsPage, CompleteOperationsPage } from '../pages/GovernancePages'
import { NotificationsPage } from '../pages/NotificationsPage'
import { PublishedPage } from '../pages/PublishedPage'

function AnonymousOnlyRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()
  const returnTo = sanitizeReturnTo(new URLSearchParams(location.search).get('returnTo'))
  if (isLoading) return null
  return isAuthenticated ? <Navigate to={returnTo} replace /> : children
}

function ProtectedApplication() {
  const { isAuthenticated, isLoading, session } = useAuth()
  const location = useLocation()

  if (isLoading) return null
  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to={`/connexion?returnTo=${encodeURIComponent(returnTo)}`} replace />
  }
  if (session?.user.accessPending) return <Navigate to="/acces-refuse" replace />

  return <PrototypeDataProvider><AppShell><ShellRoutes /></AppShell></PrototypeDataProvider>
}

function ShellRoutes() {
  return (
    <Routes>
          <Route path="/" element={<ConfiguredHomePage />} />
          <Route path="/pages/:slug" element={<PublishedPage />} />
          <Route path="/courriers" element={<CorrespondenceOverviewPage />} />
          <Route path="/courriers/nouveau" element={<CorrespondenceFormPage />} />
          <Route path="/courriers/internes" element={<InternalRegistryPage />} />
          <Route path="/courriers/internes/import" element={<ImportWizardPage registryType="internal" />} />
          <Route path="/courriers/internes/:id/signature" element={<SignaturePage />} />
          <Route path="/courriers/internes/:id/modifier" element={<CorrespondenceFormPage />} />
          <Route path="/courriers/internes/:id" element={<CorrespondenceDetailPage />} />
          <Route path="/archives" element={<ArchivesPage />} />
          <Route path="/archives/:year" element={<ArchivedInstancePage />} />
          <Route path="/courriers/externes" element={<ExternalRegistryPage />} />
          <Route
            path="/courriers/externes/import"
            element={<ImportWizardPage />}
          />
          <Route
            path="/courriers/externes/:id/signature"
            element={<SignaturePage />}
          />
          <Route path="/courriers/externes/:id/modifier" element={<CorrespondenceFormPage />} />
          <Route
            path="/courriers/externes/:id"
            element={<CorrespondenceDetailPage />}
          />
          <Route path="/taches" element={<TasksPage />} />
          <Route path="/activite" element={<ActivityPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/recherche" element={<GlobalSearchPage />} />
          <Route path="/profil" element={<ProfilePage />} />
          <Route path="/administration" element={<AdministrationOverviewPage />} />
          <Route path="/administration/site" element={<SiteBrandingPage />} />
          <Route path="/administration/navigation" element={<NavigationSettingsPage />} />
          <Route path="/administration/utilisateurs" element={<UsersPage />} />
          <Route path="/administration/fournisseurs-identite" element={<IdentityProvidersPage />} />
          <Route path="/administration/utilisateurs/nouveau" element={<AddUserPage />} />
          <Route path="/administration/utilisateurs/:id" element={<UserDetailPage />} />
          <Route path="/administration/groupes" element={<GroupsPage />} />
          <Route path="/administration/roles" element={<RolesPage />} />
          <Route path="/administration/permissions" element={<PermissionsPage />} />
          <Route path="/administration/parametres" element={<SystemSettingsPage />} />
          <Route path="/administration/signatures" element={<SignaturePoliciesPage />} />
          <Route path="/administration/instances" element={<InstancesManagementPage />} />
          <Route path="/administration/listes" element={<ListsCatalogPage />} />
          <Route path="/administration/listes/nouvelle" element={<ListCreationWizardPage />} />
          <Route path="/administration/listes/:id/formulaire" element={<FieldFormBuilderPage />} />
          <Route path="/administration/formulaires/:formId" element={<FieldFormBuilderPage />} />
          <Route path="/administration/listes/:id" element={<ListBuilderPage />} />
          <Route path="/administration/regles" element={<RulesCatalogPage />} />
          <Route path="/administration/regles/nouvelle" element={<RuleBuilderPage />} />
          <Route path="/administration/regles/:id" element={<RuleBuilderPage />} />
          <Route path="/administration/pages" element={<PagesCatalogPage />} />
          <Route path="/administration/pages/:id" element={<PageBuilderPage />} />
          <Route path="/administration/templates" element={<TemplatesCatalogPage />} />
          <Route path="/administration/templates/:id" element={<TemplateDetailPage />} />
          <Route path="/administration/workflows" element={<WorkflowsCatalogPage />} />
          <Route path="/administration/workflows/:id" element={<WorkflowBuilderPage />} />
          <Route path="/administration/audit" element={<CompleteAuditPage />} />
          <Route path="/administration/sauvegardes" element={<CompleteBackupsPage />} />
          <Route path="/administration/exploitation" element={<CompleteOperationsPage />} />
          <Route path="/administration/etats-systeme" element={<SystemStatesPage />} />
          <Route
            path="*"
            element={<ModulePlaceholderPage title="Page introuvable" description="La page demandée n’existe pas ou a été déplacée." />}
          />
    </Routes>
  )
}

function ConfiguredHomePage() {
  const { branding, loading } = useSiteSettings()
  if (loading) return null
  if (branding.defaultHome === 'tasks') return <Navigate to="/taches" replace />
  if (branding.defaultHome === 'correspondence') return <Navigate to="/courriers" replace />
  if (branding.defaultHome === 'page' && branding.homePageSlug) return <PublishedPage slug={branding.homePageSlug} />
  return <DashboardPage />
}

function ConfiguredApplication() {
  const { branding } = useSiteSettings()
  const theme = useMemo(() => createNumaTheme({
    primaryColor: branding.primaryColor,
    accentColor: branding.accentColor,
    fontFamily: branding.fontFamily,
  }), [branding.primaryColor, branding.accentColor, branding.fontFamily])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/connexion" element={<AnonymousOnlyRoute><IdentityPage mode="login" /></AnonymousOnlyRoute>} />
            <Route path="/mfa" element={<AnonymousOnlyRoute><IdentityPage mode="mfa" /></AnonymousOnlyRoute>} />
            <Route path="/acces-refuse" element={<IdentityPage mode="denied" />} />
            <Route path="/session-expiree" element={<IdentityPage mode="expired" />} />
            <Route path="*" element={<ProtectedApplication />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}

export function App() {
  return (
    <SiteSettingsProvider>
      <ConfiguredApplication />
    </SiteSettingsProvider>
  )
}
