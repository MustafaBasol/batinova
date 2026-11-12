// Minimal in-memory S3 (path-style PUT/GET/HEAD/DELETE) for driver tests. No network beyond 127.0.0.1.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface FakeS3 {
  endpoint: string;
  objects: Map<string, { body: Buffer; type: string }>;
  close(): Promise<void>;
}

export async function startFakeS3(): Promise<FakeS3> {
  const objects = new Map<string, { body: Buffer; type: string }>();
  const server: Server = createServer((req, res) => {
    const key = decodeURIComponent((req.url ?? "/").split("?")[0]!.replace(/^\//, ""));
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      if (req.method === "PUT") {
        objects.set(key, { body: Buffer.concat(chunks), type: String(req.headers["content-type"] ?? "application/octet-stream") });
        res.writeHead(200, { ETag: '"fake"' }).end();
      } else if (req.method === "GET" || req.method === "HEAD") {
        const o = objects.get(key);
        if (!o) {
          res.writeHead(404, { "content-type": "application/xml" }).end(req.method === "GET" ? "<Error><Code>NoSuchKey</Code><Message>missing</Message></Error>" : undefined);
          return;
        }
        res.writeHead(200, { "content-type": o.type, "content-length": o.body.length, ETag: '"fake"' });
        res.end(req.method === "GET" ? o.body : undefined);
      } else if (req.method === "DELETE") {
        objects.delete(key);
        res.writeHead(204).end();
      } else res.writeHead(405).end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  return { endpoint: `http://127.0.0.1:${port}`, objects, close: () => new Promise<void>((r) => server.close(() => r())) };
}
