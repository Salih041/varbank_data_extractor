# Table Extractor

A Chrome extension (Manifest V3) for [Varbank 2.0](https://varbank.ccg.uni-koeln.de/varbank2/) that extracts selected rows and columns from its tables as **JSON** and lets you discuss the data with an AI model via **Groq**.

> Not affiliated with or endorsed by the Cologne Center for Genomics (CCG). "Varbank" is used only to describe the site this tool works with.

## Features

- **Table extraction** — lists every data table on the page (jqGrid), highlights the one currently on screen, and extracts:
  - rows: selected on the site, all visible rows, or picked manually in the panel
  - columns: any subset (hidden columns available), optionally with cell links
- **Export** — download as a `.json` file or copy to the clipboard.
- **AI chat** — streaming chat with a Groq model in the side panel; attach extracted data to a message.
- **Side panel UI** — stays open next to the site; can also be opened in a wide window (⧉). Soft, low-glare light theme.
- **Adjustable text size** — five sizes in **Settings → Appearance**, or the **A− / A+** buttons at the top of the panel; the whole layout scales with it.
- **Privacy first** — nothing is sent anywhere without your explicit confirmation (see [Privacy](#privacy-and-security)).

## Installation (from source)

Requirements: Node.js 22.12+ and Chrome 116+.

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

## Usage

1. Log in to Varbank and load a table (e.g. *Variants → Variation Data*). Optionally tick rows on the site.
2. **Tables** tab — choose a table, a row mode and the columns, then **Extract data**.
3. **Download JSON**, **Copy**, or **Add to chat**.
4. **Chat** tab — ask a question. If data is attached, a confirmation dialog shows exactly what will be sent before anything leaves your browser.

Only the page currently shown in the site's table is extracted (Varbank pages its tables on the server). Increase the page size on the site to extract more rows.

### Groq API key

The extension uses your own Groq API key ("bring your own key"). Enter it in **Settings → Groq API key**; it is verified against Groq, then stored only in this browser (`chrome.storage.local`, or session-only if you choose). It is never part of the source code or this repository.

## Privacy and security

- Runs only on `https://varbank.ccg.uni-koeln.de/varbank2/*`; the icon is inactive elsewhere.
- Table cells are treated as untrusted data: read as plain text only, never rendered as HTML.
- AI responses are rendered as sanitized Markdown (no raw HTML, no images, `http(s)` links only).
- Sending table data to the AI is **off by default** and requires confirmation; potentially identifying columns (sample, owner, phenotype, IDs, …) are excluded by default.
- Request size is limited and shown before sending (rows, columns, characters, ~tokens).
- Errors never include API keys or request contents.
- Chat history is stored locally only and can be disabled or deleted in Settings.

See [PRIVACY.md](PRIVACY.md) for the privacy policy. Groq states that inference inputs/outputs are not retained by default but may be logged for up to 30 days for reliability/abuse investigations; enabling **Zero Data Retention** in the Groq console is recommended ([Groq: Your Data](https://console.groq.com/docs/your-data)).

## What is sent to the AI

Every request contains, in order: a fixed system prompt, as much chat history as fits the model's context window, and your new message. Attached data is sent inside the user message as a compact tab-separated table between `<<<VARBANK_DATA` and `VARBANK_DATA>>>` markers. The most recent attachment is sent in full; older ones are sent as a one-line summary. Page URLs, cookies and session data are never sent.

## Development

| Command | Description |
|---|---|
| `npm run build` | Build the extension into `dist/` |
| `npm test` | Run unit tests (Vitest + jsdom) |
| `npm run check:secrets` | Scan sources and build output for API keys |
| `npm run package` | Test, build, scan and create the store zip in `release/` |

```
public/            manifest.json and icons
src/content/       content script: jqGrid DOM parser and change watcher
src/background/    service worker: icon rules, API key storage, Groq client
src/sidepanel/     React UI (Tables / Chat / Settings)
src/shared/        limits, sanitizing, redaction, message contract
tests/             unit tests with synthetic fixtures (no real data)
scripts/           secret scan, icon generator, store packaging
```

## License

[MIT](LICENSE)
