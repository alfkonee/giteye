# Security Policy

## Supported versions

GitEye is under active development. Security fixes are applied to the latest released version and `main`; older releases are not supported unless a maintainer states otherwise.

| Version | Supported |
|---|---|
| Latest release | Yes |
| Older releases | No |

## Reporting a vulnerability

Do **not** open a public issue for a suspected vulnerability.

Contact the project maintainer privately using the contact method listed on [the maintainer's GitHub profile](https://github.com/alfkonee). State that the message is a GitEye security report and include:

- the affected version and platform;
- the component and code path involved;
- reproducible steps or a minimal proof of concept;
- the expected and observed impact;
- suggested mitigations, if known;
- whether the report or exploit details have been disclosed elsewhere.

Avoid accessing data that is not yours, degrading services, or publishing exploit details before a fix is available. Use disposable repositories and redact credentials, tokens, private keys, repository contents, and personal paths.

The maintainers will acknowledge a complete report as soon as practical, investigate it, and coordinate remediation and disclosure. Timelines vary with severity and maintainer availability. Please allow a reasonable remediation period before public disclosure.

## Security-sensitive areas

Extra care is required around destructive Git operations, filesystem traversal, launcher installation, credential helpers, SSH keys, keychain access, provider authentication, command execution, archive extraction, and external links. Reports about data loss or unsafe recovery behavior are also welcome through the private channel.
