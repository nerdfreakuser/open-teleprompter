# Security

## No secrets in this repository

This project must never contain:

- API keys (Anthropic, OpenAI, or otherwise)
- `.env` files with credentials
- Private certificates or signing keys

Optional AI features use a key the **end user** enters in the app. That key stays on their machine and is only sent to the AI provider when they run AI Format.

## Reporting issues

Open a [GitHub issue](https://github.com/nerdfreakuser/founder-teleprompter/issues) for vulnerabilities or concerns. Do not post secrets in issues.
