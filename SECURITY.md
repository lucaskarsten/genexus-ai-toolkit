# Security Policy

## Reporting a Vulnerability

If you discover a security issue in this repository (e.g. a script that exposes credentials, an example that enables injection, or a skill that leaks sensitive data), **do not open a public issue**.

Please report it privately by emailing the maintainer:

**lucaskarsten@hotmail.com**

Include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact

You can expect an acknowledgement within 5 business days.

## Scope

This repository contains documentation, skill prompts, and GeneXus `.view` example files. It does not ship production binaries or a runtime. Security concerns most likely to apply:

- Scripts (`scripts/`) executing with elevated permissions or leaking env vars
- Skill files (`skills/`) containing hardcoded credentials or internal URLs
- Example files (`examples/`) with injection-prone patterns

## Out of scope

Theoretical issues with no practical exploit path and vulnerabilities in third-party tools (GeneXus IDE, Tomcat, etc.) are out of scope.
