/**
 * verifyServer.js
 * -----------------------------------------------------
 * A minimal HTTP server (Node's built-in `http` — no Express,
 * no extra dependency) that handles ONE route: the Discord
 * OAuth2 callback for /setverify.
 *
 * Flow:
 *   1. /setverify posts a Link button pointing straight at
 *      Discord's own OAuth2 authorize page (built in
 *      commands/verify/setverify.js) — the person clicks it,
 *      logs into Discord (or is already logged in), and
 *      approves the "identify" scope. This IS the real Discord
 *      OAuth page — there's no bot-hosted login form.
 *   2. Discord redirects back to OAUTH_REDIRECT_URI (this
 *      server) with a `code` + the `state` we set to the guild ID.
 *   3. This server exchanges the code for an access token,
 *      asks Discord who that token belongs to, then uses the
 *      BOT's own token (not the user's) to add VERIFIED_ROLE_ID
 *      to that member — a user's OAuth token alone can't grant
 *      itself roles.
 *
 * IMPORTANT — this needs one-time setup outside this codebase:
 *   - OAUTH_REDIRECT_URI must be added as a valid redirect in
 *     the Discord Developer Portal (Application -> OAuth2 ->
 *     Redirects) EXACTLY matching what's in .env, protocol and
 *     path included.
 *   - This server must be reachable at that URL, which means
 *     the bot's host needs a public port open (or a reverse
 *     proxy / tunnel) — running only `node index.js` on a
 *     machine with no public networking will not work for the
 *     callback step, even though the bot's Discord connection
 *     itself never needs an open port.
 * -----------------------------------------------------
 */

const http = require('http');
const { URL } = require('url');
const config = require('../config');
const logger = require('../utils/logger');

function renderPage({ title, message, success }) {
    const color = success ? '#9333ea' : '#f43f5e';
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
        body { background:#0f0a17; color:#fff; font-family: -apple-system, sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; }
        .card { background:#1a1424; border:1px solid ${color}; border-radius:12px; padding:40px; text-align:center; max-width:420px; }
        h1 { color:${color}; margin-top:0; }
        p { color:#c9c3d4; }
    </style>
</head>
<body>
    <div class="card">
        <h1>${title}</h1>
        <p>${message}</p>
    </div>
</body>
</html>`;
}

/**
 * Exchanges an OAuth2 authorization code for an access token.
 * @param {string} code
 * @returns {Promise<string>} access_token
 */
async function exchangeCodeForToken(code) {
    const body = new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.verify.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.verify.redirectUri
    });

    const response = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Discord token exchange failed (${response.status}): ${text}`);
    }

    const data = await response.json();
    return data.access_token;
}

/**
 * @param {string} accessToken
 * @returns {Promise<{id: string, username: string}>}
 */
async function fetchDiscordIdentity(accessToken) {
    const response = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) throw new Error(`Could not fetch Discord identity (${response.status}).`);
    return response.json();
}

/**
 * @param {import('discord.js').Client} client
 */
function startVerifyServer(client) {
    if (!config.verify?.clientSecret || !config.verify?.redirectUri || !config.verify?.roleId) {
        logger.warn(
            'Verify system is enabled but DISCORD_CLIENT_SECRET, OAUTH_REDIRECT_URI, or VERIFIED_ROLE_ID is missing from .env — /setverify will not work until all three are set.'
        );
        return;
    }

    let callbackPath;
    try {
        callbackPath = new URL(config.verify.redirectUri).pathname;
    } catch (err) {
        logger.error(`OAUTH_REDIRECT_URI in .env is not a valid URL: ${config.verify.redirectUri}`);
        return;
    }

    const server = http.createServer(async (req, res) => {
        const requestUrl = new URL(req.url, `http://localhost:${config.verify.port}`);

        if (requestUrl.pathname !== callbackPath) {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end(renderPage({ title: '404', message: 'Nothing here.', success: false }));
            return;
        }

        const code = requestUrl.searchParams.get('code');
        const guildId = requestUrl.searchParams.get('state');
        const oauthError = requestUrl.searchParams.get('error');

        if (oauthError) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(renderPage({ title: 'Verification Cancelled', message: 'You cancelled the Discord authorization.', success: false }));
            return;
        }

        if (!code || !guildId) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(renderPage({ title: 'Invalid Request', message: 'Missing authorization code — please use the Verify button in Discord again.', success: false }));
            return;
        }

        try {
            const accessToken = await exchangeCodeForToken(code);
            const identity = await fetchDiscordIdentity(accessToken);

            const guild = await client.guilds.fetch(guildId);
            const member = await guild.members.fetch(identity.id);
            await member.roles.add(config.verify.roleId, 'Verified via /setverify OAuth2 flow');

            logger.logAction(client, {
                action: 'VERIFY',
                admin: 'SYSTEM',
                target: `${identity.username} (${identity.id})`,
                details: `Verified via Discord OAuth2 and granted role ${config.verify.roleId} in ${guild.name}.`
            });

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(
                renderPage({
                    title: '✅ Verified!',
                    message: `You're all set, ${identity.username}. You can close this tab and head back to Discord.`,
                    success: true
                })
            );
        } catch (err) {
            logger.error('Verify OAuth2 callback failed.', err);
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end(
                renderPage({
                    title: 'Verification Failed',
                    message: "Something went wrong completing verification. Make sure you're still a member of the server, then try the Verify button again.",
                    success: false
                })
            );
        }
    });

    server.listen(config.verify.port, () => {
        logger.success(`Verify OAuth2 server listening on port ${config.verify.port} (callback path: ${callbackPath}).`);
    });

    server.on('error', (err) => {
        logger.error(`Verify server failed to start on port ${config.verify.port}.`, err);
    });
}

module.exports = { startVerifyServer };
