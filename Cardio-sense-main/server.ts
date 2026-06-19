import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
    },
  });

  const PORT = 3000;

  app.use(express.json());

  // In-memory latest readings for quick access (optional, but good for real-time)
  const latestReadings: Record<string, any> = {};

  // API Endpoints
  app.post('/api/device-data', (req, res) => {
    const { userId, systolic, diastolic, pulse, battery, deviceStatus } = req.body;

    if (!userId || systolic === undefined || diastolic === undefined || pulse === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // BP Status Logic
    let status = 'Normal';
    if (systolic >= 130 || diastolic >= 90) {
      status = 'High';
    } else if (systolic >= 120) {
      status = 'Elevated';
    } else if (systolic < 90 || diastolic < 60) {
      status = 'Low';
    }

    const reading = {
      userId,
      systolic,
      diastolic,
      pulse,
      battery,
      deviceStatus,
      status,
      timestamp: new Date().toISOString(),
    };

    latestReadings[userId] = reading;

    // Emit via WebSocket
    io.to(`user_${userId}`).emit('bp_update', reading);

    // Alert Logic
    if (status === 'High' || status === 'Low') {
      io.to(`user_${userId}`).emit('alert', {
        type: 'BP_ALERT',
        message: `Abnormal Blood Pressure Detected: ${status} (${systolic}/${diastolic})`,
        reading,
      });
    }

    if (battery < 20) {
      io.to(`user_${userId}`).emit('alert', {
        type: 'BATTERY_LOW',
        message: `Device Battery Low: ${battery}%`,
        reading,
      });
    }

    res.json({ success: true, reading });
  });

  app.get('/api/latest/:userId', (req, res) => {
    const { userId } = req.params;
    res.json(latestReadings[userId] || null);
  });

  // WebSocket Connection
  io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('join', (userId) => {
      socket.join(`user_${userId}`);
      console.log(`User ${userId} joined room user_${userId}`);
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
