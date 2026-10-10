export function allowedRedirectOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const origins: string[] = [];
  const web = env["WEB_PUBLIC_URL"];
  if (web) {
    try { origins.push(new URL(web).origin); } catch { /* ignore malformed env */ }
  }
  if (env["NODE_ENV"] !== "production") origins.push("http://localhost:3000");
  return origins;
}

export function isAllowedRedirect(url: string, origins: string[] = allowedRedirectOrigins()): boolean {
  try {
    const u = new URL(url);
    return (u.protocol === "https:" || u.protocol === "http:") && origins.includes(u.origin);
  } catch {
    return false;
  }
}
