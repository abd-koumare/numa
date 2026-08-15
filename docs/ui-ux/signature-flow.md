# Parcours UI/UX de signature NUMA

La signature est toujours déclenchée depuis une tâche ou une version documentaire précise. Le signataire voit le numéro du courrier, la version, l’empreinte et le rendu avant confirmation.

## Niveaux couverts

- **Validation électronique** : identité, action, date, version et empreinte, sans marque visuelle obligatoire.
- **Signature graphique** : dessin, nom typographié ou image importée, consentement et aperçu sur le document.
- **Signature numérique** : certificat, authentification renforcée, empreinte cryptographique et horodatage du prestataire.

## États obligatoires

`Prête → Confirmation → Traitement → Vérifiée` avec variantes `Non habilité`, `Certificat absent`, `Certificat expiré`, `Échec prestataire`, `Annulée`.

Une modification crée une nouvelle version. Les preuves précédentes restent valides pour leur version d’origine mais ne couvrent jamais la nouvelle version.
