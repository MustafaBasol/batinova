# Guide d'administration et contrat technique (cms-admin)

## 1. Matrice des permissions

Toute autorisation est vérifiée côté serveur : `requireRole()` dans chaque page, Server Action et Route Handler
(le layout, le proxy et le masquage des liens ne sont que du confort). Les gestionnaires de routes ajoutent
`assertSameOrigin` pour toute mutation.

| Fonction | ÉDITEUR | PROPRIÉTAIRE |
|---|---|---|
| Tableau de bord | oui (liste de contrôle propriétaire masquée) | oui |
| Pages, articles, réalisations : créer, modifier, publier, programmer, dépublier, dupliquer, restaurer une révision | oui | oui |
| Mise à la corbeille / restauration (contenus, médias, catégories, étiquettes) | oui | oui |
| Suppression définitive (purge de la corbeille) | non | oui |
| Catégories, étiquettes, navigation | oui | oui |
| Médiathèque : import, métadonnées, recadrage, point focal, remplacement | oui | oui |
| Redirections : créer / modifier (301, 302, 308) | oui | oui |
| Redirections : 410 et suppression | non | oui |
| Demandes : lire, statut, notes, renvoyer la notification, télécharger une pièce jointe | oui | oui |
| Demandes : export CSV, anonymiser, supprimer définitivement | non | oui |
| Réglages (identité, logos, e-mails, SEO global, mesure d'audience, conservation) | non | oui |
| Utilisateurs (créer, rôle, désactiver, mot de passe) | non | oui |

Les réglages sont volontairement réservés au PROPRIÉTAIRE, y compris les groupes que `SETTING_EDIT_ROLES`
autoriserait à un éditeur (SEO, réseaux sociaux).

Règles de sécurité transverses : identifiants jamais crus (médias, catégories, éléments de navigation sont revérifiés),
validation zod côté serveur, `audit()` sur chaque mutation (sans données personnelles), dernier PROPRIÉTAIRE actif
protégé (ni rétrogradation, ni désactivation), impossible de désactiver son propre compte, sessions révoquées lors d'un
changement de rôle, de mot de passe ou d'une désactivation.

## 2. Publication

États : BROUILLON, PROGRAMMÉ, PUBLIÉ, ARCHIVÉ (règle unique `publishedWhere`). Heure de saisie : Europe/Paris.
- Programmé : date obligatoire et future. Devient public sans tâche planifiée dès que l'échéance est passée.
- Pour publier : chaque image référencée (couverture, blocs, image dans le texte, image de partage) doit exister,
  ne pas être dans la corbeille et avoir un texte alternatif. Un article publié exige une image de couverture et un contenu.
- Dépublier = retour en brouillon ; la date de première publication est conservée.
- Aperçu privé : `/admin/apercu/{page|article|projet}/{id}` (protégé par session, `noindex`, jamais accessible anonymement),
  rend les mêmes vues que le site public.

## 3. Adresses et redirections

- Slugs français : accents retirés, minuscules, unicité garantie (suffixe `-2`, `-3`…). Les contenus en corbeille réservent leur adresse.
- Pages : 1 à 4 segments, premier segment hors `RESERVED_SEGMENTS`, chemin vide réservé au modèle ACCUEIL (unique).
- Changer l'adresse d'un contenu déjà publié crée une redirection 301 automatique (pages, articles, réalisations, catégories, étiquettes) ;
  les chaînes sont aplaties (A->B->C devient A->C et B->C), toute redirection qui masquerait la nouvelle adresse est supprimée (pas de boucle).
  Un brouillon jamais publié ne crée pas de redirection.
- Redirections manuelles : source et destination validées, boucles refusées, sources système (`/admin`, `/api`, `/media`, `/_next`) interdites.

## 4. Révisions

Chaque enregistrement crée une révision (50 conservées). Restaurer reprend le contenu et le SEO, jamais l'état de publication ni l'adresse,
et crée une nouvelle révision.

## 5. Médiathèque (contrat `src/lib/media/service.ts`)

```ts
createMediaFromBuffer({ buffer, originalName, alt, caption?, credit?, licenseType, licenseSource?, licenseNotes?,
                        isPlaceholder, uploadedById?, declaredMime? }): Promise<Media>
cropMedia(mediaId, { x, y, width, height }, actorId, { unit?: "pixels" | "relative" }): Promise<Media>
setFocalPoint(mediaId, x, y, actorId); replaceMediaFile(mediaId, buffer, actorId?, declaredMime?)
updateMediaMeta, softDeleteMedia, restoreMedia, hardDeleteMedia (refusé si utilisé), findMediaUsages
```
- Contrôles : signature d'octets (`sniffMime`), JPEG/PNG/WebP/AVIF seulement (SVG, GIF, HTML, PDF refusés), type déclaré
  contradictoire refusé, 15 Mo, 40 mégapixels, 16 000 px, images animées refusées. L'image est entièrement décodée puis ré-encodée
  par sharp : charges ajoutées en fin de fichier, EXIF/GPS/XMP/IPTC supprimés, orientation appliquée (`.rotate()`).
- Transparence conservée (logos) : sorties WebP et AVIF uniquement, jamais de JPEG aplati.
- Sorties : `Media.storageKey` = WebP le plus grand (<= 2400 px). `Media.variants` = `{ key, width, height, format: "avif"|"webp" }[]`
  (480, 800, 1200, 1600, 2400 plafonnés à la largeur source, en WebP et AVIF).
- Master privé : copie assainie non recadrée dans le stockage privé (`masters/<storageKey>`). Le recadrage repart toujours du master
  (non destructif) ; `Media.crop = { x, y, width, height, masterKey }` en pixels du master. Les lignes insérées sans master (seeds)
  en reçoivent un à la volée au premier recadrage, à partir de la version stockée.
- Les clés sont immuables (cache `immutable`) : recadrage et remplacement écrivent de nouvelles clés puis suppriment les anciennes.
  Les contenus référencent `Media.id`, donc alt, licence et utilisations survivent.
- Suppression douce autorisée (les usages sont listés) ; suppression définitive : OWNER, après corbeille, et seulement sans aucune utilisation (même en corbeille).
- Envoi : `POST /admin/mediatheque/upload` (session EDITOR+, même origine, limitation de débit 120/10 min/utilisateur,
  `Content-Length` contrôlé avant lecture du corps).

## 6. Pièces jointes des demandes

Stockage privé uniquement ; téléchargement par `GET /admin/demandes/{id}/pieces/{attachmentId}` (session requise, rattachement
au bon lead vérifié, `Content-Disposition: attachment`, `nosniff`, `no-store`, CSP sandbox). Jamais d'URL publique.

## 7. Données personnelles

Export CSV : POST uniquement, OWNER, même origine, audité, cellules neutralisées contre l'injection de formule (préfixe `'` pour `= + - @`, tab, CR).
Anonymiser : conserve date, région, type de projet, statut ; efface identité, message, notes, IP hachée, agent, pièces jointes.
Suppression définitive : ligne et fichiers. Les notes internes et contenus de messages ne sont jamais écrits dans les journaux d'audit.

## 8. Éditeur de texte riche

Tiptap configuré exactement selon `src/lib/richtext/schema.ts` (`src/components/admin/editor/extensions.ts`). Aucun HTML collé n'est conservé
hors liste blanche ; l'enregistrement repasse par `validateRichText()` côté serveur, qui refuse nœuds/marques inconnus, `javascript:`/`data:`,
attributs `style`, `src` d'image.

## 9. Variables et prérequis

Notifications e-mail : actives uniquement si `SMTP_*` + `MAIL_FROM` sont définis sur le serveur **et** si l'interrupteur des réglages est activé.
Le mot de passe SMTP n'est jamais stocké en base. Sans cela, les demandes sont enregistrées et l'administration affiche « E-mail non configuré ».
