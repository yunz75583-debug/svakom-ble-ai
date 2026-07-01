import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// 指令队列 + 密码
const toyQueue = {
  command: null,
  timestamp: 0,
  secret: process.env.BRIDGE_SECRET || '123456'
};

// ===== 健康检查 =====
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'SVAKOM BLE Bridge' });
});

// ===== 接收指令（AI 调用） =====
app.post('/toy', (req, res) => {
  const { secret, action, value } = req.body;

  if (secret !== toyQueue.secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  toyQueue.command = { action, value, received: Date.now() };
  toyQueue.timestamp = Date.now();

  console.log(`📥 收到指令: ${action} = ${value}`);
  res.json({ status: 'ok', command: toyQueue.command });
});

// ===== 网页中继轮询 =====
app.get('/toy-next', (req, res) => {
  const { secret } = req.query;

  if (secret !== toyQueue.secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const age = Date.now() - toyQueue.timestamp;
  if (age > 5000) {
    return res.json({ command: null });
  }

  const cmd = toyQueue.command;
  toyQueue.command = null;
  res.json({ command: cmd });
});

// ===== 状态查询 =====
app.get('/status', (req, res) => {
  res.json({
    hasCommand: toyQueue.command !== null,
    timestamp: toyQueue.timestamp,
    age: Date.now() - toyQueue.timestamp
  });
});

// ===== 糯叽叽 MCP 入口 - POST /（已关闭密码验证） =====
app.post('/', (req, res) => {
  const { secret, action, value } = req.body;

  // 密码验证已关闭，方便测试
  // if (secret !== toyQueue.secret) {
  //   return res.status(401).json({ error: 'Unauthorized' });
  // }

  toyQueue.command = { action, value, received: Date.now() };
  toyQueue.timestamp = Date.now();

  console.log(`📥 糯叽叽指令: ${action} = ${value}`);
  res.json({ status: 'ok', command: toyQueue.command });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔐 Secret: ${toyQueue.secret}`);
});
