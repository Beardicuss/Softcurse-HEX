const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const CUSTOM_GAMES_DIR = "D:\\Games";

module.exports = {
    onLoad({ pluginDir }) {
        console.log("Local Game Launcher initialized. Listening for 'scan_games' and 'launch_game'.");
    },

    onUnload() {
        console.log("Local Game Launcher unloaded.");
    },

    async execute(action, args) {
        if (action === 'scan_games') {
            try {
                if (!fs.existsSync(CUSTOM_GAMES_DIR)) return ["Error: D:\\Games not found"];

                const folders = fs.readdirSync(CUSTOM_GAMES_DIR, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name);

                return `Found ${folders.length} games in ${CUSTOM_GAMES_DIR}: ` + folders.join(', ');
            } catch (err) {
                return "Failed to scan games: " + err.message;
            }
        }

        if (action === 'launch_game') {
            const gameFolder = args[0] || args.game;
            if (!gameFolder) return "Please provide the exact game folder name to launch.";

            const gamePath = path.join(CUSTOM_GAMES_DIR, gameFolder);
            if (!fs.existsSync(gamePath)) return `Game directory not found: ${gamePath}`;

            // Try to find the first .exe inside the folder
            const files = fs.readdirSync(gamePath);
            const exe = files.find(f => f.toLowerCase().endsWith('.exe'));

            if (!exe) return `No executable (.exe) found in ${gameFolder}`;

            const fullExePath = path.join(gamePath, exe);
            cp.spawn(`"${fullExePath}"`, [], {
                shell: true,
                detached: true,
                stdio: 'ignore'
            }).unref();

            return `Launching ${exe}... Get ready!`;
        }
    }
};
