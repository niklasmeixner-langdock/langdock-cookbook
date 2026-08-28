const logEl = document.getElementById("log");
const form = document.getElementById("form");
const input = document.getElementById("input");
const sendBtn = form.querySelector(".send");
const titleEl = document.getElementById("title");
const emojiEl = document.getElementById("emoji");
const messages = [];
let starters = [];
let busy = false;

const escapeHtml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const renderMarkdown = (value) => {
  let html = escapeHtml(value);
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|[\s(])\*(.+?)\*(?=[\s).,!?]|$)/g, "$1<em>$2</em>");
  html = html.replace(/^(?:[-*] .+(?:\n|$))+/gm, (block) => {
    const items = block
      .trim()
      .split("\n")
      .map((line) => `<li>${line.replace(/^[-*] /, "")}</li>`)
      .join("");
    return `<ul>${items}</ul>`;
  });
  html = html
    .split(/\n{2,}/)
    .map((block) =>
      /^(<h[23]|<ul)/.test(block) ? block : `<p>${block.replaceAll("\n", "<br>")}</p>`,
    )
    .join("");
  return html;
};

const scrollToEnd = () => {
  logEl.scrollTop = logEl.scrollHeight;
};

const syncComposer = () => {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  sendBtn.disabled = busy || !input.value.trim();
};

const renderEmpty = () => {
  const wrap = document.createElement("div");
  wrap.className = "empty";
  wrap.innerHTML = `<div class="avatar">${emojiEl.hidden ? "" : emojiEl.textContent}</div><p>How can I help?</p>`;
  if (emojiEl.hidden) wrap.querySelector(".avatar").hidden = true;
  logEl.appendChild(wrap);
  renderStarters();
};

const renderStarters = () => {
  logEl.querySelector(".starters")?.remove();
  if (!starters.length) return;
  const wrap = document.createElement("div");
  wrap.className = "starters";
  for (const starter of starters) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = starter;
    button.addEventListener("click", () => send(starter));
    wrap.appendChild(button);
  }
  const empty = logEl.querySelector(".empty");
  (empty || logEl).appendChild(wrap);
};

const addBubble = (role, text) => {
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  if (role === "assistant") el.innerHTML = renderMarkdown(text);
  else el.textContent = text;
  logEl.appendChild(el);
  scrollToEnd();
  return el;
};

const setStatus = (text) => {
  let el = logEl.querySelector(".status");
  if (!text) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("div");
    el.className = "status";
    el.innerHTML =
      '<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="label"></span>';
    logEl.appendChild(el);
  }
  el.querySelector(".label").textContent = text;
  scrollToEnd();
};

const parseLine = (raw, acc) => {
  if (!raw || raw === "[DONE]") {
    if (raw === "[DONE]") acc.done = true;
    return acc;
  }
  const payload = raw.startsWith("data:") ? raw.slice(5).trim() : raw;
  if (!payload) return acc;
  const prefix = payload[0];
  const rest = payload.slice(2);
  if (prefix === "0") {
    acc.text += JSON.parse(rest);
    acc.onText(acc.text);
    return acc;
  }
  if (prefix !== "{" && prefix !== "[") return acc;
  try {
    const event = JSON.parse(payload);
    if (event.type === "text-delta") {
      const piece =
        typeof event.delta === "string"
          ? event.delta
          : typeof event.text === "string"
            ? event.text
            : "";
      acc.text += piece;
      if (piece) acc.onText(acc.text);
    } else if (event.type === "tool-input-start") {
      acc.usedTools = true;
      if (event.toolCallId) {
        acc.pendingTools.set(
          event.toolCallId,
          event.toolName || "a tool",
        );
      }
      acc.onStatus(`Using ${event.toolName || "a tool"}…`);
    } else if (event.type === "tool-input-available") {
      acc.usedTools = true;
      if (event.toolCallId) {
        acc.pendingTools.set(
          event.toolCallId,
          event.toolName ||
            acc.pendingTools.get(event.toolCallId) ||
            "a tool",
        );
      }
    } else if (
      event.type === "tool-output-available" ||
      event.type === "tool-output-error"
    ) {
      if (event.toolCallId) acc.pendingTools.delete(event.toolCallId);
    } else if (event.type === "reasoning-start") {
      acc.onStatus("Thinking…");
    } else if (event.type === "finish" || event.type === "finish-step") {
      acc.done = event.type === "finish" || acc.done;
    } else if (event.type === "error") {
      acc.error = event.errorText || event.message || "Request failed";
    }
  } catch {
    // ignore keepalives / usage trailer
  }
  return acc;
};

const parseStream = async (response, onText, onStatus) => {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const acc = {
    text: "",
    error: "",
    done: false,
    usedTools: false,
    pendingTools: new Map(),
    onText,
    onStatus,
  };
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) parseLine(line.trim(), acc);
  }
  if (buffer.trim()) parseLine(buffer.trim(), acc);
  return acc;
};

const send = async (text) => {
  if (!text || busy) return;
  busy = true;
  syncComposer();
  logEl.querySelector(".empty")?.remove();
  addBubble("user", text);
  const userMessage = {
    id: crypto.randomUUID(),
    role: "user",
    parts: [{ type: "text", text }],
  };
  messages.push(userMessage);
  let bubble = null;
  const writeText = (next) => {
    setStatus("");
    if (!bubble) bubble = addBubble("assistant", next);
    else bubble.innerHTML = renderMarkdown(next);
    scrollToEnd();
  };
  setStatus("Thinking…");
  try {
    const response = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, stream: true }),
    });
    const type = response.headers.get("content-type") || "";
    let reply = "";
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.message || "Request failed");
    }
    if (type.includes("json") && !type.includes("event-stream")) {
      const payload = await response.json();
      const last = [...(payload.messages || [])]
        .reverse()
        .find((message) => message.role === "assistant");
      reply = last?.content || "";
      if (reply) writeText(reply);
    } else {
      const acc = await parseStream(response, writeText, setStatus);
      reply = acc.text;
      if (!reply && acc.error) throw new Error(acc.error);
      if (!reply) {
        const pending = [...acc.pendingTools.values()].filter(Boolean);
        const unique = [...new Set(pending)];
        const toolLabel = unique.slice(0, 3).join(", ");
        throw new Error(
          unique.length
            ? `Paused on ${toolLabel}. This chat cannot approve actions. Turn off confirmation on the agent, then start a new chat.`
            : acc.usedTools && !acc.done
              ? "The reply was cut off. Try again."
              : acc.usedTools
                ? "The assistant used tools but did not return a message."
                : "No response.",
        );
      }
    }
    setStatus("");
    if (!reply) {
      addBubble("notice", "No response.");
      return;
    }
    messages.push({
      id: crypto.randomUUID(),
      role: "assistant",
      parts: [{ type: "text", text: reply }],
    });
  } catch (error) {
    setStatus("");
    bubble?.remove();
    addBubble(
      "notice",
      error instanceof Error ? error.message : "Something went wrong.",
    );
  } finally {
    busy = false;
    syncComposer();
    input.focus();
  }
};

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = input.value.trim();
  input.value = "";
  syncComposer();
  send(text);
});

document.getElementById("reset").addEventListener("click", () => {
  if (busy) return;
  messages.splice(0);
  logEl.replaceChildren();
  renderEmpty();
  input.focus();
});

input.addEventListener("input", syncComposer);
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

fetch("/config")
  .then((response) => response.json())
  .then((config) => {
    titleEl.textContent = config.name || "Assistant";
    document.title = titleEl.textContent;
    if (config.emoji) {
      emojiEl.textContent = config.emoji;
      emojiEl.hidden = false;
    }
    if (config.conversationStarters?.length) {
      starters = config.conversationStarters;
    }
    if (!messages.length) {
      logEl.replaceChildren();
      renderEmpty();
    }
  })
  .catch(() => {});

renderEmpty();
syncComposer();
input.focus();
