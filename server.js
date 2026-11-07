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

        // Recebe a mensagem do chat e distribui para todos com o ID do jogador
    socket.on('sendMessage', (messageText) => {
        io.emit('newMessage', {
            sender: socket.id.substring(0, 5), // Usa os primeiros 5 caracteres do ID como "Nome"
            text: messageText
        });
    });

        // Repassa as posições dos monstros enviadas pelo Host para todos os jogadores na sala
    socket.on('updateMonsters', (monstersData) => {
        socket.broadcast.emit('syncMonsters', monstersData);
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
