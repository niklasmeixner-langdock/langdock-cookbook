# Langdock Cookbook

Practical, self-contained recipes for recurring problems when building on top of
Langdock — primarily **MCP servers** and **A2A agents**. Each recipe is a small,
runnable project that solves one problem well and explains how it works.

> Maintained by the Langdock Solutions Engineering (SE) team. See
> [CONTRIBUTING.md](CONTRIBUTING.md).

## Recipes

### MCP — [`mcp/`](mcp/)

| Recipe | Problem it solves |
|---|---|
| [Authentication → Okta (DCR)](mcp/authentication/okta-dcr/) | OAuth 2.0 for an MCP server, delegating to Okta with Dynamic Client Registration. |
| [Authentication → Entra ID (DCR)](mcp/authentication/entra-dcr/) | OAuth 2.0 for an MCP server, delegating to Microsoft Entra ID with Dynamic Client Registration. |
| [Apps & UI → Google Maps](mcp/apps-ui/google-maps/) | An MCP server that renders an interactive, embedded UI (a live Google Map) in the client. |
| [File uploads](mcp/file-uploads/) | Accepting file inputs in an MCP tool and resolving Langdock file references into structured `FileData`. |

### A2A — [`a2a/`](a2a/)

| Recipe | Problem it solves |
|---|---|
| [Langdock A2A demo](a2a/langdock-a2a-demo/) | A minimal A2A agent compatible with Langdock's implementation of the A2A protocol. |

## Repository layout

```
.
├── mcp/                       # Model Context Protocol recipes
│   ├── authentication/        # OAuth + Dynamic Client Registration (shared explainer)
│   │   ├── okta-dcr/
│   │   └── entra-dcr/
│   ├── apps-ui/               # MCP Apps / interactive UI
│   │   └── google-maps/
│   └── file-uploads/
└── a2a/                       # Agent-to-Agent recipes (separate from MCP)
    └── langdock-a2a-demo/
```

The top level groups recipes by **protocol**; the next level groups by **problem**.
Browse by the problem you have.

## Using a recipe

Every recipe is independent — clone the repo (or copy a single folder), then work
inside that folder. The stack is consistent across all current recipes:

- **TypeScript + Node.js**, managed with **pnpm**

```bash
cd mcp/authentication/okta-dcr   # or any recipe folder
pnpm install
cp .env.example .env             # where applicable — fill in your values
pnpm dev                         # see the recipe's own README for exact scripts
```

Each recipe's own `README.md` is the source of truth for its setup, configuration,
and how it works.

## License

[MIT](LICENSE). Individual recipes that were imported from other repositories may
retain their own `LICENSE` file with original attribution (e.g.
[`mcp/file-uploads/LICENSE`](mcp/file-uploads/LICENSE)).
