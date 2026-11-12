import { requireRole } from "@/lib/auth/guards";
import { PageHeader } from "@/components/admin/AdminShell";
import { ProjectEditor } from "@/components/admin/ProjectEditor";
import { emptyProject } from "@/components/admin/defaults";

export const metadata = { title: "Nouvelle réalisation" };

export default async function NewProject() {
  await requireRole("EDITOR");
  return (
    <main>
      <PageHeader title="Nouvelle réalisation" />
      <ProjectEditor initial={emptyProject()} initialMedia={[]} revisions={[]} />
    </main>
  );
}
