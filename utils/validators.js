/**
 * validators.js
 * -----------------------------------------------------
 * Simple, dependency-free validation helpers.
 * -----------------------------------------------------
 */

/**
 * Validates a standard email address format.
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
    if (typeof email !== 'string') return false;
    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return pattern.test(email.trim());
}

/**
 * Validates that a plan name is one of the configured/supported plans.
 * @param {string} plan
 * @param {object} licensePlans Object whose keys are valid plan names.
 * @returns {boolean}
 */
function isValidPlan(plan, licensePlans) {
    return Object.prototype.hasOwnProperty.call(licensePlans, plan);
}

module.exports = {
    isValidEmail,
    isValidPlan
};
