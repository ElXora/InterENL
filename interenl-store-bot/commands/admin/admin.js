/**
 * /admin command
 * -----------------------------------------------------
 * Subcommands:
 *   /admin add user:@user     (Owner only)
 *   /admin remove user:@user  (Owner only)
 *   /admin list                (Owner or Admin)
 *
 * All replies are ephemeral (only visible to the person who
 * ran the command). Every action still gets written to
 * logs/actions.log and, if configured, LOG_CHANNEL_ID, so
 * there's still a full audit trail even though replies are
 * private.
 * -----------------------------------------------------
 */

const { SlashCommandBuilder } = require('discord.js');
const permissions = require('../../utils/permissions');
const logger = require('../../utils/logger');
const config = require('../../config');
const { successEmbed, errorEmbed, infoEmbed } = require('../../embeds/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Manage InterENL Store License Bot administrators.')
        .setDMPermission(false)
        .addSubcommand((sub) =>
            sub
                .setName('add')
                .setDescription('Grant a user admin access to license commands. (Owner only)')
                .addUserOption((opt) =>
                    opt.setName('user').setDescription('The user to grant admin access to.').setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName('remove')
                .setDescription("Revoke a user's admin access. (Owner only)")
                .addUserOption((opt) =>
                    opt.setName('user').setDescription('The user to remove admin access from.').setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub.setName('list').setDescription('View all current InterENL Store License Bot administrators.')
        ),

    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     * @param {import('discord.js').Client} client
     */
    async execute(interaction, client) {
        const subcommand = interaction.options.getSubcommand();

        // --------------------------------------------
        // /admin add
        // --------------------------------------------
        if (subcommand === 'add') {
            if (!permissions.isOwner(interaction.user.id)) {
                return interaction.reply({
                    embeds: [errorEmbed('Access Denied', 'You do not have permission to use this command.')],
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });

            const targetUser = interaction.options.getUser('user', true);

            if (permissions.isOwner(targetUser.id)) {
                return interaction.editReply({
                    embeds: [errorEmbed('Invalid Target', 'The owner already has full access by default.')]
                });
            }

            if (permissions.isStaticAdmin(targetUser.id)) {
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            'Already an Admin',
                            `${targetUser.tag} is already an admin (configured via the \`ADMIN_IDS\` environment variable).`
                        )
                    ]
                });
            }

            const admins = permissions.loadAdmins();

            if (admins.some((a) => a.id === targetUser.id)) {
                return interaction.editReply({
                    embeds: [errorEmbed('Already an Admin', `${targetUser.tag} is already a registered admin.`)]
                });
            }

            admins.push({
                id: targetUser.id,
                tag: targetUser.tag,
                addedBy: interaction.user.id,
                addedAt: new Date().toISOString()
            });
            permissions.saveAdmins(admins);

            logger.logAction(client, {
                action: 'ADMIN_ADD',
                admin: interaction.user.tag,
                target: `${targetUser.tag} (${targetUser.id})`
            });

            return interaction.editReply({
                embeds: [
                    successEmbed(
                        'Admin Added',
                        `<@${targetUser.id}> (\`${targetUser.id}\`) has been granted admin access to all license commands.`
                    )
                ]
            });
        }

        // --------------------------------------------
        // /admin remove
        // --------------------------------------------
        if (subcommand === 'remove') {
            if (!permissions.isOwner(interaction.user.id)) {
                return interaction.reply({
                    embeds: [errorEmbed('Access Denied', 'You do not have permission to use this command.')],
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });

            const targetUser = interaction.options.getUser('user', true);

            if (permissions.isStaticAdmin(targetUser.id)) {
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            'Cannot Remove',
                            `${targetUser.tag} is configured as an admin via the \`ADMIN_IDS\` environment variable. Remove their ID from \`.env\` and restart the bot instead.`
                        )
                    ]
                });
            }

            const admins = permissions.loadAdmins();
            const exists = admins.some((a) => a.id === targetUser.id);

            if (!exists) {
                return interaction.editReply({
                    embeds: [errorEmbed('Not an Admin', `${targetUser.tag} is not a registered admin.`)]
                });
            }

            const updated = admins.filter((a) => a.id !== targetUser.id);
            permissions.saveAdmins(updated);

            logger.logAction(client, {
                action: 'ADMIN_REMOVE',
                admin: interaction.user.tag,
                target: `${targetUser.tag} (${targetUser.id})`
            });

            return interaction.editReply({
                embeds: [
                    successEmbed(
                        'Admin Removed',
                        `<@${targetUser.id}> (\`${targetUser.id}\`) has had their admin access revoked.`
                    )
                ]
            });
        }

        // --------------------------------------------
        // /admin list
        // --------------------------------------------
        if (subcommand === 'list') {
            if (!permissions.hasPermission(interaction.user.id)) {
                return interaction.reply({
                    embeds: [errorEmbed('Access Denied', 'You do not have permission to use this command.')],
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });

            const admins = permissions.loadAdmins();
            const staticAdmins = config.staticAdminIds || [];

            const ownerLine = `👑 <@${config.ownerID}> — \`${config.ownerID}\` (Owner)`;

            const staticLines = staticAdmins.length
                ? staticAdmins.map((id) => `**•** <@${id}> — \`${id}\` (via \`ADMIN_IDS\` in .env)`).join('\n')
                : null;

            const dynamicLines =
                admins.length > 0
                    ? admins
                          .map((a, i) => `**${i + 1}.** <@${a.id}> — \`${a.id}\` (added by <@${a.addedBy}>)`)
                          .join('\n')
                    : '_No additional admins added via /admin add yet._';

            const description = [ownerLine, staticLines, dynamicLines].filter(Boolean).join('\n\n');

            return interaction.editReply({
                embeds: [infoEmbed('🛡️ InterENL Store License Bot — Administrators', description)]
            });
        }
    }
};
