/**
 * Scheme and address of a request as the user sees it. Caddy sets X-Forwarded-Proto to the scheme the request
 * actually arrived with (it drops what clients send). Without the header the request came straight to the app
 * (healthcheck, `next dev`) and the URL's own scheme applies.
 */
export function requestProto(headers: Headers, urlProtocol: string): "http" | "https" {
  const forwarded = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return (forwarded ?? urlProtocol.replace(/:$/, "")) === "https" ? "https" : "http";
}

export function requestOrigin(headers: Headers, url: string): string {
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? new URL(url).host;
  return `${requestProto(headers, new URL(url).protocol)}://${host}`;
}

/**
 * Where to send a plain-HTTP request when only HTTPS is allowed, or null. Only requests Caddy forwarded as HTTP are
 * redirected; direct requests to the app never are, so the container healthcheck keeps working.
 */
export function httpsRedirect(httpsOnly: boolean, headers: Headers, url: string): string | null {
  if (!httpsOnly || headers.get("x-forwarded-proto")?.split(",")[0]?.trim() !== "http") return null;
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? new URL(url).host).replace(/:80$/, "");
  const { pathname, search } = new URL(url);
  return `https://${host}${pathname}${search}`;
}
