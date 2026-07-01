# Langdock Cookbook

A collection of production-ready boilerplates to accelerate your development on
Langdock. We've identified patterns that come up more often and turned each one
into a small, runnable project built to production standards. Rather than
starting from scratch, you begin with a working foundation and adapt it to your
organization's specific requirements. Some of these solutions will not be
available natively due to their customization needs, so these boilerplates give
you a proven starting point to build them yourself.

- **[MCP recipes](mcp/)** — authentication (OAuth + DCR), interactive UI, file uploads
- **[A2A recipes](a2a/)** — agents on the A2A protocol

Each section's README lists its recipes; each recipe folder is standalone with
its own README.

## Using a recipe

Clone the repo (or copy a single folder) and work inside that folder. All current
recipes are **TypeScript + Node.js**, managed with **pnpm**:

```bash
cd mcp/authentication/okta-dcr   # any recipe folder
pnpm install
cp .env.example .env             # where applicable
pnpm dev                         # see the recipe's README for exact scripts
```

---

Maintained by the Langdock Solutions Engineering team — see
[CONTRIBUTING.md](CONTRIBUTING.md). Licensed [MIT](LICENSE) (imported recipes may
keep their own `LICENSE` for attribution).
