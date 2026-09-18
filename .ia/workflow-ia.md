# Workflow obligatoire pour tout assistant IA

Règle permanente, valable pour toute tâche (feature, fix, refactor) :

**Après chaque fonctionnalité développée, l'assistant IA doit mettre à
jour le dossier `.ia/` avant de considérer la tâche terminée.**

Concrètement, à la fin de chaque tâche :

1. `status.md` — mettre à jour la date et le résumé si l'état du projet
   a changé (nouvelle fonctionnalité livrée, nouveau problème connu,
   étape de déploiement franchie).
2. `contexte-projet.md` — ajouter/ajuster la fonctionnalité si le
   périmètre fonctionnel a changé.
3. `architecture.md` — mettre à jour si de nouveaux fichiers/dossiers
   structurants, une nouvelle dépendance ou un changement de schéma de
   données ont été introduits.
4. `decisions.md` — ajouter une entrée (en haut du fichier, format
   existant : contexte / décision / alternatives écartées / pourquoi)
   si un choix technique structurant a été fait. Une fonctionnalité
   mineure sans ambiguïté de conception n'a pas besoin d'entrée.
5. `agents.md` — mettre à jour uniquement si une nouvelle contrainte
   produit ou une nouvelle règle de travail permanente apparaît.

**Pourquoi** : ce dossier est le seul moyen pour un futur assistant IA
(ou une future session) de retrouver le contexte réel du projet sans
relire tout l'historique Git ou deviner à partir du code. Un `.ia/`
qui prend du retard perd sa valeur et fait perdre du temps à tout le
monde.

Si une tâche est trop mineure pour justifier une mise à jour (ex :
typo, style CSS ponctuel), il est acceptable de ne rien changer — mais
cette décision doit être volontaire, pas un oubli.
