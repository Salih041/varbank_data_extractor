# Table Extractor

A Chrome extension (Manifest V3) for [Varbank 2.0](https://varbank.ccg.uni-koeln.de/varbank2/) that extracts selected rows and columns from its tables as **JSON** and lets you discuss the data with an **AI assistant** that can search the web and ask you clarifying questions.

> Not affiliated with or endorsed by the Cologne Center for Genomics (CCG). "Varbank" is used only to describe the site this tool works with.

## Features

- **Table extraction** — lists every data table on the page (jqGrid), highlights the one currently on screen, and extracts:
  - rows: selected on the site, all visible rows, or picked manually in the panel
  - columns: any subset (hidden columns available), optionally with cell links
- **Export** — download as a `.json` file or copy to the clipboard.
- **AI assistant (agentic)** — a [LangGraph](https://langchain-ai.github.io/langgraph/) agent that decides for each message whether to
  - answer directly from your data,
  - search the web (shown as *Searching: …*, with a source list), or
  - ask you a short question first (with answer buttons).
- **Invitation only** — the AI chat needs an access key from the project owner. Table extraction works without it.
- **Side panel UI** — stays open next to the site; can also be opened in a wide window (⧉). Soft, low-glare light theme.
- **Adjustable text size** — five sizes in **Settings → Appearance**, or the **A− / A+** buttons at the top of the panel.
- **Privacy first** — table data is never sent without your explicit confirmation (see [Privacy](#privacy-and-security)).

## Architecture

```
Chrome extension (side panel)  ──HTTPS + SSE──►  Agent server (server/, Python)
                                                   FastAPI + LangGraph
                                                   ├─ LLM: Groq
                                                   ├─ web_search: Tavily
                                                   └─ ask_user: interrupt / resume
```

The extension never talks to Groq directly; the model and search API keys live only on the server.
See [server/README.md](server/README.md) for running the server.

## Installation (from source)

Requirements: Node.js 22.12+, Chrome 116+, and the agent server (Python 3.11+, [uv](https://docs.astral.sh/uv/)).

```bash
npm install
```

```bash
npm run build
```

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select the `dist/` folder.
3. Reload any open Varbank tab (content scripts are injected on page load).
4. On a Varbank page, click the extension icon to open the side panel.

The development build talks to the server at `http://localhost:8000`. For a release build, pass the server address at build time; the code and the manifest's host permission are both set from it, and `npm run package` refuses to package a build that still points to localhost:

```bash
$env:AGENT_URL="https://<your-server>"; npm run package
```

## Usage

1. Log in to Varbank and load a table (e.g. *Variants → Variation Data*). Optionally tick rows on the site.
2. **Tables** tab — choose a table, a row mode and the columns, then **Extract data**.
3. **Download JSON**, **Copy**, or **Add to chat**.
4. **Settings → AI access key** — enter the key you were given (verified against the server, stored only in this browser).
5. **Chat** tab — ask a question. If data is attached, a confirmation dialog shows exactly what will be sent before anything leaves your browser.

Only the page currently shown in the site's table is extracted (Varbank pages its tables on the server). Increase the page size on the site to extract more rows.

## Privacy and security

- Runs only on `https://varbank.ccg.uni-koeln.de/varbank2/*`; the icon is inactive elsewhere.
- Table cells and web search results are treated as untrusted data: never rendered as HTML, and the agent is told not to follow instructions found in them.
- AI responses are rendered as sanitized Markdown (no raw HTML, no images, `http(s)` links only).
- Sending table data to the AI is **off by default** and requires confirmation; potentially identifying columns (sample, owner, phenotype, IDs, …) are excluded by default.
- Web search queries are short keywords written by the agent; table rows and identifiers are not put into them.
- The server requires the access key, limits request rates and sizes, and never logs message contents or keys.
- Each conversation on the server is tied to a random install ID; deleting a chat in the extension deletes it on the server too.

See [PRIVACY.md](PRIVACY.md) for the privacy policy.

## What is sent to the AI

Each message sends only your new text (and, if confirmed, the attached table as compact tab-separated text) to the agent server. The server keeps the conversation history for the agent's memory, adds a fixed system prompt and sends as much recent history as fits the model's context to Groq. Attached data is wrapped in `<<<VARBANK_DATA` … `VARBANK_DATA>>>` markers. Page URLs, cookies and Varbank session data are never sent.

## Development

| Command | Description |
|---|---|
| `npm run build` | Build the extension into `dist/` |
| `npm test` | Run extension unit tests (Vitest + jsdom) |
| `npm run check:secrets` | Scan sources, server code and build output for API keys |
| `npm run package` | Test, build, scan and create the store zip in `release/` |
| `uv run pytest` (in `server/`) | Run server tests (fake LLM and search, no network) |

```
public/            manifest.json and icons
src/content/       content script: jqGrid DOM parser and change watcher
src/background/    service worker: icon rules, access key / install ID, agent server client
src/sidepanel/     React UI (Tables / Chat / Settings)
src/shared/        limits, sanitizing, redaction, message contract
tests/             extension unit tests with synthetic fixtures (no real data)
server/            agent server (FastAPI + LangGraph) and its tests
scripts/           secret scan, icon generator, store packaging
```

## License

[MIT](LICENSE)
