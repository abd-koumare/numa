import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { DashboardPage } from '../pages/DashboardPage'
import { ModulePlaceholderPage } from '../pages/ModulePlaceholderPage'
import { ExternalRegistryPage } from '../pages/ExternalRegistryPage'
import { CorrespondenceFormPage } from '../pages/CorrespondenceFormPage'
import { CorrespondenceDetailPage } from '../pages/CorrespondenceDetailPage'
import { SignaturePage } from '../pages/SignaturePage'
import { TasksPage } from '../pages/TasksPage'
import { ImportWizardPage } from '../pages/ImportWizardPage'
import { ArchivesPage, CorrespondenceOverviewPage } from '../pages/CorrespondenceCatalogPages'
import { InternalRegistryPage } from '../pages/InternalRegistryPage'
import {
  AdministrationOverviewPage,
  AuditPage,
  BackupsPage,
  ListBuilderPage,
  OperationsPage,
  PageBuilderPage,
  TemplatesPage,
  WorkflowBuilderPage,
} from '../pages/AdministrationPages'
import { ActivityPage, GlobalSearchPage } from '../pages/SearchAndActivityPages'
import { IdentityPage, ProfilePage, SystemStatesPage } from '../pages/IdentityAndSystemPages'
import { SiteSettingsProvider } from './SiteSettingsContext'
import { SiteBrandingPage } from '../pages/SiteBrandingPage'

function ShellRoutes() {
  return (
    <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/courriers" element={<CorrespondenceOverviewPage />} />
          <Route path="/courriers/nouveau" element={<CorrespondenceFormPage />} />
          <Route path="/courriers/internes" element={<InternalRegistryPage />} />
          <Route path="/courriers/internes/import" element={<ImportWizardPage registryType="internal" />} />
          <Route path="/courriers/internes/:id/signature" element={<SignaturePage />} />
          <Route path="/courriers/internes/:id" element={<CorrespondenceDetailPage />} />
          <Route path="/archives" element={<ArchivesPage />} />
          <Route path="/courriers/externes" element={<ExternalRegistryPage />} />
          <Route
            path="/courriers/externes/import"
            element={<ImportWizardPage />}
          />
          <Route
            path="/courriers/externes/:id/signature"
            element={<SignaturePage />}
          />
          <Route
            path="/courriers/externes/:id"
            element={<CorrespondenceDetailPage />}
          />
          <Route path="/taches" element={<TasksPage />} />
          <Route path="/activite" element={<ActivityPage />} />
          <Route path="/recherche" element={<GlobalSearchPage />} />
          <Route path="/profil" element={<ProfilePage />} />
          <Route path="/administration" element={<AdministrationOverviewPage />} />
          <Route path="/administration/site" element={<SiteBrandingPage />} />
          <Route path="/administration/listes" element={<ListBuilderPage />} />
          <Route path="/administration/pages" element={<PageBuilderPage />} />
          <Route path="/administration/templates" element={<TemplatesPage />} />
          <Route path="/administration/workflows" element={<WorkflowBuilderPage />} />
          <Route path="/administration/audit" element={<AuditPage />} />
          <Route path="/administration/sauvegardes" element={<BackupsPage />} />
          <Route path="/administration/exploitation" element={<OperationsPage />} />
          <Route path="/administration/etats-systeme" element={<SystemStatesPage />} />
          <Route
            path="*"
            element={<ModulePlaceholderPage title="Page introuvable" description="La page demandée n’existe pas ou a été déplacée." />}
          />
    </Routes>
  )
}

export function App() {
  return (
    <SiteSettingsProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/connexion" element={<IdentityPage mode="login" />} />
          <Route path="/mfa" element={<IdentityPage mode="mfa" />} />
          <Route path="/acces-refuse" element={<IdentityPage mode="denied" />} />
          <Route path="/session-expiree" element={<IdentityPage mode="expired" />} />
          <Route path="*" element={<AppShell><ShellRoutes /></AppShell>} />
        </Routes>
      </BrowserRouter>
    </SiteSettingsProvider>
  )
}
