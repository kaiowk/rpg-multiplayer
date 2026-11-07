const http = require('http').createServer();
const io = require('socket.io')(http, {
    cors: { origin: "*" }
});

const WORLD_SIZE = 1200;
let players = {};
let monsters = [];

// Gera os monstros uma única vez no servidor central
const types = [{ sprite: '💀', speed: 1.5 }, { sprite: '🐺', speed: 2.5 }];
for (let i = 0; i < 5; i++) {
    monsters.push({
        id: i,
        x: Math.random() * (WORLD_SIZE - 100) + 50,
        y: Math.random() * (WORLD_SIZE - 100) + 50,
        speed: types[i % 2].speed,
        sprite: types[i % 2].sprite
    });
}

io.on('connection', (socket) => {
    console.log(`Jogador conectado: ${socket.id}`);

    // Cria o novo jogador no servidor
    players[socket.id] = {
        x: 600,
        y: 600,
        sprite: '🧙‍♂️'
    };

    // Avisa quando o jogador se move
    socket.on('move', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
        }
    });

    socket.on('disconnect', () => {
        console.log(`Jogador desconectado: ${socket.id}`);
        delete players[socket.id];
    });
});

// Loop do Servidor (Roda 60 vezes por segundo atualizando monstros e enviando estados)
setInterval(() => {
    // Encontra o jogador mais próximo para cada monstro perseguir
    monsters.forEach(m => {
        let closestPlayer = null;
        let minDist = Infinity;

        for (let id in players) {
            let p = players[id];
            let dx = p.x - m.x;
            let dy = p.y - m.y;
            let dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minDist) {
                minDist = dist;
                closestPlayer = p;
            }
        }

        // Se houver algum jogador online, o monstro corre atrás dele
        if (closestPlayer && minDist > 10) {
            let dx = closestPlayer.x - m.x;
            let dy = closestPlayer.y - m.y;
            m.x += (dx / minDist) * m.speed;
            m.y += (dy / minDist) * m.speed;
        }
    });

    // Envia o estado completo do mundo para todos os conectados
    io.emit('state', { players, monsters });
}, 1000 / 60);

http.listen(3050, () => {
    console.log('Servidor multiplayer rodando na porta 3050!');
});
