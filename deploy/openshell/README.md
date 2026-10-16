# Running Mnemos inside an NVIDIA OpenShell sandbox

The Personal AI track asks for a private assistant "assembled, secured, and run"
with tools including OpenShell. This is how that works for Mnemos, and what we
verified versus what we are asserting.

## Verified

From the [OpenShell repo](https://github.com/NVIDIA/OpenShell) and
[policy docs](https://docs.nvidia.com/openshell/latest/how-it-works/policies/network-rules):

* Apache-2.0, install: `curl -LsSf https://raw.githubusercontent.com/NVIDIA/OpenShell/main/install.sh | sh`
* Create a sandbox: `openshell sandbox create --name demo`
* Network policy is **default-deny**; rules map **binaries → endpoints**
  (`host`, `port`), `deny_rules` override allows, `enforcement: audit` logs instead of blocking.
* Platform support: Linux, macOS on Apple Silicon, **Windows via WSL 2 (experimental)**.

## Steps

```bash
# 1. install + create
curl -LsSf https://raw.githubusercontent.com/NVIDIA/OpenShell/main/install.sh | sh
openshell sandbox create --name mnemos

# 2. validate the policy BEFORE trusting it (field names beyond the minimal
#    shape are not asserted — see policy.yaml header)
openshell validate policy.yaml        # confirm the exact subcommand with --help

# 3. run Mnemos inside it. Only two hosts are reachable:
#    api.tokenfactory.nebius.com (Nemotron 3 + Qwen3 embeddings)
#    api.tavily.com               (web search)
node src/server.js
```

## What this buys the product

Outbound traffic from the memory engine is limited to the inference API and the
search API you chose. A prompt-injected agent inside the sandbox cannot phone
home to an attacker's server, because that host is not in the allowlist and the
kernel enforces it. `src/brain.js` adds the application-level half (SSRF guard,
red zone, 100 KB body cap, no remote URL fetch for images); OpenShell is the
OS-level half.

## Honest limits

* We developed and demoed Mnemos on Windows without a sandbox; the OpenShell
  path is **packaged and documented, not run by us** (Linux kernel required,
  WSL 2 support is labelled experimental upstream).
* We did not run NVIDIA NemoClaw either: it is alpha, needs Docker + 8 GB RAM,
  and Windows is only supported "with limitations" via WSL 2. Our Hermes/MCP
  integration (`src/mcp.js`, `mcp.example.json`) is the part we could verify on
  this machine, and we verified it.
