/**
 * /givereward command
 * -----------------------------------------------------
 * Owner/Admin only. Manually grants a reward to a user —
 * either a coin amount or a real InterENL Store license — useful
 * for admin-run giveaways and events.
 * -----------------------------------------------------
 */

const { SlashCommandBuilder } = require('discord.js');
const permissions = require('../../utils/permissions');
const economyManager = require('../../utils/economyManager');
const achievementManager = require('../../utils/achievementManager');
const licenseManager = require('../../utils/licenseManager');
const validators = require('../../utils/validators');
const config = require('../../config');
const { successEmbed, errorEmbed, buildLicenseEmbed } = require('../../embeds/embeds');
const logger = require('../../utils/logger');

const PLAN_CHOICES = Object.keys(config.licensePlans).map((plan) => ({ name: plan, value: plan }));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('givereward')
        .setDescription('Manually give a user a coin or license reward. (Owner/Admin only)')
        .setDMPermission(false)
        .addUserOption((opt) => opt.setName('user').setDescription('The user to reward.').setRequired(true))
        .addStringOption((opt) =>
            opt
                .setName('type')
                .setDescription('Reward type.')
                .setRequired(true)
                .addChoices({ name: 'Coins', value: 'coins' }, { name: 'License', value: 'license' })
        )
        .addIntegerOption((opt) => opt.setName('amount').setDescription('Coin amount (required if type is Coins).').setMinValue(1).setRequired(false))
        .addStringOption((opt) =>
            opt.setName('plan').setDescription('License plan (required if type is License).').setRequired(false).addChoices(...PLAN_CHOICES)
        ),

    async execute(interaction, client) {
        if (!permissions.hasPermission(interaction.user.id)) {
            return interaction.reply({
                embeds: [errorEmbed('Access Denied', 'You do not have permission to use this command.')],
                ephemeral: true
            });
        }

        const targetUser = interaction.options.getUser('user', true);
        const type = interaction.options.getString('type', true);
        const amount = interaction.options.getInteger('amount');
        const plan = interaction.options.getString('plan');

        if (type === 'coins' && !amount) {
            return interaction.reply({
                embeds: [errorEmbed('Missing Amount', 'You must provide an `amount` when the reward type is Coins.')],
                ephemeral: true
            });
        }
        if (type === 'license' && !plan) {
            return interaction.reply({
                embeds: [errorEmbed('Missing Plan', 'You must provide a `plan` when the reward type is License.')],
                ephemeral: true
            });
        }
        if (type === 'license' && !validators.isValidPlan(plan, config.licensePlans)) {
            return interaction.reply({
                embeds: [errorEmbed('Invalid Plan', `\`${plan}\` is not a supported license plan.`)],
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        economyManager.getOrCreateUser(targetUser.id, targetUser.tag);

        if (type === 'coins') {
            const updated = economyManager.addCoins(targetUser.id, targetUser.tag, amount);

            logger.logAction(client, {
                action: 'GIVEREWARD',
                admin: interaction.user.tag,
                target: `${targetUser.tag} (${targetUser.id})`,
                details: `${amount} coins (new balance: ${updated.coins})`
            });

            await achievementManager.checkAndAwardAchievements(targetUser.id, client);

            return interaction.editReply({
                embeds: [successEmbed('Reward Given', `Gave **${amount}** VSC to ${targetUser.tag}.`)]
            });
        }

        // type === 'license'
        const license = licenseManager.generateLicense({
            username: targetUser.tag,
            discordID: targetUser.id,
            email: `giveaway-${targetUser.id}@interenlstore.internal`,
            plan,
            generatedBy: interaction.user.id
        });

        const user = economyManager.getUser(targetUser.id);
        user.licenseWins += 1;
        economyManager.saveUser(user);

        try {
            await targetUser.send({
                embeds: [buildLicenseEmbed(license).setTitle('🎁 You Received a InterENL Store License!')]
            });
        } catch (err) {
            // Non-fatal — user may have DMs disabled.
        }

        logger.logAction(client, {
            action: 'GIVEREWARD',
            admin: interaction.user.tag,
            target: `${targetUser.tag} (${targetUser.id})`,
            license: license.license,
            details: `Plan: ${plan}`
        });

        await achievementManager.checkAndAwardAchievements(targetUser.id, client);

        return interaction.editReply({
            embeds: [successEmbed('Reward Given', `Gave a **${plan}** license to ${targetUser.tag}.`)]
        });
    }
};
