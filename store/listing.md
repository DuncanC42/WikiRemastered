# Fiche Chrome Web Store : WikiRemastered

Tout ce qu’il faut pour remplir la fiche dans le [tableau de bord développeur](https://chrome.google.com/webstore/devconsole), dans l’ordre des onglets.

## À téléverser

| Élément | Fichier |
|---|---|
| Paquet de l’extension | `dist/WikiRemastered-1.31.0-chrome-web-store.zip` (produit par `python3 scripts/package.py` ; `manifest.json` est à la racine, comme la boutique l’exige) |
| Icône de la boutique (128 × 128) | `store/images/icon-128.png` |
| Petite vignette promotionnelle (440 × 280, obligatoire) | `store/images/promo-small-440x280.png` |
| Grande vignette (1400 × 560, facultative) | `store/images/promo-marquee-1400x560.png` |
| Captures d’écran (1280 × 800, 5 au plus) | Dans cet ordre : `store/images/screenshot-1-paquet.png`, `screenshot-2-ouverture.png`, `screenshot-5-fiche.png`, `screenshot-7-marche.png`, `screenshot-8-collection.png`. En réserve : `-3-revelation`, `-4-recapitulatif`, `-6-paquet-sombre`. |

Les images se refont avec `node scripts/brand.mjs`, `sh scripts/brand-png.sh` et `node scripts/store-shots.mjs` (captures 1 à 6, prises dans le labo avec des paquets simulés). Les captures 7 et 8 (Marché + et Collection +) viennent du vrai site, ramenées à 1280 × 800.

## Fiche

**Nom** (dans le manifeste) : WikiRemastered pour Wiki Masters

**Résumé** (132 caractères au plus, repris du manifeste) :
Thème graphite, ouvertures de paquets en 3D, collection enrichie, marché et paquets AFK pour Wiki Masters. Extension non officielle.

**Catégorie** : Style de vie › Jeux

**Langue** : Français

**Description** :

> WikiRemastered donne une nouvelle peau et de nouveaux outils à Wiki Masters, le jeu de cartes Wikipédia (wiki-masters.com).
>
> Ouvrir un paquet devient un moment : le paquet arrive en 3D, se découpe d’un geste avec une petite paire de ciseaux, laisse filer une lumière et des pièces de puzzle aux couleurs des cartes qu’il contient, puis les cartes sortent et se révèlent une à une, les plus rares avec leur mise en scène. Trois designs de paquet au choix (puzzle illustré, foil sombre ou visuel d’origine), un mode Anti-spoil qui ne trahit rien avant le retournement, et une fiche pour chaque carte, sans quitter l’ouverture.
>
> Et aussi :
> • un thème graphite soigné pour tout le site ;
> • Collection + : doublons regroupés, vues et prix estimés, défausse protégée des cartes engagées dans un échange ;
> • Marché + : vues sur 30 jours et prix estimés sous les enchères, filtres, enchère programmée à la dernière minute avec un plafond ;
> • ouvertures AFK : un paquet est ouvert quand le stock atteint 10/10, pour ne jamais en perdre, avec l’historique des cartes obtenues ;
> • succès automatiques.
>
> Tout fonctionne dans votre navigateur, sur wiki-masters.com uniquement, avec votre propre session. Aucune donnée n’est envoyée ailleurs.
>
> WikiRemastered est une extension non officielle, réalisée par un joueur. Elle n’est ni éditée ni approuvée par Wiki Masters.

## Confidentialité

**Objectif unique** :
Améliorer l’interface et l’expérience du jeu Wiki Masters sur wiki-masters.com : thème du site, ouverture des paquets, outils de collection et de marché.

**Justification des autorisations** :

| Autorisation | Justification |
|---|---|
| `storage` | Garder localement les préférences (son, vitesse, design du paquet, Anti-spoil, réglages de la collection et du marché), un cache de la collection et des prix pour éviter des requêtes répétées, et l’historique des ouvertures AFK. |
| `alarms` | Vérifier une fois par minute, quand les ouvertures AFK sont activées, si le stock de paquets a atteint 10/10. |
| Accès à `https://www.wiki-masters.com/*` et `https://wiki-masters.com/*` | Le thème et les outils s’affichent sur ce site, et l’extension y lit la collection et le marché de l’utilisateur par les routes du site, avec sa session. Aucun autre site n’est concerné. |

**Code distant** : Non. Tout le code est dans le paquet.

**Utilisation des données** (cases à cocher) : l’extension manipule du « contenu de site web » (la collection, le marché et les paquets de l’utilisateur sur wiki-masters.com), uniquement dans le navigateur. Elle ne collecte, ne vend et ne transmet aucune donnée au développeur ni à un tiers. Cocher les trois certifications (pas de vente, pas d’usage sans rapport avec l’objectif, pas d’usage pour la solvabilité).

**Règles de confidentialité** : https://lypningeuh.github.io/WikiRemastered/store/privacy.html (publié par GitHub Pages depuis `store/privacy.md` ; si besoin, la version GitHub : https://github.com/Lypningeuh/WikiRemastered/blob/main/store/privacy.md).

## À vérifier avant de publier

- **Automatisations** : les ouvertures AFK et l’enchère programmée agissent dans le jeu sans clic de l’utilisateur au moment de l’action. Vérifier que le règlement de Wiki Masters le permet ; la boutique refuse les extensions qui aident à enfreindre les conditions d’un autre service. En cas de doute, publier une version sans ces deux fonctions, ou demander l’accord de l’éditeur du jeu.
- **Nom et marque** : « Wiki Masters » est le nom du jeu. La fiche le cite pour dire à quoi sert l’extension et précise qu’elle est non officielle ; ne pas utiliser le logo du jeu dans les visuels de la fiche.
- **Compte développeur** : inscription unique de 5 $ et vérification de l’adresse e-mail.
- **Version** : chaque nouvel envoi doit avoir un numéro de version plus élevé dans `manifest.json`.
