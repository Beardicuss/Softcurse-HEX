const https = require('https');

async function fetchPrice(coin) {
    return new Promise((resolve, reject) => {
        // Free CoinGecko API endpoint
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=usd`;

        https.get(url, { headers: { 'User-Agent': 'SoftcurseHEX/1.0' } }, (res) => {
            if (res.statusCode !== 200) {
                resolve(`API Error: ${res.statusCode}`);
                return;
            }

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed[coin] && parsed[coin].usd) {
                        resolve(`The current price of ${coin} is $${parsed[coin].usd}`);
                    } else {
                        resolve(`Could not find price data for "${coin}". Examples: bitcoin, ethereum, solana.`);
                    }
                } catch (e) {
                    resolve("Failed to parse API response.");
                }
            });
        }).on('error', err => resolve(`Network error: ${err.message}`));
    });
}

module.exports = {
    onLoad() {
        console.log("Crypto Tracker plugin loaded.");
    },

    onUnload() {
        console.log("Crypto Tracker plugin unloaded.");
    },

    async execute(action, args) {
        if (action === 'get_crypto_price') {
            const coin = (args[0] || 'bitcoin').toLowerCase();
            return await fetchPrice(coin);
        }
        return "Unknown action.";
    }
};
