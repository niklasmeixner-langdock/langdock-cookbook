import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";

loadEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "../static");

const PORT = Number(process.env.PORT || 3333);
const HOST = process.env.HOST || "0.0.0.0";
const API_KEY = process.env.LANGDOCK_API_KEY;
const AGENT_ID = process.env.LANGDOCK_AGENT_ID;
const API_BASE = (
  process.env.LANGDOCK_API_BASE || "https://api.langdock.com"
).replace(/\/$/, "");
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

function completionsPath(base: string): string {
  try {
    const { hostname } = new URL(base);
    if (hostname === "api.langdock.com" || hostname.startsWith("api.")) {
      return "/agent/v1/chat/completions";
    }
  } catch {
    // dedicated / local Langdock uses the /api/public prefix
  }
  return "/api/public/agent/v1/chat/completions";
}

function getPath(base: string): string {
  return completionsPath(base).replace("/chat/completions", "/get");
}

const COMPLETIONS_URL = `${API_BASE}${completionsPath(API_BASE)}`;
const GET_URL = `${API_BASE}${getPath(API_BASE)}`;

function frameAncestorsHeader(): string {
  if (ALLOWED_ORIGINS.includes("*")) {
    return "*";
  }
  return ALLOWED_ORIGINS.join(" ");
}

function send(
  res: ServerResponse,
  status: number,
  body: string | Buffer,
  headers: Record<string, string> = {},
): void {
  res.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Security-Policy": `frame-ancestors ${frameAncestorsHeader()}`,
    ...headers,
  });
  res.end(body);
}

function sendJson(
  res: ServerResponse,
  status: number,
  payload: unknown,
): void {
  send(res, status, JSON.stringify(payload), {
    "Content-Type": "application/json; charset=utf-8",
  });
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

let agentMeta = {
  name: process.env.WIDGET_TITLE || "Assistant",
  emoji: "",
  conversationStarters: [] as string[],
};

async function loadAgentMeta(): Promise<void> {
  if (!API_KEY || !AGENT_ID) {
    return;
  }
  const url = `${GET_URL}?agentId=${encodeURIComponent(AGENT_ID)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!response.ok) {
    console.error("agent get failed", { status: response.status });
    return;
  }
  const payload = (await response.json()) as {
    agent?: {
      name?: string;
      emojiIcon?: string;
      conversationStarters?: string[];
    };
    name?: string;
    emojiIcon?: string;
    conversationStarters?: string[];
  };
  const agent = payload.agent ?? payload;
  agentMeta = {
    name: agent.name || agentMeta.name,
    emoji: agent.emojiIcon || "",
    conversationStarters: Array.isArray(agent.conversationStarters)
      ? agent.conversationStarters
      : [],
  };
}

async function serveStatic(urlPath: string, res: ServerResponse): Promise<void> {
  const aliases: Record<string, string> = {
    "/demo": "/demo.html",
    "/intranet": "/demo.html",
  };
  const relative =
    urlPath === "/"
      ? "/index.html"
      : aliases[urlPath] ||
        aliases[urlPath.toLowerCase()] ||
        decodeURIComponent(urlPath);
  const filePath = path.normalize(path.join(PUBLIC_DIR, relative));
  if (!filePath.startsWith(PUBLIC_DIR) || !existsSync(filePath)) {
    if (!filePath.startsWith(PUBLIC_DIR)) {
      send(res, 403, "Forbidden");
      return;
    }
    send(res, 404, "Not found");
    return;
  }
  const body = await readFile(filePath);
  const ext = path.extname(filePath);
  send(res, 200, body, {
    "Content-Type": MIME[ext] || "application/octet-stream",
  });
}

async function handleChat(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!API_KEY || !AGENT_ID) {
    sendJson(res, 503, {
      message: "Set LANGDOCK_API_KEY and LANGDOCK_AGENT_ID, then restart.",
    });
    return;
  }

  let parsed: { messages?: unknown; stream?: boolean };
  try {
    parsed = JSON.parse(await readBody(req)) as {
      messages?: unknown;
      stream?: boolean;
    };
  } catch {
    sendJson(res, 400, { message: "Invalid JSON" });
    return;
  }

  const messages = parsed.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    sendJson(res, 400, { message: "messages required" });
    return;
  }

  req.setTimeout(0);
  res.setTimeout(0);

  const upstream = await fetch(COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      agentId: AGENT_ID,
      messages,
      stream: parsed.stream !== false,
      maxSteps: 20,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text();
    send(res, upstream.status, text, {
      "Content-Type":
        upstream.headers.get("content-type") || "application/json",
    });
    return;
  }

  const contentType =
    upstream.headers.get("content-type") || "text/event-stream; charset=utf-8";
  res.writeHead(200, {
    "Cache-Control": "no-cache, no-store",
    Connection: "keep-alive",
    "Content-Security-Policy": `frame-ancestors ${frameAncestorsHeader()}`,
    "Content-Type": contentType,
    "X-Accel-Buffering": "no",
  });

  await pipeline(
    Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]),
    res,
  );
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  try {
    if (req.method === "GET" && url.pathname === "/config") {
      sendJson(res, 200, agentMeta);
      return;
    }
    if (req.method === "POST" && url.pathname === "/chat") {
      await handleChat(req, res);
      return;
    }
    if (req.method === "GET") {
      await serveStatic(url.pathname, res);
      return;
    }
    send(res, 405, "Method not allowed");
  } catch (error) {
    console.error("request failed", {
      path: url.pathname,
      error: error instanceof Error ? error.name : "unknown",
    });
    if (!res.headersSent) {
      sendJson(res, 500, { message: "Internal error" });
    } else {
      res.end();
    }
  }
});

server.timeout = 0;
server.requestTimeout = 0;
server.headersTimeout = 0;

const listen = () => {
  server.listen(PORT, HOST, () => {
    console.log(`Agent embed widget on http://${HOST}:${PORT}`);
    console.log(`Demo: http://127.0.0.1:${PORT}/demo.html`);
  });
};

if (!API_KEY || !AGENT_ID) {
  console.warn(
    "LANGDOCK_API_KEY / LANGDOCK_AGENT_ID unset — UI only, chat disabled",
  );
}

loadAgentMeta()
  .catch((error: unknown) => {
    console.error("agent meta skipped", {
      error: error instanceof Error ? error.name : "unknown",
    });
  })
  .finally(listen);
