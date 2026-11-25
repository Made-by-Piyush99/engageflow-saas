# EngageFlow SaaS

EngageFlow is a self-hosted platform designed to automate Instagram direct messages from comments. It provides a web dashboard, rule builder, multi-action CTA buttons (web links, PDF documents, images, and quick replies), and a two-step follow-up reply flow.

## Getting Started

1. Ensure Node.js (version 18 or newer) is installed.
2. Clone the repository.
3. Copy `.env.example` to `.env` and set your configuration variables.
4. Run `node server.js` to start the server on port 5050.
5. Visit `http://localhost:5050` in your web browser.

## Features

- Zero third-party npm dependencies; built with native Node.js APIs.
- Interactive rule builder supporting keyword triggers, regex, and exclusions.
- Action button support for web URLs, downloadable PDFs, images, and quick reply triggers.
- Multi-step flow: send an initial direct message and follow up when users tap a quick reply.
- Built-in simulator to test responses and user flows locally.
- Lead capture and CSV export.
