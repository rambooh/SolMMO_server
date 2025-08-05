const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const cors = require('cors');

// === CONFIG ===
const PORT = process.env.PORT || 3000;
const PLAYER_COLORS = ['#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dda0dd', '#ff9ff3'];

// === GAME STATE ===
let players = new Map();
let colorIndex = 0;

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
                        socket: ws
                    });
                    colorIndex++;
                    
                    console.log(`Player joined: ${playerId} (${players.size} total)`);
                    
                    // Send existing players to new player
                    const existingPlayers = [];
                    players.forEach((player, id) => {
                        if (id !== playerId) {
                            existingPlayers.push({
                                playerId: id,
                                x: player.x,
                                y: player.y,
                                color: player.color
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
                        color: players.get(playerId).color
                    }, playerId);
                    
                    break;
                    
                case 'move':
                    if (playerId && players.has(playerId)) {
                        // Update player position
                        players.get(playerId).x = data.x;
                        players.get(playerId).y = data.y;
                        
                        // Tell other players about movement
                        broadcast({
                            type: 'playerMoved',
                            playerId: playerId,
                            x: data.x,
                            y: data.y
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
