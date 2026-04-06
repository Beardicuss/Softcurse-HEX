const https = require('https');
const os = require('os');

// Replace with your actual Discord Webhook URL
// E.g., https://discord.com/api/webhooks/12345/abcdef
const WEBHOOK_URL = "";

async function postToDiscord(content) {
    if (!WEBHOOK_URL) return "Error: No Webhook URL configured in the plugin index.js.";

    const data = JSON.stringify({
        username: "H.E.X. System Link",
        avatar_url: "https://i.imgur.com/4M34hiw.png",
        content: content,
    });

    return new Promise((resolve, reject) => {
        const url = new URL(WEBHOOK_URL);
        const options = {
            hostname: url.hostname,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        };

        const req = https.request(options, res => {
            resolve(res.statusCode === 204 ? "Message dispatched to Discord successfully." : `Discord API responded with status ${res.statusCode}`);
        });

        req.on('error', error => reject(`HTTP Request Failed: ${error.message}`));
        req.write(data);
        req.end();
    });
}

module.exports = {
    onLoad() {
        console.log("Discord Webhook Broadcaster initialized.");
    },

    onUnload() {
        console.log("Discord Webhook unloaded.");
    },

    async execute(action, args) {
        if (action === 'send_webhook_message') {
            const msg = args.join(' ');
            if (!msg) return "No message provided to send.";
            return await postToDiscord(msg);
        }

        if (action === 'broadcast_system_status') {
            const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
            const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
            const statusMsg = `**H.E.X. Status Report**\nUptime: ${(os.uptime() / 3600).toFixed(2)} hrs\nCPU Arch: ${os.arch()}\nMemory Available: ${freeMem} GB / ${totalMem} GB`;
            return await postToDiscord(statusMsg);
        }
    }
};
