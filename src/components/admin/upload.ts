"use client";
// Client-side upload helper with progress (owner: cms-admin). One file per request.
export interface UploadMeta {
  alt?: string;
  caption?: string;
  credit?: string;
  licenseType?: string;
  licenseSource?: string;
  licenseNotes?: string;
  isPlaceholder?: boolean;
  replaceId?: string;
}
export type UploadResult = { ok: true; media: { id: string; storageKey: string; alt?: string } } | { ok: false; error: string; status: number };

export const CLIENT_MAX_BYTES = 15 * 1024 * 1024;
export const ACCEPT = "image/jpeg,image/png,image/webp,image/avif";

export function uploadFile(file: File, meta: UploadMeta, onProgress?: (pct: number) => void): Promise<UploadResult> {
  return new Promise((resolve) => {
    if (file.size > CLIENT_MAX_BYTES) return resolve({ ok: false, error: "Fichier trop volumineux (15 Mo maximum).", status: 413 });
    const form = new FormData();
    form.set("file", file);
    for (const [k, v] of Object.entries(meta)) if (v !== undefined && v !== "") form.set(k, String(v));
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/admin/mediatheque/upload");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onerror = () => resolve({ ok: false, error: "Erreur réseau pendant l’envoi.", status: 0 });
    xhr.onload = () => {
      let body: { ok?: boolean; error?: string; media?: { id: string; storageKey: string; alt?: string } } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.media) resolve({ ok: true, media: body.media });
      else if (xhr.status === 401) resolve({ ok: false, error: "Session expirée : reconnectez-vous.", status: 401 });
      else resolve({ ok: false, error: body.error ?? "Échec de l’envoi.", status: xhr.status });
    };
    xhr.send(form);
  });
}
