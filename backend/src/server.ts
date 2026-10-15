import http from 'node:http';
import { Server } from 'socket.io';
import { app } from './app.js';
import { env } from './config/env.js';
import { socketState } from './lib/socket-state.js';

const server = http.createServer(app);

export const io = new Server(server, {
  cors: {
    origin: env.frontendUrl,
    methods: ['GET', 'POST']
  }
});

socketState.io = io;

io.on('connection', (socket) => {
  socket.on('join-room', (room: string) => socket.join(room));
  socket.on('heartbeat', (payload) => {
    socket.emit('heartbeat', payload);
  });
});

server.listen(env.port, () => {
  console.log(`Backend running on http://localhost:${env.port}`);
});
