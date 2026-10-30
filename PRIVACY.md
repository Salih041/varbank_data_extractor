# Privacy Policy — Table Extractor

_Last updated: 2026-11-01_

Table Extractor is a Chrome extension that helps users of Varbank 2.0 (`https://varbank.ccg.uni-koeln.de/varbank2/`) extract table data and, optionally, discuss it with an AI assistant. This policy explains what data the extension and its AI server handle.

## Data the extension accesses

- **Website content:** On Varbank 2.0 pages only, the extension reads the text of the data tables shown on the page, when you open the side panel and choose to list or extract tables. It does not run on any other website.
- **Your input:** chat messages you type, your settings, and the AI access key you enter.

Varbank data may include health and genetic information about patients or samples. Treat it according to your institution's rules.

## How data is used and where it goes

- **Extraction and export** happen entirely in your browser. Downloaded or copied JSON goes only where you put it.
- **AI chat** (only if you have an access key and send a message):
  - Your message — and, only if you attached it **and confirmed** in the confirmation dialog, the extracted table data — is sent to the **Table Extractor AI server** operated by the developer of this extension.
  - The server forwards the conversation to **Groq, Inc.** (United States) to generate a reply. Groq's handling of this data is governed by Groq's own terms and privacy policy.
  - When the assistant decides to search the web, only its short search terms are sent to **Tavily** (web search API). Table rows and identifiers are not put into search terms.
  - Sending table data is disabled by default; potentially identifying columns are excluded by default.
- **Never sent:** page URLs, cookies, Varbank login/session data, or any data from other websites.

## Data stored on the AI server

- The conversation (your messages, attached table data, the assistant's replies and search results) is stored on the server so the assistant can remember earlier messages in the same chat.
- It is linked only to a random install ID created by the extension — not to your name, e-mail or Varbank account.
- It is deleted when you delete the chat (or all chat history) in the extension, and automatically after at most **7 days**.
- Server logs contain only technical information (e.g. error types and request counts), never message contents or keys.

## Data stored on your device

Stored with `chrome.storage` in your browser profile only (not synced):
- your AI access key (or, if you choose, kept only until the browser closes) and a random install ID,
- settings and column preferences,
- chat history including attached data (can be turned off and deleted at any time in Settings).

Removing the extension deletes this data from your device.

## What we do not do

- No analytics, tracking, advertising or remote code.
- No sale of data, and no transfer of data to third parties other than the AI requests to Groq and the search terms sent to Tavily described above, made at your request.
- No use of data for purposes unrelated to the extension's single purpose.

## Contact

Questions about this policy: open an issue in the project's GitHub repository.
