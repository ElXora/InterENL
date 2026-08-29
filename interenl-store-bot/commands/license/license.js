/**
 * /license command
 * -----------------------------------------------------
 * Subcommands:
 *   /license generate user:@user email:<email> plan:<plan>
 *   /license check key:<key>
 *   /license info key:<key>
 *   /license list [page:<number>]
 *   /license search query:<username|discordID|email|key>
 *   /license renew key:<key> plan:<plan>
 *   /license suspend key:<key> [reason:<text>]
 *   /license unsuspend key:<key>
 *   /license revoke key:<key>
 *
 * All subcommands are restricted to the Owner and registered
 * Admins — normal users cannot use any license command.
 *
 * Every subcommand defers its reply immediately (ephemeral)
 * before doing any I/O — this both (a) makes the reply private
 * to the person who ran the command, and (b) gives the command
 * up to 15 minutes to finish instead of Discord's normal 3-second
 * window, which is what previously caused "generate" to sometimes
 * fail: it was DMing the user *before* replying, and if that DM
 * took too long the interaction token expired.
 * -----------------------------------------------------
 */

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const permissions = require('../../utils/permissions');
const licenseManager = require('../../utils/licenseManager');
const validators = require('../../utils/validators');
const logger = require('../../utils/logger');
const config = require('../../config');
const { successEmbed, errorEmbed, warningEmbed, buildLicenseEmbed } = require('../../embeds/embeds');

const PLAN_CHOICES = Object.keys(config.licensePlans).map((plan) => ({ name: plan, value: plan }));
const LICENSES_PER_PAGE = 5;

/**
 * Verifies the interacting user is the Owner or a registered Admin.
 * Replies immediately (not deferred — this check happens before any
 * I/O, so there's no timing risk) with a denial embed if not.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @returns {Promise<boolean>}
 */
async function checkPermission(interaction) {
    if (permissions.hasPermission(interaction.user.id)) return true;

    await interaction.reply({
        embeds: [errorEmbed('Access Denied', '❌ You do not have permission to use this command.')],
        ephemeral: true
    });
    return false;
}

/**
 * Builds one page of the license list as an embed.
 * @param {Array<object>} licenses
 * @param {number} page 1-indexed page number.
 * @returns {import('discord.js').EmbedBuilder}
 */
function buildListEmbed(licenses, page) {
    const totalPages = Math.max(1, Math.ceil(licenses.length / LICENSES_PER_PAGE));
    const clampedPage = Math.min(Math.max(page, 1), totalPages);
    const start = (clampedPage - 1) * LICENSES_PER_PAGE;
    const pageItems = licenses.slice(start, start + LICENSES_PER_PAGE);

    const description =
        pageItems.length > 0
            ? pageItems
                  .map(
                      (lic, i) =>
                          `**${start + i + 1}.** \`${lic.license}\`\n` +
                          `└ Owner: ${lic.username} (<@${lic.discordID}>) | Plan: ${lic.plan} | Status: **${lic.status}**`
                  )
                  .join('\n\n')
            : '_No licenses found._';

    return successEmbed(`📜 InterENL Store Licenses (Page ${clampedPage}/${totalPages})`, description);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('license')
        .setDescription('Manage InterENL Store product licenses.')
        .setDMPermission(false)
        .addSubcommand((sub) =>
            sub
                .setName('generate')
                .setDescription('Generate a brand new InterENL Store license.')
                .addUserOption((opt) => opt.setName('user').setDescription('The license owner.').setRequired(true))
                .addStringOption((opt) =>
                    opt.setName('email').setDescription('Email address tied to this license.').setRequired(true)
                )
                .addStringOption((opt) =>
                    opt
                        .setName('plan')
                        .setDescription('License plan duration.')
                        .setRequired(true)
                        .addChoices(...PLAN_CHOICES)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName('check')
                .setDescription('Check whether a license key is genuine and view its status.')
                .addStringOption((opt) => opt.setName('key').setDescription('The license key to check.').setRequired(true))
        )
        .addSubcommand((sub) =>
            sub
                .setName('info')
                .setDescription('View every stored field for a license.')
                .addStringOption((opt) => opt.setName('key').setDescription('The license key.').setRequired(true))
        )
        .addSubcommand((sub) =>
            sub
                .setName('list')
                .setDescription('List all stored InterENL Store licenses.')
                .addIntegerOption((opt) =>
                    opt.setName('page').setDescription('Page number to view.').setRequired(false).setMinValue(1)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName('search')
                .setDescription('Search licenses by username, Discord ID, email, or license key.')
                .addStringOption((opt) => opt.setName('query').setDescription('Your search term.').setRequired(true))
        )
        .addSubcommand((sub) =>
            sub
                .setName('renew')
                .setDescription('Renew a license with a new plan duration.')
                .addStringOption((opt) => opt.setName('key').setDescription('The license key to renew.').setRequired(true))
                .addStringOption((opt) =>
                    opt.setName('plan').setDescription('New plan duration.').setRequired(true).addChoices(...PLAN_CHOICES)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName('suspend')
                .setDescription('Immediately suspend a license.')
                .addStringOption((opt) => opt.setName('key').setDescription('The license key to suspend.').setRequired(true))
                .addStringOption((opt) =>
                    opt.setName('reason').setDescription('Reason for suspension.').setRequired(false)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName('unsuspend')
                .setDescription('Reactivate a suspended license.')
                .addStringOption((opt) =>
                    opt.setName('key').setDescription('The license key to unsuspend.').setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName('revoke')
                .setDescription('Permanently delete a license.')
                .addStringOption((opt) => opt.setName('key').setDescription('The license key to revoke.').setRequired(true))
        ),

    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     * @param {import('discord.js').Client} client
     */
    async execute(interaction, client) {
        if (!(await checkPermission(interaction))) return;

        if (config.enableLicenseSystem === false) {
            return interaction.reply({
                embeds: [errorEmbed('License System Disabled', 'The license key system is currently disabled (`ENABLE_LICENSE_SYSTEM=false` in `.env`).')],
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();

        // --------------------------------------------
        // /license generate
        // --------------------------------------------
        if (subcommand === 'generate') {
            const targetUser = interaction.options.getUser('user', true);
            const email = interaction.options.getString('email', true);
            const plan = interaction.options.getString('plan', true);

            if (!validators.isValidEmail(email)) {
                return interaction.reply({
                    embeds: [errorEmbed('Invalid Email', `\`${email}\` is not a valid email address.`)],
                    ephemeral: true
                });
            }

            if (!validators.isValidPlan(plan, config.licensePlans)) {
                return interaction.reply({
                    embeds: [errorEmbed('Invalid Plan', `\`${plan}\` is not a supported license plan.`)],
                    ephemeral: true
                });
            }

            // Defer BEFORE the DM send — this is the fix for the timeout bug.
            await interaction.deferReply({ ephemeral: true });

            const license = licenseManager.generateLicense({
                username: targetUser.tag,
                discordID: targetUser.id,
                email,
                plan,
                generatedBy: interaction.user.id
            });

            logger.logAction(client, {
                action: 'GENERATE',
                admin: interaction.user.tag,
                target: `${targetUser.tag} (${targetUser.id})`,
                license: license.license,
                details: `Plan: ${plan}`
            });

            const embed = buildLicenseEmbed(license).setTitle('✅ License Generated Successfully');

            // Best-effort DM to the license recipient with their new key.
            // Now safe to take as long as it needs — we already deferred.
            let dmSent = true;
            try {
                const dmEmbed = buildLicenseEmbed(license)
                    .setTitle('🔑 Your InterENL Store License')
                    .setDescription(
                        'A new license has been generated for you. Keep this key private — sharing it publicly will get it automatically suspended.'
                    );
                await targetUser.send({ embeds: [dmEmbed] });
            } catch (err) {
                dmSent = false;
                logger.warn(`Could not DM new license to ${targetUser.tag} (${targetUser.id}) — DMs may be closed.`);
            }

            if (!dmSent) {
                embed.addFields({
                    name: '⚠️ DM Failed',
                    value: 'Could not deliver the license key via DM (user may have DMs disabled). Please share it with them manually.'
                });
            }

            return interaction.editReply({ embeds: [embed] });
        }

        // --------------------------------------------
        // /license check
        // --------------------------------------------
        if (subcommand === 'check') {
            await interaction.deferReply({ ephemeral: true });

            const key = interaction.options.getString('key', true);
            const license = licenseManager.findByKey(key);

            if (!license) {
                return interaction.editReply({
                    embeds: [errorEmbed('Invalid InterENL Store License', `No license was found matching \`${key.toUpperCase()}\`.`)]
                });
            }

            return interaction.editReply({ embeds: [buildLicenseEmbed(license)] });
        }

        // --------------------------------------------
        // /license info
        // --------------------------------------------
        if (subcommand === 'info') {
            await interaction.deferReply({ ephemeral: true });

            const key = interaction.options.getString('key', true);
            const license = licenseManager.findByKey(key);

            if (!license) {
                return interaction.editReply({
                    embeds: [errorEmbed('License Not Found', `No license was found matching \`${key.toUpperCase()}\`.`)]
                });
            }

            return interaction.editReply({ embeds: [buildLicenseEmbed(license, { fullInfo: true })] });
        }

        // --------------------------------------------
        // /license list
        // --------------------------------------------
        if (subcommand === 'list') {
            await interaction.deferReply({ ephemeral: true });

            const licenses = licenseManager.listAll();
            let page = interaction.options.getInteger('page') || 1;
            const totalPages = Math.max(1, Math.ceil(licenses.length / LICENSES_PER_PAGE));
            page = Math.min(Math.max(page, 1), totalPages);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('license_list_prev')
                    .setLabel('◀ Previous')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page <= 1),
                new ButtonBuilder()
                    .setCustomId('license_list_next')
                    .setLabel('Next ▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page >= totalPages)
            );

            const message = await interaction.editReply({
                embeds: [buildListEmbed(licenses, page)],
                components: totalPages > 1 ? [row] : []
            });

            if (totalPages <= 1) return;

            const collector = message.createMessageComponentCollector({ time: 60_000 });
            let currentPage = page;

            collector.on('collect', async (btnInteraction) => {
                if (btnInteraction.user.id !== interaction.user.id) {
                    return btnInteraction.reply({
                        embeds: [errorEmbed('Not Your Menu', 'Only the person who ran this command can use these buttons.')],
                        ephemeral: true
                    });
                }

                if (btnInteraction.customId === 'license_list_prev') currentPage -= 1;
                if (btnInteraction.customId === 'license_list_next') currentPage += 1;

                const freshLicenses = licenseManager.listAll();
                const freshTotalPages = Math.max(1, Math.ceil(freshLicenses.length / LICENSES_PER_PAGE));
                currentPage = Math.min(Math.max(currentPage, 1), freshTotalPages);

                const updatedRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('license_list_prev')
                        .setLabel('◀ Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage <= 1),
                    new ButtonBuilder()
                        .setCustomId('license_list_next')
                        .setLabel('Next ▶')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage >= freshTotalPages)
                );

                await btnInteraction.update({
                    embeds: [buildListEmbed(freshLicenses, currentPage)],
                    components: [updatedRow]
                });
            });

            collector.on('end', () => {
                interaction.editReply({ components: [] }).catch(() => {});
            });

            return;
        }

        // --------------------------------------------
        // /license search
        // --------------------------------------------
        if (subcommand === 'search') {
            await interaction.deferReply({ ephemeral: true });

            const query = interaction.options.getString('query', true);
            const results = licenseManager.search(query);

            if (results.length === 0) {
                return interaction.editReply({
                    embeds: [errorEmbed('No Results', `No licenses matched \`${query}\`.`)]
                });
            }

            if (results.length === 1) {
                return interaction.editReply({ embeds: [buildLicenseEmbed(results[0])] });
            }

            const description = results
                .slice(0, 10)
                .map(
                    (lic, i) =>
                        `**${i + 1}.** \`${lic.license}\` — ${lic.username} (<@${lic.discordID}>) — **${lic.status}**`
                )
                .join('\n');

            return interaction.editReply({
                embeds: [
                    successEmbed(
                        `🔍 Search Results (${results.length} found)`,
                        `${description}${results.length > 10 ? `\n\n_...and ${results.length - 10} more. Refine your search for exact matches._` : ''}`
                    )
                ]
            });
        }

        // --------------------------------------------
        // /license renew
        // --------------------------------------------
        if (subcommand === 'renew') {
            const key = interaction.options.getString('key', true);
            const plan = interaction.options.getString('plan', true);

            if (!validators.isValidPlan(plan, config.licensePlans)) {
                return interaction.reply({
                    embeds: [errorEmbed('Invalid Plan', `\`${plan}\` is not a supported license plan.`)],
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });

            const license = licenseManager.renewLicense(key, plan);

            if (!license) {
                return interaction.editReply({
                    embeds: [errorEmbed('License Not Found', `No license was found matching \`${key.toUpperCase()}\`.`)]
                });
            }

            logger.logAction(client, {
                action: 'RENEW',
                admin: interaction.user.tag,
                target: `${license.username} (${license.discordID})`,
                license: license.license,
                details: `New plan: ${plan}`
            });

            const embed = buildLicenseEmbed(license).setTitle('✅ License Renewed Successfully');
            return interaction.editReply({ embeds: [embed] });
        }

        // --------------------------------------------
        // /license suspend
        // --------------------------------------------
        if (subcommand === 'suspend') {
            await interaction.deferReply({ ephemeral: true });

            const key = interaction.options.getString('key', true);
            const reason = interaction.options.getString('reason') || 'Manually suspended by administrator';

            const license = licenseManager.suspendLicense(key, reason);

            if (!license) {
                return interaction.editReply({
                    embeds: [errorEmbed('License Not Found', `No license was found matching \`${key.toUpperCase()}\`.`)]
                });
            }

            logger.logAction(client, {
                action: 'SUSPEND',
                admin: interaction.user.tag,
                target: `${license.username} (${license.discordID})`,
                license: license.license,
                details: reason
            });

            return interaction.editReply({
                embeds: [buildLicenseEmbed(license).setTitle('⛔ License Suspended')]
            });
        }

        // --------------------------------------------
        // /license unsuspend
        // --------------------------------------------
        if (subcommand === 'unsuspend') {
            await interaction.deferReply({ ephemeral: true });

            const key = interaction.options.getString('key', true);
            const license = licenseManager.unsuspendLicense(key);

            if (!license) {
                return interaction.editReply({
                    embeds: [errorEmbed('License Not Found', `No license was found matching \`${key.toUpperCase()}\`.`)]
                });
            }

            logger.logAction(client, {
                action: 'UNSUSPEND',
                admin: interaction.user.tag,
                target: `${license.username} (${license.discordID})`,
                license: license.license
            });

            return interaction.editReply({
                embeds: [buildLicenseEmbed(license).setTitle('✅ License Reactivated')]
            });
        }

        // --------------------------------------------
        // /license revoke
        // --------------------------------------------
        if (subcommand === 'revoke') {
            await interaction.deferReply({ ephemeral: true });

            const key = interaction.options.getString('key', true);
            const license = licenseManager.revokeLicense(key);

            if (!license) {
                return interaction.editReply({
                    embeds: [errorEmbed('License Not Found', `No license was found matching \`${key.toUpperCase()}\`.`)]
                });
            }

            logger.logAction(client, {
                action: 'REVOKE',
                admin: interaction.user.tag,
                target: `${license.username} (${license.discordID})`,
                license: license.license
            });

            return interaction.editReply({
                embeds: [
                    warningEmbed(
                        '🚫 License Revoked',
                        `License \`${license.license}\` belonging to ${license.username} has been permanently deleted.`
                    )
                ]
            });
        }
    }
};
