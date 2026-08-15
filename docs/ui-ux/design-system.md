# Design system NUMA — fondations v0.1

Le cahier des charges Markdown constitue la source de vérité. Les composants consomment les tokens du thème Material UI ; aucun code hexadécimal de marque ne doit être répété dans les écrans métier.

## Identité

| Token | Valeur | Usage |
|---|---|---|
| `primary.main` | `#123E7C` | Navigation active, action principale, liens importants |
| `primary.dark` | `#0B2447` | Titres forts et variantes sombres |
| `accent.main` | `#20C4C7` | Accent secondaire et focus graphique |
| `background.default` | `#F6F8FC` | Fond de l’application |
| `background.paper` | `#FFFFFF` | Cartes, tableaux, formulaires et modales |
| `text.primary` | `#172033` | Texte principal |
| `text.secondary` | `#64748B` | Texte secondaire |
| `divider` | `#E2E8F0` | Bordures et séparateurs |

Les polices sont embarquées localement : Sora pour les titres, Public Sans pour l’interface et IBM Plex Mono pour les références techniques. Le logo runtime utilise le logo PNG/SVG publié par l’organisation et revient au SVG officiel NUMA lorsqu’aucune personnalisation n’est active.

## Couleurs fonctionnelles

- Succès `#16A34A`, attention `#D97706`, erreur `#DC2626`, information `#2563EB`.
- Interne `#6D5DD3` sur fond `#F0EDFF` ; Externe `#169B62` sur fond `#EAF8F1`.
- Toute information colorée conserve un texte, une icône ou les deux.

## Structure et responsive

- Desktop : navigation horizontale par grands espaces, barre contextuelle et contenu limité à 1400 px.
- Les espaces complexes, notamment Administration, disposeront d’une navigation contextuelle interne.
- Mobile/tablette étroite : navigation hiérarchique dans un tiroir, en-tête de 64 px et contenu sur une colonne.
- Grille d’espacement fondée sur 8 px ; rayon courant de 8 px ; ombres discrètes.
- Focus clavier visible, lien d’évitement vers le contenu et landmarks sémantiques obligatoires.

## Composants validés dans ce lot

- Shell horizontal, menus hiérarchiques, fil d’Ariane, recherche globale, aide, notifications et profil.
- Cartes de registre et indicateurs.
- Badge de statut textuel.
- Panneaux de tâches et d’activité.
- Page d’attente standardisée pour les routes inventoriées.
