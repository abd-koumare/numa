import type { DocumentVersion, SignatureProof, WorkflowStep, WorkflowTask } from '../types/ui'

export const documentVersions: DocumentVersion[] = [
  {
    id: 'doc-notification-v3',
    version: 3,
    fileName: 'notification-livraison-lot-3.pdf',
    mimeType: 'application/pdf',
    size: '1,8 Mo',
    createdAt: '13/08/2026 à 09:14',
    author: 'Kader Yao',
    sha256: '8f2a74c933a52b16…c19d',
    status: 'Signée',
  },
  {
    id: 'doc-notification-v2',
    version: 2,
    fileName: 'notification-livraison-lot-3.pdf',
    mimeType: 'application/pdf',
    size: '1,7 Mo',
    createdAt: '12/08/2026 à 16:32',
    author: 'Mariam Diarra',
    sha256: '730e2b28b19f3301…1a4b',
    status: 'Remplacée',
  },
]

export const workflowSteps: WorkflowStep[] = [
  { id: 'draft', label: 'Brouillon', actor: 'Kader Yao', status: 'Terminée', completedAt: '13/08/2026 · 09:14' },
  { id: 'submitted', label: 'Soumission', actor: 'Kader Yao', status: 'Terminée', completedAt: '13/08/2026 · 09:20' },
  { id: 'manager', label: 'Chef de service', actor: 'Mariam Diarra', status: 'Terminée', completedAt: '13/08/2026 · 10:05', comment: 'Conforme au bon de commande.' },
  { id: 'director', label: 'Direction', actor: 'Awa Kouassi', status: 'En cours' },
  { id: 'signature', label: 'Signature', actor: 'Kader Yao', status: 'À venir' },
  { id: 'registered', label: 'Enregistrement', actor: 'Système', status: 'À venir' },
  { id: 'archived', label: 'Archivage', actor: 'Service courrier', status: 'À venir' },
]

export const existingSignatureProofs: SignatureProof[] = [
  {
    id: 'sig-awa-v3',
    documentVersionId: 'doc-notification-v3',
    level: 'graphic',
    status: 'verified',
    signer: 'Awa Kouassi',
    signerRole: 'Directrice Technique',
    signedAt: '13/08/2026 · 10:42',
    documentHash: 'sha256:8f2a74c933a52b16…c19d',
    ipAddress: '10.12.4.51',
  },
]

export const workflowTasks: WorkflowTask[] = [
  { id: 'task-1', reference: 'EXT-0052/2026', subject: 'Demande de subvention 2026', requester: 'Mariam Diarra', requestedAt: 'Aujourd’hui · 08:45', dueAt: 'Aujourd’hui · 17:00', kind: 'Validation', priority: 'Urgente', status: 'À faire' },
  { id: 'task-2', reference: 'EXT-0040/2026', subject: 'Notification de livraison — Lot 3', requester: 'Awa Kouassi', requestedAt: 'Hier · 16:20', dueAt: 'Aujourd’hui · 12:00', kind: 'Signature', priority: 'Haute', status: 'En retard' },
  { id: 'task-3', reference: 'EXT-0048/2026', subject: 'Signalement de pollution industrielle', requester: 'Service courrier', requestedAt: '12/08/2026 · 11:10', dueAt: '15/08/2026 · 17:00', kind: 'Traitement', priority: 'Urgente', status: 'À faire' },
  { id: 'task-4', reference: 'EXT-0046/2026', subject: 'Consultation sur un projet de loi', requester: 'Direction juridique', requestedAt: '11/08/2026 · 14:05', dueAt: '14/08/2026 · 12:00', kind: 'Validation', priority: 'Haute', status: 'Terminée' },
]
