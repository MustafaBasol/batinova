import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/site/BreadcrumbNav";
import { projectsIndexBreadcrumbs } from "@/components/site/breadcrumbs";
import { ProjectCard, ProjectsEmptyState } from "@/components/views/Cards";
import { projectsIndexUrl } from "@/lib/content/paths";
import { listPublishedProjects } from "@/lib/content/public";
import { JsonLd } from "@/components/seo/JsonLd";
import { buildBreadcrumbList, graph } from "@/lib/seo/jsonld";
import { seoMetadata } from "@/lib/seo/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const projects = await listPublishedProjects({ limit: 1 });
  return seoMetadata({
    title: "Réalisations",
    description: "Les réalisations de BatiNova Construction : rénovation, extension et construction.",
    path: projectsIndexUrl(),
    // No real project yet: keep the page out of the index until the owner publishes some.
    noindex: projects.length === 0,
  });
}

export default async function ProjectsPage() {
  const projects = await listPublishedProjects();
  return (
    <>
      <JsonLd data={graph(buildBreadcrumbList(projectsIndexBreadcrumbs()))} />
      <div className="wrap pt-6">
        <Breadcrumbs items={projectsIndexBreadcrumbs()} />
      </div>
      <header className="wrap pb-10 pt-10 sm:pt-14 lg:pt-20">
        <p className="eyebrow rise">Portfolio</p>
        <h1 className="display h-page rise rise-2 mt-5 max-w-4xl">Réalisations</h1>
        <p className="lead rise rise-3 mt-6">
          Des chantiers présentés avec le soin que nous leur portons : intentions, contraintes, matériaux, résultat.
        </p>
      </header>
      <section className="wrap pb-20 lg:pb-32" aria-label="Liste des réalisations">
        {projects.length === 0 ? (
          <ProjectsEmptyState />
        ) : (
          <div className="grid gap-x-8 gap-y-16 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
