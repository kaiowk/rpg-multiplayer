const http = require('http').createServer();
const io = require('socket.io')(http, { cors: { origin: "*" } });

let players = {};

io.on('connection', (socket) => {
    // Cria o jogador com uma posição padrão estável
    players[socket.id] = { id: socket.id, x: 600, y: 600, sprite: '🧙‍♂️' };

    // Envia a lista atual de jogadores apenas para o novo conectado
    socket.emit('currentPlayers', players);

    // Avisa a todos que um novo jogador entrou
    socket.broadcast.emit('newPlayer', players[socket.id]);

    // Apenas repassa a nova posição para os outros, sem calcular nada no servidor
    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    // Limpa o fantasma do jogador imediatamente ao desconectar
    socket.on('disconnect', () => {
        io.emit('playerDisconnected', socket.id);
        delete players[socket.id];
    });
});

const PORT = process.env.PORT || 3050;
http.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor leve rodando na porta ${PORT}`);
});
