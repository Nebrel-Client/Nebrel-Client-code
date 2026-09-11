# Nebrel Launcher

A custom Minecraft launcher: modpacks, mod management, cosmetics, friends, and
local server hosting with a public relay so a world can be shared without any
router setup.

## Origin and license

Nebrel Launcher is an independent project maintained by Paul Reitz. It began
as a fork of the open-source [NoRiskClient/noriskclient-launcher](https://github.com/NoRiskClient/noriskclient-launcher)
codebase and has since been substantially rewritten and rebranded: its own
name, icons and visual design, its own backend and hosting infrastructure at
`nebrel.de`, its own update channel and signing key, and its own storage
format.

Nebrel Launcher is **not affiliated with, endorsed by, or sponsored by
NoRisk Client / NoRisk GmbH**. Any resemblance in underlying code structure is
a consequence of the shared GPL-3.0 origin, not of copying proprietary NoRisk
assets, servers or branding.

This project is licensed under the **GNU General Public License v3.0** (see
[`LICENSE`](LICENSE)), the same license as the project it originated from, as
required by that license's terms. Source: <https://github.com/Nebrel-Client/Nebrel-Client-code>.

## Development

```bash
yarn install
yarn tauri dev
```

See `nebrel-backend/README.md` for the companion server (accounts, friends,
and the hosting relay).
