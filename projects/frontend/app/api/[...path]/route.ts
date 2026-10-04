import { env } from "cloudflare:workers";
// NextRequest is a framework wrapper; pass its URL and fields to the native binding.
const proxy = (request: Request) =>
  env.BACKEND.fetch(request.url, {
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
    redirect: "manual",
  });
export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
