# EuroLeague pour Gladys Assistant

Suivez vos clubs de basket d'EuroLeague et d'EuroCup dans Gladys : score en direct, prochain
match, dernier résultat, bilan de la saison, et des scènes quand un match commence, quand le
leader change ou quand il se termine.

Les scores viennent de l'API publique d'Euroleague Basketball, celle de ses sites officiels : pas
de compte, pas de clé d'API.

## Installation

1. Installez l'intégration depuis le catalogue de Gladys.
2. Dans **Configuration**, écrivez les clubs à suivre dans le champ **Équipes**, avec leur code,
   séparés par des virgules : `ASV, PRS, MCO`.
3. Pas sûr d'un code ? Cliquez sur **Trouver une équipe**, choisissez la compétition, tapez une
   partie du nom (par ex. `Paris`) et copiez le code affiché.
4. Cliquez sur **Tester les équipes** : chaque club est listé avec son match en cours ou à venir.
5. Ouvrez l'onglet **Découverte** et créez les appareils.

## Codes des clubs

Un club s'écrit avec son code Euroleague, celui de l'adresse de sa page sur
euroleaguebasketball.net. Le code TV affiché sur le tableau de score et le nom court
fonctionnent aussi.

| Code | Club (exemples de la saison 2026-27) |
| ---- | ------------------------------------ |
| ASV  | LDLC ASVEL Villeurbanne              |
| PAR  | Partizan Mozzart Bet Belgrade        |
| MCO  | AS Monaco                            |
| PRS  | Paris Basketball                     |
| PAN  | Panathinaikos AKTOR Athens           |
| OLY  | Olympiacos Piraeus                   |
| MAD  | Real Madrid                          |
| BAR  | FC Barcelona                         |

La liste change à chaque saison : **Trouver une équipe** montre toujours les clubs de la saison
en cours.

### Clubs d'EuroCup

Les entrées sans préfixe appartiennent à la **Compétition par défaut** de la configuration
(EuroLeague sauf si vous la changez). Préfixez un club de l'autre compétition : `U:` pour
l'EuroCup, `E:` pour l'EuroLeague. Exemple : `ASV, U:BES` suit l'ASVEL en EuroLeague et Beşiktaş
en EuroCup.

## Les appareils

Chaque club devient un appareil avec ces fonctionnalités :

| Fonctionnalité       | Contenu                                                    |
| -------------------- | ---------------------------------------------------------- |
| Score                | Le score du club dans le match en cours (0 avant le début) |
| Score adverse        | Le score de l'adversaire                                   |
| Match                | `En direct · QT3 05:23 · Panathinaikos 61 – 58 Partizan`   |
| Prochain match       | `ven. 30 oct., 20:00 · à Olympiacos`                       |
| Dernier résultat     | `Victoire · Panathinaikos 85 – 78 Real Madrid`             |
| Victoires / Défaites | Le bilan du club dans la compétition cette saison          |

Après un match, le résultat reste le match « en cours » jusqu'au lendemain matin, puis le
prochain match prend sa place.

## Scènes

Déclencheurs, chacun filtrable par club et par domicile ou extérieur :

- **Match bientôt** — le nombre de minutes configuré avant le coup d'envoi (30 par défaut).
- **Match commencé** — le coup d'envoi.
- **Changement de leader** — l'avance a changé de camp (filtre sur qui mène désormais). Une
  égalité entre-temps n'est pas un changement, le premier panier du match non plus.
- **Match terminé** — avec le résultat (filtre sur victoire ou défaite).

Leurs variables (`{{triggerEvent.data.summary}}`, `team_score`, `opponent_score`, `opponent`,
`round`…) sont utilisables dans les actions suivantes, par ex. une notification
`{{triggerEvent.data.summary}}`.

L'action **Lire le match d'une équipe** donne aux actions suivantes l'état du match (`pre`, `in`,
`post`), les scores, le résultat, le bilan de la saison et le prochain match.

## Tableau de bord

- **Match d'une équipe** — un club : score en direct, chrono, coup d'envoi, adversaire, dernier
  résultat, prochain match, bilan.
- **Mes équipes** — tous les clubs suivis avec leur logo : les matchs en direct d'abord, puis les
  prochains coups d'envoi.

## Rythme d'actualisation

- Pendant un match : toutes les **Actualisation pendant un match** secondes (30 par défaut).
- Sinon : toutes les **Actualisation entre les matchs** minutes (15 par défaut), et pile au rappel
  avant le coup d'envoi et au coup d'envoi.

## Dépannage

- **« Non suivis : XYZ »** dans l'état de connexion : cliquez sur **Tester les équipes**, il dit
  pourquoi (code inconnu, compétition, API qui ne répond pas).
- **Badge injoignable** sur un appareil : l'API Euroleague n'a pas répondu ; le dernier match connu
  est conservé et l'intégration réessaie à la lecture suivante.
- En juillet et août, avant la publication du nouveau calendrier, les appareils montrent la fin de
  la saison précédente.

L'API Euroleague est publique mais non documentée : Euroleague Basketball peut la modifier sans
préavis. Cette intégration n'est ni affiliée ni approuvée par Euroleague Basketball.
