/**
 * Breadcrumb item builders (design-frontend). Reused by the <Breadcrumbs/> UI and by seo-content for
 * BreadcrumbList JSON-LD. Pure functions, no I/O. `path` is a site-relative URL ("/services/renovation").
 */
import { blogIndexUrl, categoryUrl, pageUrl, postUrl, projectUrl, projectsIndexUrl, tagUrl } from "@/lib/content/paths";

export interface Crumb {
  name: string;
  path: string;
}

export const HOME_CRUMB: Crumb = { name: "Accueil", path: "/" };

export function pageBreadcrumbs(page: { path: string; title: string; parent?: { path: string; title: string } | null }): Crumb[] {
  if (page.path === "") return [HOME_CRUMB];
  const crumbs = [HOME_CRUMB];
  if (page.parent) crumbs.push({ name: page.parent.title, path: pageUrl(page.parent.path) });
  crumbs.push({ name: page.title, path: pageUrl(page.path) });
  return crumbs;
}

export function blogIndexBreadcrumbs(): Crumb[] {
  return [HOME_CRUMB, { name: "Blog", path: blogIndexUrl() }];
}

export function postBreadcrumbs(post: { slug: string; title: string; category?: { slug: string; name: string } | null }): Crumb[] {
  const crumbs = blogIndexBreadcrumbs();
  if (post.category) crumbs.push({ name: post.category.name, path: categoryUrl(post.category.slug) });
  crumbs.push({ name: post.title, path: postUrl(post.slug) });
  return crumbs;
}

export function categoryBreadcrumbs(cat: { slug: string; name: string }): Crumb[] {
  return [...blogIndexBreadcrumbs(), { name: cat.name, path: categoryUrl(cat.slug) }];
}

export function tagBreadcrumbs(tag: { slug: string; name: string }): Crumb[] {
  return [...blogIndexBreadcrumbs(), { name: `Étiquette : ${tag.name}`, path: tagUrl(tag.slug) }];
}

export function projectsIndexBreadcrumbs(): Crumb[] {
  return [HOME_CRUMB, { name: "Réalisations", path: projectsIndexUrl() }];
}

export function projectBreadcrumbs(project: { slug: string; title: string }): Crumb[] {
  return [...projectsIndexBreadcrumbs(), { name: project.title, path: projectUrl(project.slug) }];
}

export function simpleBreadcrumbs(name: string, path: string): Crumb[] {
  return [HOME_CRUMB, { name, path }];
}
