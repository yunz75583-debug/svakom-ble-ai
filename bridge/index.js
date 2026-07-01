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

// ===== 糯叽叽 MCP 入口 - POST / =====
app.post('/', (req, res) => {
  const { method, params, secret, action, value } = req.body;

  // 处理 tools/list 请求
  if (method === 'tools/list') {
    return res.json({
      tools: [
        {
          name: 'toy_set_speed',
          description: '设置玩具强度 (0-100)',
          parameters: {
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
          parameters: { type: 'object', properties: {} }
        }
      ]
    });
  }

  // 处理工具调用
  if (method === 'tools/call') {
    const toolName = params?.name;
    const args = params?.arguments || {};

    if (toolName === 'toy_set_speed') {
      const val = args.value;
      toyQueue.command = { action: 'intensity', value: val, received: Date.now() };
      toyQueue.timestamp = Date.now();
      console.log(`📥 糯叽叽指令: 强度 ${val}%`);
      return res.json({
        content: [{ type: 'text', text: `✅ 已设置强度为 ${val}%` }]
      });
    }

    if (toolName === 'toy_stop') {
      toyQueue.command = { action: 'intensity', value: 0, received: Date.now() };
      toyQueue.timestamp = Date.now();
      console.log('📥 糯叽叽指令: 停止');
      return res.json({
        content: [{ type: 'text', text: '✅ 已停止' }]
      });
    }

    return res.json({ error: `未知工具: ${toolName}` });
  }

  // 兼容旧方式：直接发送指令
  if (action) {
    toyQueue.command = { action, value, received: Date.now() };
    toyQueue.timestamp = Date.now();
    console.log(`📥 糯叽叽指令: ${action} = ${value}`);
    return res.json({ status: 'ok', command: toyQueue.command });
  }

  res.json({ error: '未知请求' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔐 Secret: ${toyQueue.secret}`);
});
