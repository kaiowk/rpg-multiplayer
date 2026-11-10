const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3050;
const WORLD_SIZE = 1200;

// Configuração central dos mapas. Novas regiões serão adicionadas aqui.
const MAPS = {
    starter_town: {
        id: 'starter_town',
        name: 'Cidade Inicial',
        enabled: true,
        worldSize: WORLD_SIZE,
        safeZone: true,
        monstersEnabled: false,
        simulationMode: 'hybrid',
        spawn: { x: 600, y: 600 },
        backgroundColor: '#263b2b',
        borderColor: '#71866f'
    },
    forest_01: {
        id: 'forest_01',
        name: 'Floresta Inicial',
        enabled: false, // Será liberada quando o sistema de monstros estiver pronto.
        worldSize: WORLD_SIZE,
        safeZone: false,
        monstersEnabled: true,
        simulationMode: 'hybrid',
        spawn: { x: 600, y: 600 },
        backgroundColor: '#1b331e',
        borderColor: '#3d5c41'
    }
};

const players = new Map();

// Estado em memória por mapa. A persistência em banco/arquivo será uma etapa posterior.
const mapRuntime = new Map(
    Object.keys(MAPS).map((mapId) => [mapId, {
        players: new Set(),
        simulationActive: false,
        lastActiveAt: Date.now(),
        persistentState: {
            events: [],
            resources: {}
        }
    }])
);

const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', service: 'rpg-multiplayer-server' }));
        return;
    }

    res.writeHead(404);
    res.end('Not found');
});

const io = new Server(server, {
    cors: { origin: '*' }
});

function roomName(mapId) {
    return `map:${mapId}`;
}

function getPlayersInMap(mapId) {
    const result = {};
    for (const [id, player] of players.entries()) {
        if (player.mapId === mapId) result[id] = player;
    }
    return result;
}

function getPublicMapInfo(mapId) {
    const map = MAPS[mapId];
    return {
        id: map.id,
        name: map.name,
        worldSize: map.worldSize,
        safeZone: map.safeZone,
        monstersEnabled: map.monstersEnabled,
        simulationMode: map.simulationMode,
        backgroundColor: map.backgroundColor,
        borderColor: map.borderColor,
        spawn: map.spawn
    };
}

function refreshMapActivity(mapId) {
    const runtime = mapRuntime.get(mapId);
    if (!runtime) return;

    const shouldBeActive = runtime.players.size > 0;
    if (runtime.simulationActive !== shouldBeActive) {
        runtime.simulationActive = shouldBeActive;
        if (!shouldBeActive) runtime.lastActiveAt = Date.now();

        // Os módulos de IA/eventos poderão escutar este estado futuramente.
        io.to(roomName(mapId)).emit('mapSimulationState', {
            mapId,
            active: runtime.simulationActive
        });
        console.log(`[MAP] ${mapId}: simulação ${shouldBeActive ? 'ATIVA' : 'PAUSADA'}`);
    }
}

function addPlayerToMap(socket, player, mapId) {
    const runtime = mapRuntime.get(mapId);
    player.mapId = mapId;
    runtime.players.add(socket.id);
    socket.join(roomName(mapId));
    refreshMapActivity(mapId);
}

function removePlayerFromMap(socket, player) {
    const oldMapId = player.mapId;
    const runtime = mapRuntime.get(oldMapId);
    if (runtime) {
        runtime.players.delete(socket.id);
        socket.to(roomName(oldMapId)).emit('playerDisconnected', socket.id);
    }
    socket.leave(roomName(oldMapId));
    refreshMapActivity(oldMapId);
}

function validNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

io.on('connection', (socket) => {
    const startingMap = MAPS.starter_town;
    const player = {
        id: socket.id,
        x: startingMap.spawn.x,
        y: startingMap.spawn.y,
        sprite: '🧙‍♂️',
        mapId: startingMap.id
    };

    players.set(socket.id, player);
    addPlayerToMap(socket, player, startingMap.id);

    socket.emit('currentPlayers', getPlayersInMap(startingMap.id));
    socket.emit('mapInfo', getPublicMapInfo(startingMap.id));
    socket.broadcast.to(roomName(startingMap.id)).emit('newPlayer', player);

    socket.on('playerMovement', (movementData = {}) => {
        const currentPlayer = players.get(socket.id);
        if (!currentPlayer || !validNumber(movementData.x) || !validNumber(movementData.y)) return;

        const map = MAPS[currentPlayer.mapId];
        currentPlayer.x = Math.max(20, Math.min(map.worldSize - 20, movementData.x));
        currentPlayer.y = Math.max(20, Math.min(map.worldSize - 20, movementData.y));
        socket.to(roomName(currentPlayer.mapId)).emit('playerMoved', currentPlayer);
    });

    socket.on('requestMapChange', (requestedMapId) => {
        const currentPlayer = players.get(socket.id);
        const destination = MAPS[requestedMapId];
        if (!currentPlayer || !destination || !destination.enabled) {
            socket.emit('mapChangeRejected', { reason: 'Mapa indisponível.' });
            return;
        }
        if (currentPlayer.mapId === requestedMapId) return;

        removePlayerFromMap(socket, currentPlayer);
        currentPlayer.x = destination.spawn.x;
        currentPlayer.y = destination.spawn.y;
        addPlayerToMap(socket, currentPlayer, requestedMapId);

        socket.emit('mapInfo', getPublicMapInfo(requestedMapId));
        socket.emit('currentPlayers', getPlayersInMap(requestedMapId));
        socket.broadcast.to(roomName(requestedMapId)).emit('newPlayer', currentPlayer);
        console.log(`[MAP] ${socket.id} entrou em ${requestedMapId}`);
    });

    socket.on('sendMessage', (messageText) => {
        const currentPlayer = players.get(socket.id);
        if (!currentPlayer || typeof messageText !== 'string') return;
        const text = messageText.trim().slice(0, 50);
        if (!text) return;

        io.to(roomName(currentPlayer.mapId)).emit('newMessage', {
            sender: socket.id.substring(0, 5),
            text
        });
    });

    socket.on('shootMagic', (magicInfo = {}) => {
        const currentPlayer = players.get(socket.id);
        if (!currentPlayer) return;
        const map = MAPS[currentPlayer.mapId];

        // A cidade inicial é uma zona segura: não permite ações de combate.
        if (map.safeZone || !validNumber(magicInfo.x) || !validNumber(magicInfo.y) ||
            !validNumber(magicInfo.vx) || !validNumber(magicInfo.vy)) return;

        socket.to(roomName(currentPlayer.mapId)).emit('magicSpawned', magicInfo);
    });

    socket.on('disconnect', () => {
        const currentPlayer = players.get(socket.id);
        if (currentPlayer) removePlayerFromMap(socket, currentPlayer);
        players.delete(socket.id);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor MMORPG rodando na porta ${PORT}`);
});
