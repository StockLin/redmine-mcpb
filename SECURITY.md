# Security Policy

## Reporting a vulnerability

Please **don't open a public issue** for security problems. Report them privately instead:

1. Go to the [Security tab](https://github.com/StockLin/redmine-mcpb/security) of this repository.
2. Click **Report a vulnerability** and describe the problem and how to reproduce it.

You'll get a reply as soon as possible. Once a fix is released, the report can be published with credit to you if you like.

## Supported versions

Only the [latest release](https://github.com/StockLin/redmine-mcpb/releases/latest) receives security fixes.

## Scope

Things we especially want to hear about:

- The Redmine API key being sent anywhere other than the configured Redmine URL, or shown to the model
- A way to delete data, move issues, change trackers, change project settings or bulk-edit issues **without** the user's confirmation
- Reading or writing files outside the folders the user allowed for attachments

The threat model is prompt injection: text stored in Redmine (issues, notes, wiki pages) trying to make the AI misuse the tools. See the Safety section of the [README](README.md).
