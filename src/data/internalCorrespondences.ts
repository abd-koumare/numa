import type { Correspondence } from '../types/ui'
import { externalCorrespondences } from './correspondences'

const internalSubjects = [
  'Note de service — Congés août',
  'Demande de matériel informatique',
  'Compte rendu du comité de direction',
  'Mise à jour de la procédure achats',
  'Plan de formation du second semestre',
  'Avis de réunion du comité sécurité',
  'Demande de recrutement temporaire',
  'Transmission des prévisions budgétaires',
  'Rapport mensuel de disponibilité SI',
  'Instruction relative aux déplacements',
  'Demande d’avis juridique interne',
  'Notification de changement d’affectation',
  'Inventaire du parc informatique',
  'Compte rendu de mission régionale',
  'Proposition de campagne institutionnelle',
  'Demande d’ouverture de crédits',
  'Mise à jour du plan de continuité',
  'Note relative aux horaires exceptionnels',
]

const internalServices = [
  'Direction générale',
  'Ressources humaines',
  'Direction financière',
  'Direction des achats',
  'Direction des systèmes d’information',
  'Secrétariat général',
]

export const internalCorrespondences: Correspondence[] = externalCorrespondences.map((item, index) => ({
  ...item,
  id: `int-${String(187 - index).padStart(4, '0')}-2026`,
  reference: `INT-${String(187 - index).padStart(4, '0')}/2026`,
  subject: internalSubjects[index],
  sender: internalServices[index % internalServices.length],
  confidentiality: index === 5 || index === 10 ? 'Restreint' : item.confidentiality,
}))
