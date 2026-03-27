/**
 * Static File Server for Web Dashboard
 * 
 * Serves the dashboard HTML from an embedded string (read at build time)
 * or from the filesystem at runtime.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Try to load dashboard HTML - check multiple possible locations
function loadDashboardHtml(): string {
  const candidates = [
    join(__dirname, "dashboard.html"),                    // dist/web/dashboard.html
    join(__dirname, "..", "..", "src", "web", "dashboard.html"),  // src/web/dashboard.html (dev)
  ];

  for (const path of candidates) {
    if (existsSync(path)) {
      return readFileSync(path, "utf-8");
    }
  }

  return `<!DOCTYPE html>
<html><head><title>Universal Memory Dashboard</title></head>
<body style="background:#0a0e17;color:#e8edf5;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh">
<div style="text-align:center">
<h1>⚠️ Dashboard HTML not found</h1>
<p>Please ensure dashboard.html is present in the web directory.</p>
</div></body></html>`;
}

let cachedHtml: string | null = null;

export function serveDashboard(req: IncomingMessage, res: ServerResponse, url: URL): boolean {
  // Serve dashboard at root path
  if (url.pathname === "/" || url.pathname === "/dashboard" || url.pathname === "/index.html") {
    if (!cachedHtml) {
      cachedHtml = loadDashboardHtml();
    }

    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    });
    res.end(cachedHtml);
    return true;
  }

  return false;
}
