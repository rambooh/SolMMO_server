const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const cors = require('cors');

// === CONFIG ===
const PORT = process.env.PORT || 3000;
const PLAYER_COLORS = ['#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dda0dd', '#ff9ff3'];
const PLAYER_EMOJIS = ['🐸', '🦄', '🐉', '👽', '🤖', '👾'];

// === GAME STATE ===
let players = new Map();
let colorIndex = 0;

// Helper function to generate consistent emoji from player ID
function getPlayerEmoji(playerId) {
    // Create a simple hash from the player ID
    let hash = 0;
    for (let i = 0; i < playerId.length; i++) {
        const char = playerId.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    // Use absolute value and modulo to get consistent index
    const emojiIndex = Math.abs(hash) % PLAYER_EMOJIS.length;
    return PLAYER_EMOJIS[emojiIndex];
}

// === SETUP SERVER ===
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/ping', (req, res) => {
    res.json({ 
        status: 'online', 
        players: players.size,
        version: 'MVP-1.0'
    });
});

// === WEBSOCKET HANDLING ===
wss.on('connection', (ws) => {
    let playerId = null;
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case 'join':
                    playerId = data.playerId;
                    
                    // Add player
                    players.set(playerId, {
                        id: playerId,
                        x: data.x || 400,
                        y: data.y || 300,
                        color: PLAYER_COLORS[colorIndex % PLAYER_COLORS.length],
                        emoji: getPlayerEmoji(playerId), // Consistent emoji based on ID
                        socket: ws
                    });
                    colorIndex++;
                    
                    console.log(`Player joined: ${playerId} (${players.size} total) - ${players.get(playerId).emoji}`);
                    
                    // Send existing players to new player
                    const existingPlayers = [];
                    players.forEach((player, id) => {
                        if (id !== playerId) {
                            existingPlayers.push({
                                playerId: id,
                                x: player.x,
                                y: player.y,
                                color: player.color,
                                emoji: player.emoji
                            });
                        }
                    });
                    
                    // Send all existing players to the new player
                    if (existingPlayers.length > 0) {
                        ws.send(JSON.stringify({
                            type: 'existingPlayers',
                            players: existingPlayers
                        }));
                    }
                    
                    // Tell other players about new player
                    broadcast({
                        type: 'playerJoined',
                        playerId: playerId,
                        x: players.get(playerId).x,
                        y: players.get(playerId).y,
                        color: players.get(playerId).color,
                        emoji: players.get(playerId).emoji
                    }, playerId);
                    
                    break;
                    
                case 'move':
                    if (playerId && players.has(playerId)) {
                        const player = players.get(playerId);
                        const oldX = player.x;
                        const oldY = player.y;
                        
                        // Update player position and movement state
                        player.x = data.x;
                        player.y = data.y;
                        
                        // Determine if player is actually moving by comparing positions
                        const actuallyMoving = (Math.abs(data.x - oldX) > 0.1 || Math.abs(data.y - oldY) > 0.1);
                        
                        // Tell other players about movement
                        broadcast({
                            type: 'playerMoved',
                            playerId: playerId,
                            x: data.x,
                            y: data.y,
                            isMoving: actuallyMoving, // Use actual movement detection
                            facingLeft: data.facingLeft || false
                        }, playerId);
                    }
                    break;
            }
        } catch (error) {
            console.error('Error handling message:', error);
        }
    });
    
    ws.on('close', () => {
        if (playerId && players.has(playerId)) {
            players.delete(playerId);
            console.log(`Player left: ${playerId} (${players.size} total)`);
            
            // Tell other players
            broadcast({
                type: 'playerLeft',
                playerId: playerId
            });
        }
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// === HELPER FUNCTIONS ===
function broadcast(data, excludePlayerId = null) {
    players.forEach((player, id) => {
        if (id !== excludePlayerId && player.socket.readyState === WebSocket.OPEN) {
            player.socket.send(JSON.stringify(data));
        }
    });
}

// === START SERVER ===
server.listen(PORT, () => {
    console.log(`🚀 Modular MMO Server (MVP) running on port ${PORT}`);
    console.log(`📊 WebSocket: ws://localhost:${PORT}`);
    console.log(`🎮 Features: Movement only`);
    console.log(`👥 Max players: Unlimited`);
});

// === GRACEFUL SHUTDOWN ===
process.on('SIGTERM', () => {
    console.log('🛑 Shutting down server...');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('🛑 Shutting down server...');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});
