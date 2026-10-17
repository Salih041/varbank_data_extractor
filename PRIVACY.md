# Privacy Policy — Table Extractor

_Last updated: 2026-10-17_

Table Extractor is a Chrome extension that helps users of Varbank 2.0 (`https://varbank.ccg.uni-koeln.de/varbank2/`) extract table data and, optionally, discuss it with an AI model. This policy explains what data the extension handles.

## Data the extension accesses

- **Website content:** On Varbank 2.0 pages only, the extension reads the text of the data tables shown on the page, when you open the side panel and choose to list or extract tables. It does not run on any other website.
- **Your input:** chat messages you type, your settings, and the Groq API key you enter.

Varbank data may include health and genetic information about patients or samples. Treat it according to your institution's rules.

## How data is used and where it goes

- **Extraction and export** happen entirely in your browser. Downloaded or copied JSON goes only where you put it.
- **AI chat:** when you send a chat message, the message, the relevant chat history and — only if you attached it **and confirmed** in the confirmation dialog — the extracted table data are sent to **Groq, Inc.** (`api.groq.com`, United States) to generate a reply, using your own API key. Sending table data is disabled by default; potentially identifying columns are excluded by default. Groq's handling of this data is governed by Groq's own terms and privacy policy.
- **Never sent:** page URLs, cookies, login/session data, or any data from other websites. The developer of this extension does not operate any server and receives none of your data.

## Data stored on your device

Stored with `chrome.storage` in your browser profile only (not synced):
- your Groq API key (or, if you choose, kept only until the browser closes),
- settings and column preferences,
- chat history including attached data (can be turned off and deleted at any time in Settings).

Removing the extension deletes this data.

## What we do not do

- No analytics, tracking, advertising or remote code.
- No sale or transfer of data to third parties other than the AI request to Groq described above, made at your explicit request.
- No use of data for purposes unrelated to the extension's single purpose.

## Contact

Questions about this policy: open an issue in the project's GitHub repository.
