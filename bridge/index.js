import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// 指令队列
const toyQueue = {
  command: null,
  timestamp: 0,
  secret: process.env.BRIDGE_SECRET || '123456'
};

// ===== 健康检查 =====
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'SVAKOM BLE Bridge' });
});

// ===== 接收指令 =====
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

// ===== 糯叽叽入口 =====
app.post('/', (req, res) => {
  console.log('📥 糯叽叽请求体:', req.body);

  const { method, params } = req.body;

  // 返回工具列表
  if (method === 'tools/list') {
    return res.json({
      tools: [
        {
          name: 'toy_set_speed',
          description: '设置玩具强度 (0-100)',
          inputSchema: {
            type: 'object',
            properties: {
              value: { type: 'number', minimum: 0, maximum: 100 }
            },
            required: ['value']
          }
        },
        {
          name: 'toy_stop',
          description: '停止玩具',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        }
      ]
    });
  }

  // 调用工具
  if (method === 'tools/call') {
    const toolName = params?.name;
    const args = params?.arguments || {};

    if (toolName === 'toy_set_speed') {
      const val = args.value;
      toyQueue.command = { action: 'intensity', value: val, received: Date.now() };
      toyQueue.timestamp = Date.now();
      return res.json({
        content: [{ type: 'text', text: `✅ 已设置强度为 ${val}%` }]
      });
    }

    if (toolName === 'toy_stop') {
      toyQueue.command = { action: 'intensity', value: 0, received: Date.now() };
      toyQueue.timestamp = Date.now();
      return res.json({
        content: [{ type: 'text', text: '✅ 已停止' }]
      });
    }

    return res.json({ error: `未知工具: ${toolName}` });
  }

  res.json({ error: '未知请求' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
