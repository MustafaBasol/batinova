// Pages seed (design-frontend). CREATE-IF-MISSING ONLY: existing pages (and their owner edits) are never touched.
// All copy is original French, cautious and fact-free: no years of experience, figures, certifications,
// insurance, testimonials, client names, team members or phone numbers. Identity values on legal pages come
// from settings (verified values only) and otherwise read « [À compléter par le propriétaire] ».
// Services are flagged isPlaceholder (the owner must confirm the service list); legal pages are noindex until verified.
import { BlocksSchema } from "../../src/lib/blocks/schema";
import { parseSetting, isVerified, type VerifiedText } from "../../src/lib/settings-schema";
import type { SeedContext } from "./client";
import { mediaIdByName, seedMedia } from "./media";

// ---------------------------------------------------------------- Tiptap helpers (validated by BlocksSchema)
type Mark = { type: string; attrs?: Record<string, unknown> };
type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[]; text?: string; marks?: Mark[] };
const t = (text: string, marks?: Mark[]): Node => ({ type: "text", text, ...(marks ? { marks } : {}) });
const bold = (s: string): Node => t(s, [{ type: "bold" }]);
const link = (s: string, href: string): Node => t(s, [{ type: "link", attrs: { href, nofollow: false } }]);
const p = (...inline: (Node | string)[]): Node => ({ type: "paragraph", content: inline.map((i) => (typeof i === "string" ? t(i) : i)) });
const h2 = (s: string): Node => ({ type: "heading", attrs: { level: 2 }, content: [t(s)] });
const ul = (...items: (Node | string)[][]): Node => ({
  type: "bulletList",
  content: items.map((i) => ({ type: "listItem", content: [p(...i)] })),
});
const callout = (variant: "retenir" | "info" | "attention", ...c: Node[]): Node => ({ type: "callout", attrs: { variant }, content: c });
const doc = (...content: Node[]) => ({ type: "doc", content });

const TODO = "[À compléter par le propriétaire]";
const val = (f: VerifiedText | undefined) => (isVerified(f) ? f.value : TODO);

interface SeedPage {
  path: string;
  title: string;
  template: "HOME" | "STANDARD" | "SERVICE" | "ZONE" | "LEGAL" | "CONTACT";
  parentPath?: string;
  isPlaceholder?: boolean;
  noindex?: boolean;
  metaTitle?: string;
  metaDescription: string;
  blocks: Record<string, unknown>[];
}

const CTA = (heading = "Un projet en tête ? Parlons-en.", href = "/devis", text?: string) => ({
  type: "ctaBand",
  heading,
  text: text ?? "Décrivez votre projet en quelques étapes. Nous revenons vers vous pour en discuter, sans engagement.",
  label: "Demander un devis",
  href,
});

/** Internal cross-links between service pages and zone pages (create-if-missing seed content only). */
const ZONES_RELATED = {
  type: "richText",
  doc: doc(
    h2("Où intervenons-nous ?"),
    p(
      "Nous intervenons depuis notre siège d’Aulnay-sous-Bois en ",
      link("Île-de-France", "/zones-intervention/ile-de-france"),
      ", en ",
      link("Normandie", "/zones-intervention/normandie"),
      " et plus particulièrement dans le département de la ",
      link("Manche", "/zones-intervention/manche"),
      ".",
    ),
  ),
};
const SERVICES_RELATED = {
  type: "richText",
  doc: doc(
    h2("Nos services sur ce territoire"),
    p(
      "Selon votre projet, découvrez notre approche de la ",
      link("rénovation", "/services/renovation"),
      ", de l’",
      link("extension", "/services/extension"),
      " ou de la ",
      link("construction", "/services/construction"),
      ".",
    ),
  ),
};

const SERVICE_NOTICE = {
  type: "placeholderNotice",
  text: "Contenu de démonstration : la liste des services proposés reste à confirmer par le propriétaire avant publication définitive.",
};

export async function seedPages(ctx: SeedContext): Promise<void> {
  const { db, log } = ctx;
  await seedMedia(ctx); // stock images first (needed for hero images)

  const img = async (file: string) => (await mediaIdByName(ctx, file)) ?? undefined;
  const I = {
    charpente: await img("charpente-bois-pierre-interieur-renovation.jpg"),
    immeuble: await img("immeuble-facade-beige-fenetres-alignees.jpg"),
    beton: await img("beton-brut-architecture-contemporaine.jpg"),
    facade: await img("facade-blanche-balcons-geometrie.jpg"),
    plans: await img("plans-architecte-compas-table.jpg"),
    salon: await img("salon-lumineux-grandes-fenetres-fauteuil.jpg"),
    piece: await img("piece-claire-parquet-mobilier-minimal.jpg"),
    tuiles: await img("tuiles-anciennes-patinees-toiture-detail.jpg"),
    ruelle: await img("ruelle-maisons-pierre-toits-ardoise.jpg"),
    boisMaison: await img("maison-bois-contemporaine-crepuscule.jpg"),
  };

  // Company identity from settings (verified values only)
  const companyRow = await db.setting.findUnique({ where: { key: "company" } });
  const addressRow = await db.setting.findUnique({ where: { key: "address" } });
  const company = parseSetting("company", companyRow?.value);
  const address = parseSetting("address", addressRow?.value);
  const siege = `${address.streetAddress}, ${address.postalCode} ${address.addressLocality}`;

  const pages: SeedPage[] = [
    // ------------------------------------------------------------ HOME
    {
      path: "",
      title: "Accueil",
      template: "HOME",
      metaTitle: "BatiNova Construction — Construire autrement.",
      metaDescription:
        "BatiNova Construction accompagne vos projets de rénovation, d’extension et de construction en Île-de-France, en Normandie et dans la Manche.",
      blocks: [
        {
          type: "hero",
          eyebrow: "Rénovation · Extension · Construction",
          heading: "Construire autrement.",
          subheading:
            "Des projets de rénovation, d’extension et de construction menés avec exigence, clarté et un soin constant du détail.",
          imageId: I.charpente,
          ctaLabel: "Demander un devis",
          ctaHref: "/devis",
        },
        {
          type: "features",
          heading: "Une approche exigeante, de la première idée à la remise des clés",
          items: [
            {
              title: "L’écoute d’abord",
              text: "Chaque projet commence par une conversation : votre mode de vie, vos contraintes et vos envies orientent nos recommandations.",
            },
            {
              title: "Des échanges transparents",
              text: "Périmètre des travaux, choix techniques, décisions à prendre : nous les exposons clairement, étape après étape.",
            },
            {
              title: "Le soin du détail",
              text: "Un bâtiment réussi se joue dans les finitions autant que dans la structure. Nous y apportons une attention particulière.",
            },
          ],
        },
        {
          type: "richText",
          doc: doc(
            h2("Trois domaines d’intervention"),
            p(
              "Nous accompagnons les particuliers dans leurs projets de ",
              link("rénovation", "/services/renovation"),
              ", d’",
              link("extension", "/services/extension"),
              " et de ",
              link("construction", "/services/construction"),
              ". Chaque projet est abordé comme un cas singulier : un bâtiment existant, un terrain, une famille, un budget.",
            ),
            p(link("Voir l’ensemble de nos services", "/services")),
          ),
        },
        {
          type: "steps",
          heading: "Une méthode en quatre temps",
          items: [
            { title: "Écoute et cadrage", text: "Nous faisons connaissance avec votre projet, vos attentes et le lieu concerné pour poser des bases claires." },
            { title: "Conception et chiffrage", text: "Nous précisons le programme des travaux et vous présentons une proposition détaillée, que nous discutons ensemble." },
            { title: "Réalisation", text: "Le chantier est organisé et suivi, avec des points d’étape réguliers pour que vous restiez informé de son avancement." },
            { title: "Réception", text: "Nous vérifions le résultat avec vous et préparons la remise des clés dans de bonnes conditions." },
          ],
        },
        { type: "zones", heading: "Île-de-France, Normandie, Manche" },
        { type: "postsGrid", heading: "Conseils et actualités", limit: 3 },
        CTA(),
      ],
    },

    // ------------------------------------------------------------ À PROPOS
    {
      path: "a-propos",
      title: "À propos",
      template: "STANDARD",
      metaTitle: "À propos : notre approche de la construction",
      metaDescription:
        "La philosophie de BatiNova Construction : écouter, expliquer, construire avec soin. Découvrez notre approche des projets de rénovation, d’extension et de construction.",
      blocks: [
        {
          type: "hero",
          eyebrow: "À propos",
          heading: "Une manière de construire, avant d’être une entreprise.",
          subheading: "BatiNova Construction défend une idée simple : un chantier réussi est un projet bien compris, bien préparé et bien suivi.",
          imageId: I.piece,
        },
        {
          type: "richText",
          doc: doc(
            h2("Notre point de vue"),
            p(
              "Construire ou transformer un lieu de vie est une décision importante. Elle engage du temps, de l’argent et beaucoup d’attentes. Notre rôle est de rendre ce parcours lisible : expliquer les options, nommer les contraintes, proposer des solutions adaptées plutôt que des réponses toutes faites.",
            ),
            p(
              "« Construire autrement » signifie pour nous partir de votre projet et non d’un catalogue : prendre le temps de comprendre un bâtiment, un terrain, un budget, puis proposer une démarche cohérente avec chacun d’eux.",
            ),
            h2("Ce qui guide notre travail"),
            ul(
              [bold("La clarté. "), "Un vocabulaire simple, des décisions expliquées, un périmètre de travaux défini avant de commencer."],
              [bold("Le respect de l’existant. "), "Un bâtiment a une histoire et des matériaux propres ; nous les observons avant d’intervenir."],
              [bold("Le détail. "), "Les finitions, les raccords et la coordination des interventions font la différence au quotidien."],
              [bold("La mesure. "), "Nous préférons dire ce qui n’est pas possible ou pas pertinent plutôt que de promettre l’inverse."],
            ),
            h2("Un siège, un territoire"),
            p(
              `Notre siège se trouve à ${siege}. Nous intervenons en Île-de-France et en Normandie, avec une attention particulière portée au département de la Manche. Nous n’avons pas d’agences locales : chaque déplacement est organisé depuis ce siège unique.`,
            ),
            p("Pour savoir comment nous conduisons un projet pas à pas, consultez ", link("notre méthode", "/notre-methode"), ".", ),
          ),
        },
        CTA("Parlons de votre projet", "/devis"),
      ],
    },

    // ------------------------------------------------------------ MÉTHODE
    {
      path: "notre-methode",
      title: "Notre méthode",
      template: "STANDARD",
      metaTitle: "Notre méthode : du premier échange à la remise des clés",
      metaDescription:
        "De l’écoute à la réception, découvrez les étapes selon lesquelles BatiNova Construction conduit un projet de rénovation, d’extension ou de construction.",
      blocks: [
        {
          type: "hero",
          eyebrow: "Notre méthode",
          heading: "Du premier échange à la remise des clés.",
          subheading: "Une démarche en étapes, pour que chaque décision soit prise au bon moment et en connaissance de cause.",
          imageId: I.plans,
        },
        {
          type: "richText",
          doc: doc(
            p(
              "Chaque projet est différent, mais le cheminement reste lisible. Les étapes ci-dessous décrivent notre manière de travailler ; leur contenu exact et leur durée dépendent de la nature du projet, du bâtiment et des démarches nécessaires.",
            ),
          ),
        },
        {
          type: "steps",
          heading: "Les étapes d’un projet",
          items: [
            { title: "Premier échange", text: "Vous nous présentez votre projet, vos contraintes, votre calendrier souhaité et une première idée de budget. Nous répondons à vos premières questions et indiquons si et comment nous pouvons vous accompagner." },
            { title: "Visite et cadrage", text: "Nous découvrons le lieu : état du bâti, accès, contraintes techniques ou réglementaires visibles. Ce temps permet de définir ensemble un périmètre de travaux réaliste." },
            { title: "Conception et chiffrage", text: "Le programme est précisé et traduit en proposition détaillée : travaux prévus, choix de matériaux, organisation. Nous prenons le temps de la commenter avec vous." },
            { title: "Validation et préparation", text: "Une fois les choix arrêtés, nous préparons le chantier : planning, commandes, démarches administratives éventuelles à anticiper (à vérifier selon votre commune et votre projet)." },
            { title: "Réalisation du chantier", text: "Les travaux sont conduits par phases. Des points d’étape vous permettent de suivre l’avancement et de valider les décisions qui se présentent en cours de route." },
            { title: "Réception et remise des clés", text: "Nous examinons ensemble le résultat, relevons les éventuelles remarques et organisons la remise du chantier dans de bonnes conditions." },
          ],
        },
        {
          type: "faq",
          heading: "Questions fréquentes sur la démarche",
          items: [
            { question: "Par où commencer ?", answer: "Par une description simple de votre projet : nature des travaux, lieu, calendrier souhaité. Le formulaire de demande de devis vous guide en quelques étapes." },
            { question: "Faut-il une autorisation pour mes travaux ?", answer: "Cela dépend de la nature des travaux, de leur ampleur et des règles locales d’urbanisme. Nous vous invitons à vous renseigner auprès de votre mairie ; nous pouvons vous aider à identifier les démarches à anticiper." },
            { question: "Puis-je préciser mon budget plus tard ?", answer: "Oui. Une fourchette indicative aide à cadrer l’échange, mais vous pouvez aussi nous dire que vous ne la connaissez pas encore." },
          ],
        },
        CTA("Prêt à démarrer l’échange ?", "/devis"),
      ],
    },

    // ------------------------------------------------------------ SERVICES
    {
      path: "services",
      title: "Services",
      template: "SERVICE",
      isPlaceholder: true,
      metaTitle: "Services : rénovation, extension, construction",
      metaDescription:
        "Les domaines d’intervention de BatiNova Construction : rénovation, extension et construction neuve pour particuliers en Île-de-France et en Normandie.",
      blocks: [
        {
          type: "hero",
          eyebrow: "Services",
          heading: "Rénover, étendre, construire.",
          subheading: "Trois domaines d’intervention, une même exigence de clarté et de soin.",
          imageId: I.facade,
        },
        SERVICE_NOTICE,
        {
          type: "features",
          heading: "Nos domaines d’intervention",
          items: [
            { title: "Rénovation", text: "Transformer, remettre en état et améliorer un logement existant en respectant son caractère." },
            { title: "Extension", text: "Gagner de l’espace en prolongeant une maison de façon cohérente avec l’existant." },
            { title: "Construction", text: "Concevoir et réaliser un nouveau bâtiment adapté à votre terrain et à votre façon de vivre." },
          ],
        },
        {
          type: "richText",
          doc: doc(
            p(
              "Découvrez chaque domaine en détail : ",
              link("rénovation", "/services/renovation"),
              ", ",
              link("extension", "/services/extension"),
              ", ",
              link("construction", "/services/construction"),
              ".",
            ),
          ),
        },
        CTA(),
      ],
    },
    {
      path: "services/renovation",
      title: "Rénovation",
      template: "SERVICE",
      parentPath: "services",
      isPlaceholder: true,
      metaTitle: "Rénovation de maison et d’appartement",
      metaDescription:
        "Rénovation de logements en Île-de-France et en Normandie : une démarche claire pour transformer et améliorer un bâtiment existant, avec BatiNova Construction.",
      blocks: [
        {
          type: "hero",
          eyebrow: "Services",
          heading: "Rénovation",
          subheading: "Donner une nouvelle vie à un bâtiment existant, sans effacer ce qui fait son caractère.",
          imageId: I.salon,
          ctaLabel: "Parler de mon projet",
          ctaHref: "/devis?type=renovation",
        },
        SERVICE_NOTICE,
        {
          type: "richText",
          doc: doc(
            h2("Une rénovation commence par un diagnostic"),
            p(
              "Avant de planifier des travaux, il faut comprendre le bâtiment : son âge, ses matériaux, son état, ses points faibles. Cette lecture permet d’éviter les mauvaises surprises et d’ordonner les interventions de façon logique.",
            ),
            p(
              "Selon les projets, une rénovation peut porter sur l’aménagement intérieur, la reprise de certains éléments du bâti, l’amélioration du confort ou une transformation plus complète des espaces. Le périmètre est défini avec vous avant le démarrage.",
            ),
          ),
        },
        {
          type: "features",
          heading: "Ce que nous regardons en priorité",
          items: [
            { title: "L’état du bâti", text: "Structure, humidité, isolation, réseaux : ce qui conditionne la suite des travaux." },
            { title: "L’usage des espaces", text: "Comment vous vivez le lieu aujourd’hui et comment vous souhaitez le vivre demain." },
            { title: "L’ordre des interventions", text: "Une bonne séquence de travaux évite les reprises et fait gagner du temps." },
            { title: "Les finitions", text: "Matériaux, raccords, détails : ce qui donne au résultat sa qualité durable." },
          ],
        },
        {
          type: "faq",
          heading: "Questions fréquentes",
          items: [
            { question: "Peut-on vivre dans le logement pendant les travaux ?", answer: "Cela dépend de leur ampleur et des pièces concernées. Nous en discutons dès la phase de cadrage afin d’organiser le chantier au mieux." },
            { question: "Comment préparer ma demande de devis ?", answer: "Rassemblez quelques photos, une idée des surfaces concernées et vos priorités. Le formulaire vous guide pour transmettre l’essentiel." },
          ],
        },
        ZONES_RELATED,
        CTA("Un projet de rénovation ?", "/devis?type=renovation"),
      ],
    },
    {
      path: "services/extension",
      title: "Extension",
      template: "SERVICE",
      parentPath: "services",
      isPlaceholder: true,
      metaTitle: "Extension de maison",
      metaDescription:
        "Extension de maison en Île-de-France et en Normandie : réfléchir l’espace, les raccords avec l’existant et les démarches à anticiper avec BatiNova Construction.",
      blocks: [
        {
          type: "hero",
          eyebrow: "Services",
          heading: "Extension",
          subheading: "Agrandir une maison, c’est la prolonger avec justesse plutôt que lui ajouter simplement des mètres carrés.",
          imageId: I.boisMaison,
          ctaLabel: "Parler de mon projet",
          ctaHref: "/devis?type=extension",
        },
        SERVICE_NOTICE,
        {
          type: "richText",
          doc: doc(
            h2("Penser l’extension comme une continuité"),
            p(
              "Une extension réussie dialogue avec la maison existante : volumes, circulations, lumière, matériaux. Elle répond à un besoin précis (pièce de vie, chambre, bureau) tout en préservant l’équilibre du terrain et du bâti.",
            ),
            callout(
              "info",
              p(
                "Les règles d’urbanisme (surface créée, implantation, aspect extérieur) varient selon les communes. Renseignez-vous auprès de votre mairie avant de définir votre projet ; nous vous aidons à identifier les démarches à anticiper.",
              ),
            ),
          ),
        },
        {
          type: "steps",
          heading: "Comment nous abordons une extension",
          items: [
            { title: "Définir le besoin", text: "Quel usage pour le nouvel espace, pour quelles personnes, avec quelles contraintes ?" },
            { title: "Lire l’existant", text: "Observer le bâti, les raccordements possibles et l’implantation sur le terrain." },
            { title: "Cadrer les démarches", text: "Identifier les autorisations éventuellement nécessaires, à vérifier avec votre mairie." },
            { title: "Organiser le chantier", text: "Prévoir l’accès, la protection de l’existant et l’enchaînement des interventions." },
          ],
        },
        ZONES_RELATED,
        CTA("Un projet d’extension ?", "/devis?type=extension"),
      ],
    },
    {
      path: "services/construction",
      title: "Construction",
      template: "SERVICE",
      parentPath: "services",
      isPlaceholder: true,
      metaTitle: "Construction de maison individuelle",
      metaDescription:
        "Construction neuve en Île-de-France et en Normandie : de la lecture du terrain à la remise des clés, la démarche de BatiNova Construction.",
      blocks: [
        {
          type: "hero",
          eyebrow: "Services",
          heading: "Construction",
          subheading: "Concevoir un nouveau lieu de vie à partir d’un terrain, d’un budget et d’une façon d’habiter.",
          imageId: I.beton,
          ctaLabel: "Parler de mon projet",
          ctaHref: "/devis?type=construction",
        },
        SERVICE_NOTICE,
        {
          type: "richText",
          doc: doc(
            h2("Partir du terrain et de votre quotidien"),
            p(
              "Une construction neuve se prépare bien avant le premier coup de pelle : orientation, nature du sol, règles locales, accès, budget global. Ces données conditionnent le projet et méritent d’être examinées en amont.",
            ),
            p(
              "Nous vous aidons à ordonner ces questions, à faire ressortir les choix qui comptent vraiment et à construire un projet cohérent avec vos moyens et votre manière d’habiter.",
            ),
          ),
        },
        {
          type: "features",
          heading: "Les points que nous clarifions d’abord",
          items: [
            { title: "Le terrain", text: "Situation, pente, nature du sol, raccordements et règles locales d’urbanisme." },
            { title: "Le programme", text: "Surfaces, organisation des pièces, besoins actuels et évolutions possibles." },
            { title: "Le budget global", text: "Ce qui est inclus, ce qui doit être anticipé en dehors du chantier lui-même." },
          ],
        },
        ZONES_RELATED,
        CTA("Un projet de construction ?", "/devis?type=construction"),
      ],
    },

    // ------------------------------------------------------------ ZONES
    {
      path: "zones-intervention",
      title: "Zones d’intervention",
      template: "ZONE",
      metaTitle: "Zones d’intervention : Île-de-France, Normandie, Manche",
      metaDescription:
        "BatiNova Construction intervient en Île-de-France et en Normandie, dont la Manche, depuis son siège d’Aulnay-sous-Bois. Découvrez notre organisation par territoire.",
      blocks: [
        {
          type: "hero",
          eyebrow: "Zones d’intervention",
          heading: "Un siège, trois territoires.",
          subheading: "Nous travaillons en Île-de-France, en Normandie et plus particulièrement dans la Manche, depuis un siège unique à Aulnay-sous-Bois.",
          imageId: I.ruelle,
        },
        {
          type: "richText",
          doc: doc(
            p(
              `Notre organisation est rattachée à notre siège de ${siege}. Il n’existe pas d’agences locales : pour chaque projet hors d’Île-de-France, les déplacements sont planifiés à l’avance et les chantiers organisés en conséquence.`,
            ),
          ),
        },
        { type: "zones", heading: "Choisir un territoire" },
        CTA("Votre projet se situe dans l’une de ces zones ?", "/devis"),
      ],
    },
    {
      path: "zones-intervention/ile-de-france",
      title: "Île-de-France",
      template: "ZONE",
      parentPath: "zones-intervention",
      metaTitle: "Travaux de rénovation et construction en Île-de-France",
      metaDescription:
        "Projets de rénovation, d’extension et de construction en Île-de-France : tissu urbain dense, contraintes d’accès et de voisinage, démarches locales. Notre approche depuis Aulnay-sous-Bois.",
      blocks: [
        {
          type: "hero",
          eyebrow: "Zones d’intervention",
          heading: "Île-de-France",
          subheading: "Notre territoire de proximité, autour de notre siège d’Aulnay-sous-Bois.",
          imageId: I.immeuble,
        },
        {
          type: "richText",
          doc: doc(
            h2("Un contexte bâti dense et varié"),
            p(
              "L’Île-de-France réunit des situations très différentes : pavillons de banlieue, immeubles collectifs, copropriétés, bâtiments de toutes époques. Beaucoup de projets s’y déroulent en milieu occupé et resserré, ce qui oriente la façon de préparer un chantier.",
            ),
            h2("Ce que cela change pour un projet"),
            ul(
              [bold("L’accès et la logistique. "), "Rues étroites, stationnement, livraisons : nous les anticipons dès la préparation."],
              [bold("Le voisinage et la copropriété. "), "Selon le cas, des accords ou des autorisations de la copropriété sont à prévoir avant les travaux."],
              [bold("Les règles locales. "), "Chaque commune a ses documents d’urbanisme ; il est utile de les consulter en amont, auprès de votre mairie."],
            ),
            h2("Notre manière de travailler ici"),
            p(
              `C’est le territoire où nous sommes le plus proches de nos chantiers : notre siège, ${siege}, se trouve en Île-de-France. Les visites, les échanges et le suivi peuvent s’y organiser avec souplesse.`,
            ),
          ),
        },
        SERVICES_RELATED,
        CTA("Un projet en Île-de-France ?", "/devis"),
      ],
    },
    {
      path: "zones-intervention/normandie",
      title: "Normandie",
      template: "ZONE",
      parentPath: "zones-intervention",
      metaTitle: "Rénovation et construction en Normandie",
      metaDescription:
        "Travaux en Normandie : patrimoine bâti varié, climat océanique, organisation des déplacements depuis notre siège unique d’Aulnay-sous-Bois.",
      blocks: [
        {
          type: "hero",
          eyebrow: "Zones d’intervention",
          heading: "Normandie",
          subheading: "Un patrimoine bâti riche et un climat qui demande de bien penser l’enveloppe des bâtiments.",
          imageId: I.ruelle,
        },
        {
          type: "richText",
          doc: doc(
            h2("Un bâti ancré dans son territoire"),
            p(
              "Selon les secteurs, la Normandie offre des constructions en pierre, en brique ou à pans de bois, souvent couvertes d’ardoise ou de tuile. Rénover ou étendre ce type de bâtiment demande de comprendre ses matériaux avant d’intervenir.",
            ),
            h2("Un climat à prendre en compte"),
            p(
              "Le climat océanique, doux et humide, rend l’attention portée à l’humidité, à la ventilation et à l’isolation particulièrement importante. À proximité du littoral, l’exposition au vent et aux embruns peut aussi influencer le choix des matériaux.",
            ),
            h2("Comment nous organisons nos interventions"),
            p(
              "Notre siège étant situé à Aulnay-sous-Bois, les déplacements en Normandie sont planifiés à l’avance. Nous regroupons autant que possible les rendez-vous et les phases de chantier pour limiter les allers-retours, sans réduire le temps consacré à votre projet.",
            ),
            callout(
              "info",
              p(
                "Aux abords de certains édifices protégés, des règles particulières peuvent s’appliquer à l’aspect extérieur des travaux. Renseignez-vous auprès de votre mairie.",
              ),
            ),
          ),
        },
        SERVICES_RELATED,
        CTA("Un projet en Normandie ?", "/devis"),
      ],
    },
    {
      path: "zones-intervention/manche",
      title: "Manche",
      template: "ZONE",
      parentPath: "zones-intervention",
      metaTitle: "Rénovation et construction dans la Manche",
      metaDescription:
        "Projets de rénovation, d’extension et de construction dans la Manche : bâti de pierre, littoral et bocage, chantiers organisés depuis notre siège d’Aulnay-sous-Bois.",
      blocks: [
        {
          type: "hero",
          eyebrow: "Zones d’intervention · Département de la Normandie",
          heading: "Manche",
          subheading: "Un territoire que nous suivons avec une attention particulière, entre littoral, bocage et bâti de caractère.",
          imageId: I.tuiles,
        },
        {
          type: "richText",
          doc: doc(
            h2("Entre mer et bocage"),
            p(
              "Le département de la Manche, en Normandie, se caractérise par un littoral étendu et un paysage de bocage. On y rencontre fréquemment des maisons de pierre, des longères et des résidences secondaires, avec des attentes spécifiques : confort thermique, tenue au vent, entretien à distance.",
            ),
            h2("Des projets souvent liés à la saisonnalité"),
            p(
              "Pour une résidence secondaire ou un bien éloigné de son propriétaire, la préparation et la communication pendant le chantier prennent une importance particulière : points d’étape clairs, décisions anticipées, accès et clés organisés à l’avance.",
            ),
            h2("Une organisation assumée depuis Aulnay-sous-Bois"),
            p(
              "Nous n’avons pas d’agence dans la Manche : notre siège unique est à Aulnay-sous-Bois. Un premier échange à distance, lorsqu’il est pertinent, précède une visite sur place ; les déplacements sont ensuite planifiés pour concentrer les temps de présence utiles.",
            ),
            callout(
              "info",
              p(
                "Certains secteurs de la Manche, notamment aux abords de sites protégés ou de la baie du Mont-Saint-Michel, peuvent être soumis à des règles particulières. Renseignez-vous auprès de votre mairie avant de définir vos travaux.",
              ),
            ),
          ),
        },
        SERVICES_RELATED,
        CTA("Un projet dans la Manche ?", "/devis"),
      ],
    },

    // ------------------------------------------------------------ CONTACT
    {
      path: "contact",
      title: "Contact",
      template: "CONTACT",
      metaTitle: "Contact et demande de devis",
      metaDescription: "Contactez BatiNova Construction pour parler de votre projet de rénovation, d’extension ou de construction.",
      blocks: [
        {
          type: "hero",
          eyebrow: "Contact",
          heading: "Parlons de votre projet.",
          subheading: "Le plus simple pour démarrer : nous présenter votre projet en quelques étapes.",
        },
        { type: "contactForm", heading: "Demander un devis ou un premier échange", source: "contact" },
      ],
    },

    // ------------------------------------------------------------ LEGAL
    {
      path: "mentions-legales",
      title: "Mentions légales",
      template: "LEGAL",
      isPlaceholder: true,
      noindex: true,
      metaDescription: "Mentions légales du site de BatiNova Construction.",
      blocks: [
        {
          type: "richText",
          doc: doc(
            callout(
              "attention",
              p(
                "Modèle à compléter et à faire valider avant publication. Les mentions marquées « [À compléter par le propriétaire] » doivent être renseignées avec des informations exactes ; cette page est en noindex tant qu’elle n’a pas été vérifiée.",
              ),
            ),
            h2("Éditeur du site"),
            ul(
              ["Dénomination : ", val(company.legalName) === TODO ? val(company.tradeName) : val(company.legalName)],
              ["Forme juridique : ", val(company.legalForm)],
              ["Capital social : ", val(company.capital)],
              [`Siège : ${siege}`],
              ["SIREN : ", val(company.siren)],
              ["SIRET : ", val(company.siret)],
              ["RCS : ", val(company.rcs)],
              ["N° de TVA intracommunautaire : ", val(company.tvaNumber)],
              ["Directeur de la publication : ", val(company.director)],
              ["Téléphone : ", val(company.phone)],
              ["E-mail : ", val(company.publicEmail)],
            ),
            h2("Assurances et qualifications"),
            p("Informations relatives aux assurances professionnelles obligatoires : ", val(company.insurance), "."),
            h2("Hébergeur"),
            p(val(company.hostingProvider)),
            h2("Propriété intellectuelle"),
            p(
              "Les textes, visuels et éléments graphiques de ce site sont protégés. Les images signalées « Illustration » sont des photographies libres de droits utilisées à titre d’illustration ; elles ne représentent pas des chantiers réalisés par BatiNova Construction.",
            ),
            h2("Données personnelles"),
            p("Le traitement des données personnelles est décrit dans la ", link("politique de confidentialité", "/politique-de-confidentialite"), "."),
          ),
        },
      ],
    },
    {
      path: "politique-de-confidentialite",
      title: "Politique de confidentialité",
      template: "LEGAL",
      isPlaceholder: true,
      noindex: true,
      metaDescription: "Politique de confidentialité et protection des données personnelles de BatiNova Construction.",
      blocks: [
        {
          type: "richText",
          doc: doc(
            callout(
              "attention",
              p(
                "Modèle à compléter et à faire valider (juridiquement) avant publication. Les points « [À compléter par le propriétaire] » ou « à confirmer » doivent être arrêtés par le propriétaire du site ; la page est en noindex dans l’intervalle.",
              ),
            ),
            h2("Responsable du traitement"),
            p(
              "Le responsable du traitement est ",
              val(company.privacyController) === TODO ? val(company.tradeName) : val(company.privacyController),
              `, dont le siège est situé ${siege}. Contact pour toute question relative aux données personnelles : ${TODO}.`,
            ),
            h2("Données collectées"),
            p("Lorsque vous utilisez le formulaire de demande de devis, nous collectons :"),
            ul(
              ["votre nom, votre adresse e-mail et, si vous le souhaitez, votre numéro de téléphone ;"],
              ["la localisation du projet (code postal, ville) ;"],
              ["la nature du projet, la description que vous saisissez, un budget et un délai indicatifs si vous les renseignez ;"],
              ["les pièces jointes que vous choisissez d’ajouter, lorsque cette fonction est proposée ;"],
              ["la date de votre consentement et la version du texte accepté ;"],
              ["des données techniques limitées (adresse IP sous forme non réversible, agent utilisateur tronqué) utilisées uniquement pour la sécurité et la lutte contre les abus."],
            ),
            h2("Finalités et bases légales"),
            ul(
              ["Répondre à votre demande de devis ou de contact : mesures précontractuelles prises à votre demande."],
              ["Protéger le site contre les envois automatisés et les abus : intérêt légitime."],
            ),
            h2("Destinataires"),
            p(
              `Vos données sont destinées aux personnes habilitées de BatiNova Construction. Elles peuvent être traitées par des prestataires techniques (hébergement, messagerie) : ${TODO}. Aucune vente de données n’est réalisée.`,
            ),
            h2("Durée de conservation"),
            p(
              "Les demandes sont conservées au maximum trois ans après le dernier contact, sauf relation contractuelle (durée à confirmer par le propriétaire). Les demandes identifiées comme indésirables sont supprimées plus rapidement.",
            ),
            h2("Vos droits"),
            p(
              "Vous disposez d’un droit d’accès, de rectification, d’effacement, de limitation, d’opposition et, le cas échéant, de portabilité. Pour les exercer, écrivez-nous à l’adresse indiquée ci-dessus. Vous pouvez également introduire une réclamation auprès de la CNIL (cnil.fr).",
            ),
            h2("Cookies et mesure d’audience"),
            p(
              "À la date de rédaction, aucun outil de mesure d’audience ni cookie publicitaire n’est activé sur ce site. Tout ajout ultérieur ne sera effectué qu’avec votre consentement lorsqu’il est requis (à confirmer avant publication).",
            ),
            h2("Sécurité"),
            p("Des mesures techniques et organisationnelles raisonnables sont mises en œuvre pour protéger les données transmises (accès restreint, journalisation limitée, stockage séparé des pièces jointes)."),
          ),
        },
      ],
    },
  ];

  const ids = new Map<string, string>();
  for (const sp of pages) {
    const existing = await db.page.findUnique({ where: { path: sp.path } });
    if (existing) {
      ids.set(sp.path, existing.id);
      continue;
    }
    const parsed = BlocksSchema.safeParse(sp.blocks);
    if (!parsed.success) {
      log(`pages: "${sp.path || "/"}" invalid blocks, skipped: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`);
      continue;
    }
    const created = await db.page.create({
      data: {
        path: sp.path,
        title: sp.title,
        template: sp.template,
        blocks: parsed.data as unknown as object,
        status: "PUBLISHED",
        publishedAt: new Date(),
        parentId: sp.parentPath ? (ids.get(sp.parentPath) ?? null) : null,
        isPlaceholder: sp.isPlaceholder ?? false,
        metaTitle: sp.metaTitle ?? null,
        metaDescription: sp.metaDescription,
        noindex: sp.noindex ?? false,
      },
    });
    ids.set(sp.path, created.id);
    log(`pages: created /${sp.path}`);
  }
}
