// Blog seed (seo-content). CREATE-IF-MISSING ONLY: match by slug, never overwrite owner edits, never restore
// soft-deleted rows. Seeded posts are ordinary editable posts (status DRAFT: the owner reviews and publishes).
//
// Editorial rules (docs/CONTENT_REQUIREMENTS.md): original French copy, neutral expert voice, NO figures
// (prices, durations, percentages), NO regulatory thresholds stated as fact, NO guarantees, NO invented
// experience / projects / clients. Cover images are CC0 stock illustrations (media rows flagged isPlaceholder).
import { estimateReadingMinutes, richTextToPlainText, countWords, validateRichText } from "../../src/lib/richtext/schema";
import type { SeedContext } from "./client";
import { mediaIdByName, seedMedia } from "./media";

// ---------------------------------------------------------------- Tiptap helpers
type Mark = { type: string; attrs?: Record<string, unknown> };
type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[]; text?: string; marks?: Mark[] };
const t = (text: string, marks?: Mark[]): Node => ({ type: "text", text, ...(marks ? { marks } : {}) });

/** Mini inline syntax: **gras** and [[texte du lien|/chemin-ou-https://url]]. */
function inline(s: string): Node[] {
  const out: Node[] = [];
  const re = /\*\*(.+?)\*\*|\[\[(.+?)\|(.+?)\]\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(t(s.slice(last, m.index)));
    if (m[1]) out.push(t(m[1], [{ type: "bold" }]));
    else out.push(t(m[2]!, [{ type: "link", attrs: { href: m[3], nofollow: false } }]));
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(t(s.slice(last)));
  return out;
}
const p = (s: string): Node => ({ type: "paragraph", content: inline(s) });
const h2 = (s: string): Node => ({ type: "heading", attrs: { level: 2 }, content: [t(s)] });
const h3 = (s: string): Node => ({ type: "heading", attrs: { level: 3 }, content: [t(s)] });
const ul = (...items: string[]): Node => ({ type: "bulletList", content: items.map((i) => ({ type: "listItem", content: [p(i)] })) });
const retenir = (...c: Node[]): Node => ({ type: "callout", attrs: { variant: "retenir" }, content: c });
const image = (mediaId: string, alt: string, caption: string): Node => ({ type: "image", attrs: { mediaId, alt, caption, size: "medium" } });
const doc = (...content: Node[]) => ({ type: "doc", content });

// ---------------------------------------------------------------- taxonomy
const CATEGORIES = [
  { slug: "conseils-renovation", name: "Conseils rénovation", description: "Repères et conseils pour préparer, organiser et réussir un projet de rénovation de maison ou d’appartement." },
  { slug: "construction", name: "Construction", description: "Construction neuve et extension : terrain, conception, étapes clés et choix techniques à anticiper." },
  { slug: "budget-travaux", name: "Budget et travaux", description: "Postes de dépense, devis, financement et suivi : construire un budget travaux réaliste." },
  { slug: "demarches", name: "Démarches", description: "Autorisations, démarches administratives et points à vérifier avant de lancer des travaux." },
  { slug: "realisations", name: "Réalisations", description: "Présentation de chantiers et de réalisations, avec leurs enjeux et leurs choix." },
] as const;

const TAGS = [
  { slug: "renovation", name: "Rénovation" },
  { slug: "extension", name: "Extension" },
  { slug: "budget", name: "Budget" },
  { slug: "planification", name: "Planification" },
  { slug: "autorisations", name: "Autorisations" },
  { slug: "chantier", name: "Chantier" },
] as const;

// ---------------------------------------------------------------- articles
const SLUG_1 = "preparer-projet-renovation-maison-etapes-cles";
const SLUG_2 = "extension-de-maison-questions-avant-de-se-lancer";
const SLUG_3 = "planifier-budget-travaux-postes-a-anticiper";

interface SeedPost {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  excerpt: string;
  category: string;
  tags: string[];
  cover: string; // stock file name
  build: (ids: { bodyImage?: string }) => unknown;
  bodyImageFile?: string;
}

const POSTS: SeedPost[] = [
  {
    slug: SLUG_1,
    title: "Préparer un projet de rénovation de maison : les étapes clés",
    metaTitle: "Rénovation de maison : les étapes clés",
    metaDescription:
      "Besoins, état du bâti, budget, autorisations, devis, chantier : les étapes clés pour préparer sereinement la rénovation de votre maison.",
    excerpt:
      "Clarifier ses besoins, faire le point sur le bâti, cadrer le budget, vérifier les démarches, comparer les devis puis organiser le chantier : un fil conducteur en sept étapes pour aborder une rénovation dans le bon ordre.",
    category: "conseils-renovation",
    tags: ["renovation", "planification", "chantier", "autorisations"],
    cover: "fenetre-bois-facade-brique-ancienne.jpg",
    bodyImageFile: "echafaudage-filet-vert-facade-chantier.jpg",
    build: ({ bodyImage }) =>
      doc(
        h2("Pourquoi une rénovation se prépare bien avant le premier coup de marteau"),
        p("Rénover une maison, c’est rarement un simple enchaînement de chantiers. Entre l’état du bâti, les envies de chacun, le budget disponible et les contraintes administratives, chaque décision en entraîne d’autres. Les projets qui se déroulent le plus sereinement sont souvent ceux qui ont été préparés dans l’ordre : on comprend d’abord, on décide ensuite, on consulte enfin."),
        p("Cet article propose un fil conducteur en sept étapes pour structurer votre réflexion. Il ne remplace ni l’avis d’un professionnel qui visite votre logement, ni les renseignements à prendre auprès de votre commune : il vous aide surtout à poser les bonnes questions au bon moment."),

        h2("Étape 1 : clarifier vos besoins et vos priorités"),
        p("Avant de parler de matériaux ou de budget, formulez ce que vous attendez de la rénovation. Cherchez-vous plus de confort, plus de lumière, un meilleur agencement, une maison mieux isolée, ou un peu de tout cela ? Mettre des mots sur l’objectif évite de se disperser et facilite les arbitrages quand il faudra choisir."),
        h3("Partir de l’usage du lieu"),
        p("Observez comment vous vivez dans la maison aujourd’hui : quelles pièces sont peu utilisées, lesquelles sont saturées, où circule-t-on mal, où manque-t-il de rangements. Pensez aussi à l’avenir proche : arrivée d’un enfant, télétravail, besoin d’un espace accessible, projet de louer une partie du logement."),
        h3("Distinguer l’indispensable du souhaitable"),
        p("Une liste hiérarchisée est un outil très simple et très efficace. Classez vos envies en trois catégories :"),
        ul(
          "**Indispensable** : ce qui conditionne la sécurité, la salubrité ou la tenue du bâtiment ;",
          "**Important** : ce qui améliore nettement le quotidien ou les performances de la maison ;",
          "**Confort supplémentaire** : ce qui peut être décalé ou réalisé plus tard si le budget l’impose.",
        ),
        p("Cette hiérarchie sera précieuse au moment de comparer les devis et d’ajuster le projet."),

        h2("Étape 2 : faire le point sur l’état du bâti"),
        p("Une rénovation réussie s’appuie sur une lecture honnête du bâtiment existant. Les surprises les plus coûteuses viennent souvent de ce que l’on n’a pas regardé au départ. Selon l’âge de la maison et son histoire, plusieurs points méritent un examen attentif :"),
        ul(
          "la structure et les fondations (fissures, tassements, déformations) ;",
          "la toiture et la charpente (étanchéité, état des matériaux, ventilation des combles) ;",
          "l’humidité (remontées capillaires, infiltrations, condensation) ;",
          "l’isolation et les menuiseries ;",
          "les réseaux : électricité, plomberie, chauffage, évacuations ;",
          "les façades, leurs enduits et leurs joints.",
        ),
        p("Pour les points qui touchent à la solidité du bâtiment ou à la sécurité des installations, il est prudent de faire intervenir un professionnel compétent plutôt que de se contenter d’une inspection visuelle. Un diagnostic précis permet d’ordonner les interventions : on traite d’abord ce qui est structurel, puis ce qui est technique, puis ce qui est esthétique."),

        h2("Étape 3 : cadrer le budget et le financement"),
        p("Le budget n’est pas seulement le montant des travaux. Il inclut aussi les études éventuelles, les démarches, les imprévus et parfois un hébergement temporaire. Ces postes sont détaillés dans l’article [[Planifier son budget travaux : les postes à anticiper|/blog/" + SLUG_3 + "]]."),
        p("Fixez une enveloppe globale, puis prévoyez une marge pour les imprévus. Renseignez-vous aussi sur les aides et les solutions de financement existantes : leurs conditions évoluent régulièrement et dépendent de votre situation comme de la nature des travaux, d’où l’intérêt de s’appuyer sur les sources officielles du moment."),

        h2("Étape 4 : vérifier les démarches et les autorisations"),
        p("Selon la nature des travaux (modification de l’aspect extérieur, changement de menuiseries, création d’ouvertures, extension, changement de destination d’un local…), une déclaration préalable ou un permis de construire peut être nécessaire. Les règles dépendent aussi du document d’urbanisme de votre commune et de la situation de votre bien."),
        p("Le réflexe le plus sûr : **renseignez-vous auprès du service urbanisme de votre mairie** avant de finaliser votre projet, en décrivant précisément ce que vous envisagez. Si vous vivez en copropriété, en lotissement ou dans un secteur protégé, des règles ou des accords supplémentaires peuvent s’appliquer."),
        p("Anticiper ces démarches permet d’intégrer leur temps de traitement au calendrier, plutôt que de le découvrir une fois les entreprises disponibles."),

        h2("Étape 5 : consulter et comparer les devis"),
        p("Un devis n’est comparable à un autre que si les deux reposent sur le même périmètre. Pour que la comparaison ait un sens, remettez à chaque entreprise la même description du projet, les mêmes plans ou photos et les mêmes contraintes (accès, présence d’occupants, calendrier souhaité)."),
        p("Lors de la lecture des devis, vérifiez notamment :"),
        ul(
          "la description détaillée des postes et des matériaux prévus ;",
          "ce qui est inclus et ce qui ne l’est pas (évacuation des gravats, protections, raccords, finitions) ;",
          "les conditions de paiement et le calendrier d’intervention annoncé ;",
          "les assurances de l’entreprise, dont vous pouvez demander les attestations en cours de validité ;",
          "la manière dont sont gérés les imprévus et les modifications en cours de chantier.",
        ),
        p("Un prix nettement plus bas ou plus haut que les autres n’est pas un verdict en soi : c’est une invitation à demander des précisions sur ce qui est réellement chiffré. Pour présenter votre projet à notre équipe, vous pouvez utiliser le [[formulaire de demande de devis|/devis?type=renovation]] ; la page [[Rénovation|/services/renovation]] décrit notre approche."),

        h2("Étape 6 : planifier et organiser le chantier"),
        p("L’ordre des interventions influence directement la qualité du résultat. De façon générale, on traite d’abord ce qui touche à la structure et à l’étanchéité, puis les réseaux et l’isolation, puis les cloisons, les revêtements et les finitions. Inverser cet ordre expose à abîmer des finitions neuves pour faire passer un réseau oublié."),
        ...(bodyImage
          ? [
              image(
                bodyImage,
                "Façade d’immeuble recouverte d’un échafaudage et d’un filet de protection vert, pendant des travaux",
                "Un chantier de façade nécessite un échafaudage et des protections à prévoir en amont. Photo d’illustration libre de droits, sans lien avec un chantier BatiNova (Dan Gold / Unsplash).",
              ),
            ]
          : []),
        p("Pensez aussi à la logistique : accès pour les livraisons, stockage des matériaux, protection des sols et des pièces conservées, bruit et poussière pour les occupants et les voisins. Selon l’ampleur des travaux, il faudra décider si vous restez dans le logement ou si un hébergement temporaire est préférable ; cette décision a un impact sur le budget comme sur le rythme du chantier."),

        h2("Étape 7 : suivre le chantier et réceptionner les travaux"),
        p("Un chantier se pilote : points réguliers avec les intervenants, validation des choix de finitions avant commande, traitement rapide des écarts constatés. Toute modification de périmètre devrait faire l’objet d’un écrit (avenant ou devis complémentaire) pour garder la maîtrise du budget."),
        p("La réception des travaux est un moment formel : on parcourt les ouvrages, on note par écrit les éventuelles réserves et on convient de leur levée. Prenez le temps de cette visite, idéalement avec toutes les pièces accessibles et une bonne lumière."),

        h2("Rénover en Île-de-France, en Normandie ou dans la Manche : ce qui peut varier"),
        p("Le fil conducteur reste le même d’un territoire à l’autre, mais le contexte local peut modifier certains paramètres. En Île-de-France, la densité du bâti, la copropriété, l’accès au chantier ou le stationnement des véhicules d’entreprise peuvent être des sujets à anticiper. En Normandie et dans la Manche, le bâti ancien, ses matériaux traditionnels et les règles locales d’urbanisme peuvent orienter les choix de travaux."),
        p("BatiNova Construction intervient sur ces territoires depuis son siège d’Aulnay-sous-Bois. Retrouvez le détail sur les pages [[Île-de-France|/zones-intervention/ile-de-france]], [[Normandie|/zones-intervention/normandie]] et [[Manche|/zones-intervention/manche]]."),

        retenir(
          ul(
            "Clarifiez vos besoins et hiérarchisez vos priorités avant tout autre choix.",
            "Faites établir un état des lieux fiable du bâti.",
            "Fixez un budget global, avec une marge pour les imprévus.",
            "Renseignez-vous auprès de votre mairie sur les autorisations éventuelles.",
            "Comparez des devis construits sur un périmètre identique.",
            "Anticipez l’ordre des interventions et la logistique du chantier.",
          ),
        ),

        h2("Aller plus loin"),
        p("Vous envisagez d’agrandir plutôt que de rénover ? Lisez [[Extension de maison : les questions à se poser avant de se lancer|/blog/" + SLUG_2 + "]]. Et si votre projet est prêt à être discuté, vous pouvez [[nous parler de votre projet de rénovation|/devis?type=renovation]]."),
      ),
  },

  {
    slug: SLUG_2,
    title: "Extension de maison : les questions à se poser avant de se lancer",
    metaTitle: "Extension de maison : avant de se lancer",
    metaDescription:
      "Besoin, terrain, maison existante, urbanisme, budget, chantier : les questions à se poser avant de lancer l’extension de votre maison.",
    excerpt:
      "Quel usage pour l’espace créé, que permet le terrain, comment raccorder le neuf à l’existant, quelles autorisations vérifier, quel budget prévoir : les questions essentielles avant d’agrandir une maison.",
    category: "construction",
    tags: ["extension", "planification", "autorisations"],
    cover: "maison-bois-contemporaine-crepuscule.jpg",
    build: () =>
      doc(
        h2("Agrandir, oui, mais pour quoi faire ?"),
        p("Une extension est souvent la réponse à un manque de place : une chambre supplémentaire, une cuisine plus ouverte, un bureau, une pièce de vie plus lumineuse. Mais agrandir une maison, c’est aussi intervenir sur sa structure, sur son terrain et sur son équilibre d’ensemble. Mieux vaut donc se poser les bonnes questions avant de dessiner la première esquisse."),
        p("Voici les grands thèmes à explorer, dans l’ordre où ils se présentent le plus souvent. Ils vous aideront à préparer un échange plus précis avec un architecte, un maître d’œuvre ou une entreprise."),

        h2("Quel besoin l’extension doit-elle satisfaire ?"),
        h3("Définir l’usage de l’espace créé"),
        p("Commencez par l’usage, pas par les mètres carrés. Une pièce de vie, une suite parentale, un espace de travail ou un atelier n’ont pas les mêmes exigences en matière de lumière, d’acoustique, d’isolation ou de raccordements. Décrire précisément ce qui s’y passera guide ensuite toutes les décisions techniques."),
        h3("Anticiper les évolutions futures"),
        p("Une extension se pense sur la durée : la famille peut s’agrandir ou se réduire, un proche peut venir habiter, une activité à domicile peut apparaître. Prévoir de la souplesse (cloisons déplaçables, pièce facilement transformable, accessibilité) peut éviter de nouveaux travaux lourds plus tard."),

        h2("Que permettent le terrain et l’implantation ?"),
        p("Le terrain fixe les limites du possible. Plusieurs questions se posent :"),
        ul(
          "où l’extension peut-elle s’implanter par rapport aux limites de propriété et aux constructions voisines ?",
          "quels sont l’orientation, l’ensoleillement et les vues à préserver ou à créer ?",
          "le sol et la pente demandent-ils des précautions particulières pour les fondations ?",
          "des réseaux (eau, assainissement, électricité, gaz) passent-ils à proximité de l’emprise envisagée ?",
          "comment les engins et les matériaux accéderont-ils au chantier ?",
        ),
        p("Ces éléments conditionnent la faisabilité, la forme de l’extension et une partie de son coût. Un relevé du terrain et un examen sur place sont souvent plus parlants que n’importe quelle hypothèse."),

        h2("Comment l’extension va-t-elle dialoguer avec la maison existante ?"),
        h3("Le raccord structurel et technique"),
        p("Relier un volume neuf à un bâtiment existant demande de la précision : ouverture dans un mur porteur, liaison des toitures, traitement des jonctions, gestion des différences de tassement. Selon la structure de la maison, une étude technique peut être nécessaire pour dimensionner correctement ces interventions."),
        h3("La cohérence d’ensemble"),
        p("Une extension réussie se lit comme un prolongement de la maison : volumes, matériaux, teintes, hauteurs, ouvertures. Elle peut s’inscrire dans la continuité du bâti ou assumer un contraste, mais ce choix doit être conscient. Pensez aussi aux circulations intérieures, à la lumière naturelle et aux performances thermiques de l’ensemble, pas seulement de la partie neuve."),

        h2("Quelles règles d’urbanisme et quelles autorisations ?"),
        p("C’est l’un des points qui peut le plus influencer le calendrier d’un projet. Selon la surface créée, l’emplacement, l’aspect extérieur et la situation de votre bien, une déclaration préalable ou un permis de construire peut être exigé. Le document d’urbanisme de votre commune peut également encadrer l’implantation, la hauteur ou l’aspect des constructions."),
        p("Le plus sûr est de **vous renseigner auprès du service urbanisme de votre mairie** avant de figer votre projet, en lui présentant ce que vous envisagez. Si vous habitez en copropriété, en lotissement ou dans un secteur faisant l’objet d’une protection particulière, des règles ou des accords supplémentaires peuvent s’ajouter."),

        h2("Quel type d’extension choisir ?"),
        p("Il n’existe pas de solution universelle. Selon la configuration de la maison et du terrain, on peut envisager :"),
        ul(
          "une extension de plain-pied, qui prolonge la maison au niveau du sol ;",
          "une surélévation, qui ajoute un niveau lorsque la structure et les règles locales le permettent ;",
          "l’aménagement de volumes existants, comme des combles ou un garage, lorsqu’ils s’y prêtent.",
        ),
        p("Chaque option a ses avantages, ses contraintes techniques et ses exigences administratives. Une visite sur place avec un professionnel permet de distinguer ce qui est réaliste de ce qui l’est moins."),

        h2("Quel budget et quelle organisation prévoir ?"),
        p("Une extension ne se résume pas au coût du gros œuvre. Les études, les démarches, les raccordements, les finitions intérieures, les équipements et les imprévus sont à intégrer dès le départ. L’article [[Planifier son budget travaux : les postes à anticiper|/blog/" + SLUG_3 + "]] passe en revue ces postes."),
        p("Pensez aussi à l’organisation : le chantier se déroulera-t-il en votre présence ? Quels espaces de la maison resteront utilisables ? Comment protéger l’existant de la poussière et des allées et venues ? Ces réponses influencent le déroulement des travaux comme votre quotidien."),

        h2("Faire appel à un professionnel : quand et comment ?"),
        p("Pour une extension, plusieurs intervenants peuvent être concernés : un architecte ou un maître d’œuvre pour la conception et le suivi, un bureau d’études pour certains calculs, des entreprises pour la réalisation. Ce qui compte, c’est de savoir qui fait quoi, qui coordonne et qui répond de quoi. Demandez que cela figure clairement dans les documents contractuels."),
        p("Pour comparer sereinement, présentez le même projet à chaque interlocuteur et demandez des devis détaillés, établis sur un périmètre identique. Vous pouvez décrire votre projet via le [[formulaire de devis|/devis?type=extension]] ; la page [[Extension|/services/extension]] présente notre démarche."),

        h2("Extension en Île-de-France, en Normandie ou dans la Manche"),
        p("Les questions de fond sont les mêmes partout, mais le contexte local compte. En zone dense, l’emprise disponible, le voisinage et l’accès au chantier peuvent être déterminants. Dans des communes plus rurales ou littorales de Normandie et de la Manche, le caractère du bâti, l’environnement paysager et les règles locales peuvent peser davantage sur le choix des volumes et des matériaux."),
        p("BatiNova Construction intervient en [[Île-de-France|/zones-intervention/ile-de-france]] et en [[Normandie|/zones-intervention/normandie]], dont la [[Manche|/zones-intervention/manche]], depuis son siège d’Aulnay-sous-Bois."),

        retenir(
          ul(
            "Définissez l’usage de l’espace avant de parler de surface.",
            "Faites examiner le terrain et la maison existante sur place.",
            "Renseignez-vous auprès de votre mairie sur les règles d’urbanisme et les autorisations.",
            "Intégrez études, démarches, raccordements, finitions et imprévus dans le budget.",
            "Clarifiez qui fait quoi entre concepteur, coordinateur et entreprises.",
          ),
        ),

        h2("Pour poursuivre"),
        p("Avant d’agrandir, vérifiez aussi l’état de l’existant : [[Préparer un projet de rénovation de maison : les étapes clés|/blog/" + SLUG_1 + "]]. Quand votre projet est mûr, vous pouvez [[nous le présenter|/devis?type=extension]]."),
      ),
  },

  {
    slug: SLUG_3,
    title: "Planifier son budget travaux : les postes à anticiper",
    metaTitle: "Budget travaux : les postes à anticiper",
    metaDescription:
      "Études, démarches, travaux, équipements, imprévus, financement : les postes à anticiper pour construire un budget travaux réaliste et sans mauvaise surprise.",
    excerpt:
      "Un budget travaux ne se limite pas au prix du chantier. Études, démarches, équipements, frais annexes, imprévus et suivi : la liste des postes à anticiper, sans aucun chiffre trompeur.",
    category: "budget-travaux",
    tags: ["budget", "planification", "chantier"],
    cover: "plans-architecte-compas-table.jpg",
    build: () =>
      doc(
        h2("Un budget travaux ne se limite pas au prix du chantier"),
        p("Lorsqu’on évoque le coût d’une rénovation ou d’une extension, on pense d’abord aux entreprises et aux matériaux. Pourtant, une part de la dépense se joue ailleurs : dans les études, les démarches, les équipements, les aléas du chantier et tout ce qui l’entoure. Un budget fiable est un budget qui a listé tous ces postes, même quand leur montant n’est pas encore connu."),
        p("Cet article ne donne volontairement aucun chiffre : les coûts varient fortement selon le projet, le bâtiment, la région et la période. Il propose plutôt une grille de lecture pour ne rien oublier lorsque vous construirez votre propre estimation, puis lorsque vous comparerez des devis."),

        h2("Les postes à anticiper"),
        h3("Les études et la conception"),
        p("Selon le projet, il peut être nécessaire de faire appel à un architecte, un maître d’œuvre, un bureau d’études ou un diagnostiqueur : relevés, plans, calculs de structure, études thermiques, diagnostics avant travaux. Ces prestations ont un coût, mais elles précisent le projet et réduisent le risque d’erreur en aval."),
        h3("Les démarches administratives"),
        p("Dépôt d’une déclaration préalable ou d’une demande de permis, éventuelles taxes liées à la création de surface, frais de raccordement aux réseaux, accords de copropriété : renseignez-vous auprès de votre mairie et des organismes concernés pour identifier ce qui s’applique à votre situation."),
        h3("Les travaux proprement dits"),
        p("C’est le poste central, qu’il est utile de décomposer :"),
        ul(
          "le gros œuvre et la structure (maçonnerie, charpente, couverture) ;",
          "le second œuvre (isolation, cloisons, menuiseries, électricité, plomberie, chauffage) ;",
          "les finitions (sols, peintures, revêtements, agencements) ;",
          "les travaux annexes (démolition, évacuation des gravats, protections, échafaudages).",
        ),
        p("Demandez que chaque devis reprenne cette décomposition : elle rend les comparaisons possibles et facilite les arbitrages."),
        h3("Les équipements et l’aménagement"),
        p("Cuisine, salle de bains, luminaires, rangements, mobilier, électroménager : ces achats sont souvent traités à part, alors qu’ils pèsent dans le budget final. Décidez dès le départ s’ils sont inclus dans l’enveloppe ou financés séparément."),
        h3("Les frais annexes pendant le chantier"),
        p("Si la maison n’est pas habitable pendant tout ou partie des travaux, prévoyez le logement provisoire, le stockage du mobilier et le déménagement éventuel. Pensez aussi aux assurances spécifiques que votre situation peut nécessiter et à la durée réelle du chantier, qui peut dépasser les prévisions initiales."),

        h2("Prévoir une réserve pour les imprévus"),
        p("Dans un bâtiment existant, certains désordres n’apparaissent qu’à l’ouverture d’un mur, d’un sol ou d’un plafond : humidité cachée, réseaux à reprendre, structure à renforcer. Même dans une construction neuve, des aléas de sol, de météo ou d’approvisionnement existent."),
        p("Prévoyez donc une réserve distincte de l’enveloppe principale, dimensionnée avec les professionnels en fonction de l’âge du bâtiment et de l’ampleur des travaux. Plus l’existant est ancien ou peu documenté, plus cette réserve mérite d’être réfléchie. Elle n’est pas un budget « en plus » : c’est une protection pour tenir le projet sans l’amputer en cours de route."),

        h2("Établir, comparer et comprendre les devis"),
        p("Des devis comparables reposent sur un cahier des charges commun. Avant de lancer la consultation, rédigez une description claire du projet, rassemblez plans et photos, et indiquez vos contraintes de calendrier et d’accès."),
        p("À la réception, comparez poste par poste plutôt que sur le total. Une ligne manquante, une quantité différente ou un matériau d’une autre gamme peut expliquer un écart important. N’hésitez pas à poser des questions : un devis est aussi un support de dialogue. Si vous souhaitez nous soumettre votre projet, le [[formulaire de devis|/devis]] est là pour cela."),

        h2("Hiérarchiser et phaser pour garder la maîtrise"),
        p("Quand le total dépasse l’enveloppe, deux leviers existent : réduire le périmètre ou étaler les travaux dans le temps. Reprenez la liste de vos priorités (voir [[Préparer un projet de rénovation de maison : les étapes clés|/blog/" + SLUG_1 + "]]) et distinguez :"),
        ul(
          "ce qui doit être fait maintenant, parce qu’il conditionne la suite ;",
          "ce qui peut être préparé maintenant (réservations, passages de réseaux) pour être réalisé plus tard sans tout défaire ;",
          "ce qui peut attendre sans compromettre l’ensemble.",
        ),
        p("Un phasage doit rester cohérent techniquement : demandez à un professionnel de valider qu’une étape ne rend pas la suivante plus coûteuse ou plus compliquée."),

        h2("Financement et aides : s’informer aux bonnes sources"),
        p("Selon votre situation et la nature des travaux, des aides, des dispositifs fiscaux ou des solutions de financement peuvent exister. Leurs conditions, leurs montants et leur disponibilité évoluent régulièrement : il serait imprudent de s’appuyer sur une information datée. Consultez les sources officielles, par exemple le portail [[service-public.fr|https://www.service-public.fr/]] ou le service public de la rénovation de l’habitat [[France Rénov’|https://france-renov.gouv.fr/]], et vérifiez les conditions avant de vous engager."),

        h2("Suivre le budget pendant le chantier"),
        p("Le budget vit tout au long du projet. Tenez un tableau simple qui rapproche, pour chaque poste, le montant prévu, le montant engagé et le montant payé. Toute modification demandée en cours de route (changement de matériau, point lumineux supplémentaire, démolition en plus) doit être chiffrée et validée par écrit avant exécution. C’est le meilleur moyen d’éviter les mauvaises surprises lors du décompte final."),
        p("Les projets menés en Île-de-France, en Normandie ou dans la Manche suivent la même logique ; seuls les paramètres locaux (accès, contraintes d’urbanisme, disponibilité des entreprises) changent. Retrouvez nos [[zones d’intervention|/zones-intervention]]."),

        retenir(
          ul(
            "Listez tous les postes, y compris ceux dont le montant n’est pas encore connu.",
            "Décomposez les devis (gros œuvre, second œuvre, finitions, travaux annexes) pour pouvoir les comparer.",
            "Prévoyez une réserve distincte pour les imprévus.",
            "Hiérarchisez vos priorités pour pouvoir réduire ou phaser sans perdre en cohérence.",
            "Vérifiez les aides et le financement auprès des sources officielles du moment.",
            "Validez par écrit toute modification en cours de chantier.",
          ),
        ),

        h2("Pour aller plus loin"),
        p("Si votre projet est une extension, lisez aussi [[Extension de maison : les questions à se poser avant de se lancer|/blog/" + SLUG_2 + "]]. Pour découvrir nos domaines d’intervention : [[rénovation|/services/renovation]], [[extension|/services/extension]] et [[construction|/services/construction]]. Et pour parler de votre projet, [[demandez un devis|/devis]]."),
      ),
  },
];

// ---------------------------------------------------------------- seed

export async function seedBlog(ctx: SeedContext): Promise<void> {
  const { db, log } = ctx;
  await seedMedia(ctx); // idempotent: matches by originalName, reuses the Media rows created for the pages

  let created = 0;
  const catIds = new Map<string, string>();
  for (const c of CATEGORIES) {
    const row = await db.category.upsert({ where: { slug: c.slug }, create: c, update: {}, select: { id: true } });
    catIds.set(c.slug, row.id);
  }
  const tagIds = new Map<string, string>();
  for (const tg of TAGS) {
    const row = await db.tag.upsert({ where: { slug: tg.slug }, create: tg, update: {}, select: { id: true } });
    tagIds.set(tg.slug, row.id);
  }

  for (const post of POSTS) {
    const exists = await db.post.findUnique({ where: { slug: post.slug }, select: { id: true } });
    if (exists) continue; // includes soft-deleted: never resurrect or overwrite

    const coverId = await mediaIdByName(ctx, post.cover);
    const bodyImageId = post.bodyImageFile ? ((await mediaIdByName(ctx, post.bodyImageFile)) ?? undefined) : undefined;
    const checked = validateRichText(post.build({ bodyImage: bodyImageId }));
    if (!checked.ok) {
      throw new Error(`blog seed: invalid rich text for "${post.slug}": ${checked.errors.map((e) => `${e.path} ${e.message}`).join("; ")}`);
    }
    if (!coverId) log(`blog: cover ${post.cover} missing for "${post.slug}" (post created without cover; set one in /admin)`);

    await db.post.create({
      data: {
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt,
        body: checked.doc as object,
        coverImageId: coverId ?? null,
        categoryId: catIds.get(post.category) ?? null,
        authorDisplayName: "L’équipe BatiNova",
        status: "DRAFT",
        readingMinutes: estimateReadingMinutes(checked.doc),
        isPlaceholder: false, // real editorial copy; only the cover image is an illustration
        metaTitle: post.metaTitle,
        metaDescription: post.metaDescription,
        tags: { create: post.tags.flatMap((s) => (tagIds.has(s) ? [{ tagId: tagIds.get(s)! }] : [])) },
      },
    });
    created++;
    log(`blog: "${post.slug}" created as DRAFT (${countWords(richTextToPlainText(checked.doc))} words)`);
  }
  log(`blog: ${created} article(s) created, categories/tags ensured`);
}
