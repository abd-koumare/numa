import { Alert, Box, Button, Card, Link, Stack, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'

const sections = [
  {
    id: 'retrouver',
    title: 'Retrouver et consulter un courrier',
    steps: [
      'Dans le menu Courriers, ouvrez le registre des courriers internes (échanges au sein de l’organisation) ou externes (échanges avec vos interlocuteurs extérieurs).',
      'Utilisez la recherche et les filtres du registre pour affiner la liste. La recherche globale permet aussi de retrouver un courrier par sa référence, son objet ou son expéditeur : saisissez au moins deux caractères.',
      'Cliquez sur un courrier pour ouvrir sa fiche, consulter ses informations, ses documents et son historique. Les archives donnent accès aux périodes précédentes selon vos droits.',
    ],
    path: '/courriers',
    action: 'Ouvrir les courriers',
  },
  {
    id: 'creer',
    title: 'Créer et soumettre un courrier',
    steps: [
      'Cliquez sur Nouveau courrier, choisissez le type de courrier et renseignez les champs demandés, notamment l’objet, l’expéditeur et les services concernés.',
      'Ajoutez les pièces jointes utiles et vérifiez l’échéance. Les documents doivent avoir terminé leur contrôle de sécurité avant la soumission.',
      'Choisissez Enregistrer le brouillon pour reprendre la saisie plus tard, ou Soumettre pour lancer le circuit de traitement. Corrigez les champs signalés si la soumission est refusée.',
    ],
    path: '/courriers/nouveau',
    action: 'Créer un courrier',
  },
  {
    id: 'taches',
    title: 'Traiter les tâches et les validations',
    steps: [
      'Ouvrez Mes tâches pour consulter les actions qui vous sont affectées et leurs échéances.',
      'Ouvrez le courrier concerné et examinez les informations ainsi que les pièces jointes avant de prendre une décision.',
      'Utilisez Valider ou Rejeter lorsque ces actions sont disponibles. En cas de rejet, indiquez le motif demandé afin que l’auteur puisse corriger le courrier. Le circuit et les actions disponibles dépendent de la configuration et de vos habilitations.',
    ],
    path: '/taches',
    action: 'Consulter mes tâches',
  },
  {
    id: 'signature',
    title: 'Signer un courrier',
    steps: [
      'Depuis une tâche de signature ou la fiche du courrier, ouvrez l’écran de signature. Le courrier doit être validé et vous devez être habilité à le signer.',
      'Vérifiez le document et sa version, puis suivez les étapes affichées pour le niveau de signature autorisé.',
      'Si la signature est indisponible, consultez le motif affiché. Contactez votre administrateur pour vérifier vos habilitations ou demander la délégation de la tâche, puis revenez sur le courrier.',
    ],
  },
  {
    id: 'notifications',
    title: 'Utiliser les notifications',
    steps: [
      'La cloche affiche les dernières notifications et le nombre de notifications non lues. Cliquez sur une notification de courrier pour ouvrir le courrier concerné.',
      'Choisissez Voir toutes les notifications pour consulter la liste complète. Les onglets Toutes et Non lues et le filtre Type permettent de retrouver une validation, une signature ou une échéance.',
      'Ouvrir une notification la marque comme lue. Tout marquer comme lu met à jour la liste, sans effectuer les validations ou signatures demandées : ces actions restent à traiter dans le courrier.',
    ],
    path: '/notifications',
    action: 'Voir mes notifications',
  },
  {
    id: 'profil',
    title: 'Préférences et difficultés d’accès',
    steps: [
      'Ouvrez Mon profil et préférences depuis le menu de votre compte pour ajuster vos préférences, puis enregistrez les modifications.',
      'Si votre session a expiré, reconnectez-vous. Si un courrier reste inaccessible, demandez à votre administrateur de vérifier son existence et votre accès à ce courrier.',
      'Pour signaler une difficulté au support interne, indiquez la référence du courrier, l’action tentée et le message affiché. Les fonctions d’administration sont réservées aux utilisateurs habilités.',
    ],
    path: '/profil',
    action: 'Ouvrir mon profil',
  },
]

export function HelpPage() {
  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}>
      <Typography component="h1" variant="h1">Aide et guide d’utilisation</Typography>
      <Typography color="text.secondary" sx={{ mt: 1, mb: 2.5 }}>
        Retrouvez les étapes essentielles pour enregistrer, rechercher et traiter vos courriers dans NUMA.
      </Typography>
      <Card component="nav" aria-label="Sommaire de l’aide" sx={{ p: 2.5, mb: 2.5 }}>
        <Typography component="h2" variant="h2" sx={{ mb: 1.5 }}>Dans ce guide</Typography>
        <Stack spacing={1}>
          {sections.map((section) => <Link key={section.id} href={`#${section.id}`}>{section.title}</Link>)}
        </Stack>
      </Card>
      <Alert severity="info" sx={{ mb: 2.5 }}>
        Les menus et actions disponibles dépendent de votre rôle, de vos droits sur le courrier et de son état de traitement.
      </Alert>
      <Stack spacing={2}>
        {sections.map((section) => (
          <Card component="section" key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} sx={{ p: { xs: 2, sm: 3 }, scrollMarginTop: 160 }}>
            <Typography component="h2" variant="h2" id={`${section.id}-title`}>{section.title}</Typography>
            <Box component="ol" sx={{ pl: 2.5, my: 2 }}>
              {section.steps.map((step) => <Typography component="li" key={step} sx={{ mb: 1.25 }}>{step}</Typography>)}
            </Box>
            {section.path ? <Button component={RouterLink} to={section.path} variant="outlined">{section.action}</Button> : null}
          </Card>
        ))}
      </Stack>
    </Box>
  )
}
