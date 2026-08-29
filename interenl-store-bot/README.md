# InterENL Store License Bot

A production-ready, **all-in-one** Discord.js v14 community bot: genuine **InterENL Store** license management, full server moderation with anti-nuke protection, a private ticket system, a complete **VSC** economy, and a full engagement suite — XP/Leveling, a 50-level Battle Pass, Achievements, Mini-Games, Daily/Weekly Challenges, and Giveaways — all wired together and sharing the same VSC currency. Plain JavaScript, JSON file storage, no database required.

---

## 🩹 Recent fixes

- **Fixed `@everyone`/`@here`/role/user mentions not actually notifying anyone.** Discord only turns mentions into a real ping when they're in a message's `content` — a mention typed inside an **embed** (like `/announce`'s message field) just renders as flat text and never notifies. `/announce` (and every other system that needs to ping someone — level-ups, Battle Pass level-ups, giveaway winners, the welcome message) now sends any real mention tokens in `content` alongside the embed. See `utils/mentionHelper.js`.
- **Fixed License Leak Detection silently exempting admins.** `ignoreAdminsInLeakScan` defaulted to `true`, so an admin's own test post of a real key was never caught — indistinguishable from "leak detection doesn't work." Now defaults to `false`. Note: this only ever catches keys posted somewhere the bot can read (a server channel, or DMed to the bot). A DM sent directly between two Discord users, with the bot not involved, is invisible to any bot on the platform — that's a Discord limitation, not something any bot code can see around.
- **Fixed ticket creators being unable to type in their own ticket.** Tickets were private *threads*, where "can view" is thread membership but "can send" is controlled by the parent channel's permissions — a member added to the thread could still be silently blocked from typing by the parent channel's settings. Tickets are now real private *channels* with explicit per-member permission overwrites (creator + Staff + Owner, nobody else), giving exact control.
- **Fixed `/unmute` silently failing.** It was looking up the Muted role by name every time and swallowing any removal error. Now the role is tracked by ID, permission/hierarchy is verified up front, and the member is re-fetched after removal to confirm it actually worked.
- **Fixed commands randomly erroring** from blowing past Discord's 3-second reply window on slow admin/mod actions — everything defers immediately now.
- **Fixed `/announce` "channel not found."** Read from `.env` (`ANNOUNCE_CHANNEL_ID`), verified at startup.
- **Fixed custom emoji shortcodes not rendering** in modals (e.g. `:interenlstorelogo:` in `/announce`) — the bot converts them itself since Discord's own autocomplete doesn't work inside modals.
- `/profile` is open to everyone (previously Owner/Admin only) — it's the community engagement hub, not an admin tool.

---

## ✨ Features

### License Management
- Owner + Admin permission system, secure license key generation (`INTERENL-XXXX-XXXX-XXXX-XXXX`), full lifecycle (generate/check/info/list/search/renew/suspend/unsuspend/revoke).
- Automatic expiration checker + **License Leak Detection** (deletes leaked keys, suspends/revokes, DMs the owner, alerts admins).

### Moderation & Anti-Nuke
- Multi-language profanity filter, anti-spam, anti-link — auto delete + mute.
- Real timed mutes that survive restarts. `/ban`, `/kick`, `/mute`, `/unmute`, `/warn`, `/warnings`, `/purge`, `/lock`, `/unlock`.
- Anti-nuke auto-bans/kicks bursts of channel/role deletions, mass bans/kicks, mass webhook creation, and reverts unauthorized Administrator grants.

### 🎫 Tickets
`/ticketpanel` posts a category dropdown (Support / Partnership / Shop). Selecting one opens a private thread, adds the requester, pings Staff/Owner, with Close/Claim/Add User buttons.

### 👋 Welcome Messages
New members get a branded embed (`%username%`, `{member}`, and `:shortcode:` emoji placeholders, fully configurable) posted in `WELCOME_CHANNEL_ID`, with a real ping so they actually get notified.

### 💰 Economy (VSC)
Loot Drops, `/daily`, `/work`, `/pay`, `/transfer`, full admin toolkit (`/addcoins`, `/blacklist`, etc.) — unchanged and still the single source of truth for the currency. Every new system below **reuses this same VSC balance** — nothing introduces a second currency.

### ⭐ XP & Leveling
2 XP per message (configurable), 5s per-user cooldown to prevent farming. `/rank` shows a polished card (level, XP progress bar, Battle Pass level, achievement count, VSC balance). Level-ups post a `🎉 LEVEL UP!` announcement with a real ping and a coin reward (bigger bonus every 25 levels by default).

### 🎟️ Battle Pass (50 levels)
Fed by the same XP pool as leveling. Rewards scale up through 5 configurable tiers (levels 1–10 → 41–49), with special milestone rewards at 5/10/20/25/30/40/49, and a legendary **👑 Battle Pass Champion** reward at level 50. Rewards are auto-granted the instant a level is reached — no manual claim, no double-claim risk. `/battlepass` shows progress + the next few reward tiers.

### 🏆 Achievements
15 achievements spanning the economy, leveling, mini-games, and Battle Pass (`Chatterbox`, `Dedicated`, `Gamer`, `Rich`, `Grinder`, `Completionist`, plus the original 7 economy ones) — including 3 **hidden** achievements that stay masked as "???" until unlocked. `/achievements [user]` shows progress (`X / Y unlocked`); unlocking one posts a polished announcement + DM and can reward VSC and/or XP.

### 🎮 Mini-Games
`/coinflip`, `/dice`, `/slots`, `/blackjack` (real hit/stand, natural-21 detection) all bet VSC. `/trivia` (62 questions, no repeats until the pool cycles, capped at 5 questions/day/person) and `/guessnumber` are free-to-play with a fixed VSC+XP reward. All six track play/win/loss/biggest-win stats, feed challenges and achievements, and share one 5s-per-game cooldown.

### 🎯 Daily & Weekly Challenges
3 daily + 2 weekly challenges (configurable pool), the same set for everyone each period, auto-completing and auto-rewarding (VSC + XP) the instant a target is hit. `/challenges` shows live progress bars.

### 🎁 Giveaways
`/giveaway create` (prize, duration, winner count, optional min level / required role / auto-paid VSC amount per winner) posts a live panel with an **Enter** button — duplicate entries blocked, requirements enforced on click. Ends automatically (persists across restarts) or via `/giveaway end`, with `/giveaway reroll` and `/giveaway cancel`. Winners get a real ping, never just embed text.

### 👤 `/profile` — the hub
Level/XP, Battle Pass, achievement count, game stats, and VSC balance in one embed, with **Achievements / Battle Pass / Games / Economy** buttons to drill into each system without leaving the message.

### 🛒 Shop
`/shop` lets any member buy a real InterENL Store license straight with their VSC balance — same `licenseManager` and `economyManager` as everywhere else. Default pricing: 3 Days 25,000 · 7 Days 50,000 · 14 Days 75,000 · 30 Days 100,000 · Lifetime 200,000 (all configurable in `config.shop.plans`).

### 💌 Invite Tracking
Classic invite-tracker behavior: `/invites view [user]` shows Regular / Bonus / Left / Fake / Rejoins + an effective total; `/invites leaderboard` shows the server's top inviters. New accounts younger than `FAKE_ACCOUNT_AGE_DAYS` (default 7) are flagged Fake instead of Regular. A member leaving increments their inviter's Left count; rejoining via the same invite counts as a Rejoin, not a fresh Regular join, so nobody can farm invites by leaving and rejoining.

### ✅ Member Verification
`/setverify #channel` posts a button that sends people through **Discord's own OAuth2 authorization page** (not a bot-hosted login form) — approving it redirects to a small web server this bot runs, which grants `VERIFIED_ROLE_ID`. Requires one-time setup in the Discord Developer Portal — see the `.env.example` comments above `DISCORD_CLIENT_SECRET`.

### 📖 `/help`
Every command, grouped by category, browsable with a select menu — includes every system above.

### Core
- Full audit logging, purple-themed embeds throughout, JSON storage only.
- Every major system has an `.env` on/off switch — see `.env.example`.

---

## 🔗 How it all connects

```
💬 Chat → ⭐ XP → 🎟️ Battle Pass progress → 🏆 Achievements unlocked
   → 💰 VSC rewards → 🎮 Mini-Games (bet/win VSC) → 🎯 Challenges completed
   → 🎁 Giveaway entries → ⭐ back into XP/VSC → repeat
```
One JSON file (`progression.json`) tracks XP/level/Battle Pass/game stats/challenge progress per user; `economy.json` remains the single source of truth for the VSC balance itself; `giveaways.json` holds giveaway state. Achievements read from both and record unlocks in `economy.json`'s existing `achievements` list — there's exactly one unlocked-achievements ledger regardless of which system triggered it.

---

## 🚀 Installation Guide

### 1. Prerequisites
- **Node.js 18 or later**
- A Discord bot application — [Discord Developer Portal](https://discord.com/developers/applications)

### 2. Install dependencies
```bash
npm install
```

### 3. Configure your `.env`
```bash
cp .env.example .env
```
Every variable is explained inline in `.env.example`, including every `ENABLE_*` feature toggle (economy, leveling, Battle Pass, games, challenges, giveaways, tickets, moderation, anti-nuke, welcome, license system).

### 4. Enable required Bot intents
Developer Portal → your application → **Bot**: ✅ Server Members Intent, ✅ Message Content Intent.

### 5. Invite the bot
Administrator is simplest. Individually: Manage Roles, Manage Channels, Kick/Ban Members, Moderate Members, Manage Messages, Manage Webhooks, Manage Threads, Create Private Threads, View Audit Log, Send Messages, Read Message History, Use Slash Commands.

### 6. Run the bot
```bash
node index.js
```
All data files (`economy.json`, `progression.json`, `giveaways.json`, `tickets.json`, etc.) are created automatically on first run.

---

## ⚙️ Configuration Guide

Everything tunable — XP formula, Battle Pass tiers/milestones, game bet limits/payouts, challenge pool, achievement rewards, giveaway defaults, ticket categories, moderation/anti-nuke thresholds — lives in `config/config.json` with inline structure; on/off switches and channel/role IDs live in `.env`.

---

## 📜 Commands Reference

Every command is visible to every member in Discord's command list; access is enforced at runtime with an ephemeral denial if you don't have permission, not by hiding the command.

**Open to everyone:** `/rank`, `/profile`, `/leaderboard`, `/achievements`, `/battlepass`, `/challenges`, `/help`, `/coinflip`, `/dice`, `/slots`, `/blackjack`, `/trivia`, `/guessnumber`, `/shop`, `/invites`, `/daily`, `/work`, `/balance`/`/bal`.

**Owner/Admin only:** `/admin`, `/license`, `/announce`, `/ticketpanel`, `/setverify`, `/giveaway` (create/end/reroll/cancel), `/pay`, `/transfer`, `/addxp`, `/setxp`, `/setlevel`, `/addcoins`, `/removecoins`, `/setcoins`, `/resetcoins`, `/economy reset`, `/givereward`, `/blacklist`, `/unblacklist`.

**Native-permission-or-Owner/Admin:** `/ban`, `/kick`, `/mute`, `/unmute`, `/warn`, `/warnings`, `/purge`, `/lock`, `/unlock`.

---

## 🔒 Security Notes

- License keys use `crypto.randomBytes`, checked for uniqueness before issuing.
- Anti-nuke always exempts the server owner and the bot itself.
- Loot drop claims and giveaway entries use synchronous claim-locks, race-condition-safe in Node's single-threaded event loop even under simultaneous clicks.
- Coin transfers are atomic and coins can never go negative. Battle Pass levels and challenge rewards are each granted exactly once, tracked permanently, so there's no double-claim path.
- All data lives in local JSON files — nothing leaves your server except Discord's own API calls.

---

## 🛠️ Re-registering commands manually

```bash
npm run register
```
