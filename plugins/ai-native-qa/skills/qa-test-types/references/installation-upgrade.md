# Installation and upgrade

**Goal:** the product installs, upgrades and uninstalls as its guide says.
**Oracle:** the installation guide and release notes.

## Checklist
- Clean install on each supported OS version; prerequisites and their error messages.
- Upgrade from each supported earlier version; data and settings kept.
- Uninstall removes what the guide says and keeps what it says to keep.
- Install with a non-admin user where supported; paths with spaces and Arabic characters.

## Tools
The tester runs installers on test machines or VMs (human-run protocol in `qa-execution`).
Claude prepares the steps and records results from pasted screenshots and logs.

## Evidence
Installer logs, screenshots of each wizard result, version screen after the upgrade.

## Not a bug
A machine that does not meet the documented prerequisites (environment issue).
