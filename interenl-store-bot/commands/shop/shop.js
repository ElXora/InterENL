/**
 * /shop command
 * -----------------------------------------------------
 * Lets any member buy a real InterENL Store license directly
 * with their VSC balance — reuses the same licenseManager
 * used everywhere else (loot drops, /license) and the same
 * economyManager balance, no separate currency or license path.
 * Self-contained select-menu + confirm-button flow (no global
 * interactionCreate routing needed — short-lived, ephemeral).
 * -----------------------------------------------------
 */

const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const config = require('../../config');
const economyManager = require('../../utils/economyManager');
const licenseManager = require('../../utils/licenseManager');
const { buildShopCatalogEmbed, buildShopConfirmEmbed } = require('../../embeds/shopEmbeds');
const { buildLicenseEmbed, successEmbed, errorEmbed } = require('../../embeds/embeds');

function buildPlanSelect(disabled = false) {
    const plans = config.shop?.plans || {};
    const currency = config.economy?.currencyName || 'VSC';

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('shop_plan_select')
            .setPlaceholder('Choose a license plan to buy...')
            .setDisabled(disabled)
            .addOptions(
                Object.entries(plans).map(([plan, price]) => ({
                    label: plan,
                    value: plan,
                    description: `${price.toLocaleString()} ${currency}`
                }))
            )
    );
}

function buildConfirmButtons(disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('shop_confirm').setLabel('Confirm Purchase').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(disabled),
        new ButtonBuilder().setCustomId('shop_cancel').setLabel('Cancel').setEmoji('✖️').setStyle(ButtonStyle.Secondary).setDisabled(disabled)
    );
}

module.exports = {
    data: new SlashCommandBuilder().setName('shop').setDescription('Buy a InterENL Store license with your VSC balance.').setDMPermission(false),

    async execute(interaction, client) {
        if (config.shop?.enabled === false) {
            return interaction.reply({ embeds: [errorEmbed('Shop Disabled', 'The shop is currently disabled.')], ephemeral: true });
        }
        if (config.enableLicenseSystem === false) {
            return interaction.reply({ embeds: [errorEmbed('License System Disabled', 'The license key system is currently disabled.')], ephemeral: true });
        }

        const message = await interaction.reply({
            embeds: [buildShopCatalogEmbed(interaction.guild)],
            components: [buildPlanSelect()],
            fetchReply: true,
            ephemeral: true
        });

        const collector = message.createMessageComponentCollector({
            time: 60000,
            filter: (i) => i.user.id === interaction.user.id
        });

        let selectedPlan = null;

        collector.on('collect', async (componentInteraction) => {
            if (componentInteraction.componentType === ComponentType.StringSelect && componentInteraction.customId === 'shop_plan_select') {
                selectedPlan = componentInteraction.values[0];
                const price = config.shop?.plans?.[selectedPlan];
                const economyUser = economyManager.getOrCreateUser(interaction.user.id, interaction.user.tag);

                await componentInteraction.update({
                    embeds: [buildShopConfirmEmbed(selectedPlan, price, economyUser.coins)],
                    components: [buildConfirmButtons()]
                });
                return;
            }

            if (componentInteraction.customId === 'shop_cancel') {
                collector.stop('cancelled');
                await componentInteraction.update({ embeds: [errorEmbed('Purchase Cancelled', 'No coins were charged.')], components: [] });
                return;
            }

            if (componentInteraction.customId === 'shop_confirm') {
                collector.stop('confirmed');

                if (economyManager.isBlacklisted(interaction.user.id)) {
                    const user = economyManager.getUser(interaction.user.id);
                    await componentInteraction.update({
                        embeds: [errorEmbed('Access Denied', user?.blacklistReason || 'You are restricted from the InterENL Store Economy.')],
                        components: []
                    });
                    return;
                }

                const price = config.shop?.plans?.[selectedPlan];
                const economyUser = economyManager.getOrCreateUser(interaction.user.id, interaction.user.tag);

                if (!price) {
                    await componentInteraction.update({ embeds: [errorEmbed('Invalid Plan', 'That plan no longer exists.')], components: [] });
                    return;
                }

                if (economyUser.coins < price) {
                    const currency = config.economy?.currencyName || 'VSC';
                    await componentInteraction.update({
                        embeds: [errorEmbed('Insufficient Balance', `You need **${price.toLocaleString()} ${currency}** but only have **${economyUser.coins.toLocaleString()} ${currency}**.`)],
                        components: []
                    });
                    return;
                }

                economyManager.removeCoins(interaction.user.id, interaction.user.tag, price);

                const license = licenseManager.generateLicense({
                    username: interaction.user.tag,
                    discordID: interaction.user.id,
                    email: `shop-${interaction.user.id}@interenlstore.internal`,
                    plan: selectedPlan,
                    generatedBy: client.user.id
                });

                const purchaser = economyManager.getUser(interaction.user.id);
                purchaser.licenseWins += 1;
                economyManager.saveUser(purchaser);

                const logger = require('../../utils/logger');
                logger.logAction(client, {
                    action: 'SHOP_PURCHASE',
                    admin: interaction.user.tag,
                    target: interaction.user.tag,
                    license: license.license,
                    details: `Bought ${selectedPlan} for ${price.toLocaleString()} ${config.economy?.currencyName || 'VSC'}`
                });

                await componentInteraction.update({
                    embeds: [buildLicenseEmbed(license).setTitle('✅ Purchase Complete!').setDescription(`Your **${selectedPlan}** InterENL Store license is ready.`)],
                    components: []
                });

                try {
                    await interaction.user.send({ embeds: [buildLicenseEmbed(license).setTitle('🛒 Your InterENL Store Purchase')] });
                } catch (err) {
                    // Non-fatal — they already saw it in the ephemeral reply.
                }
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'confirmed' || reason === 'cancelled') return;
            try {
                await interaction.editReply({ components: [] });
            } catch (err) {
                // Non-fatal.
            }
        });
    }
};
