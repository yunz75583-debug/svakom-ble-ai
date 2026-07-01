import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

const toyQueue = {
  command: null,
  timestamp: 0,
  secret: process.env.BRIDGE_SECRET || '123456'
};

// ===== 健康检查 =====
app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

// ===== 接收指令（兼容 HTTP 调用） =====
app.post('/toy', (req, res) => {
  const { secret, action, value, pattern, level } = req.body;
  if (secret !== toyQueue.secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  if (action === 'intensity') {
    toyQueue.command = { action: 'intensity', value: value, received: Date.now() };
  } else if (action === 'pattern') {
    toyQueue.command = { action: 'pattern', pattern: pattern, level: level || 3, received: Date.now() };
  } else if (action === 'stop') {
    toyQueue.command = { action: 'stop', received: Date.now() };
  } else {
    return res.status(400).json({ error: '未知 action' });
  }
  
  toyQueue.timestamp = Date.now();
  console.log(`📥 指令: ${action}`, req.body);
  res.json({ status: 'ok' });
});

// ===== 网页轮询 =====
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
    age: Date.now() - toyQueue.timestamp
  });
});

// ===== 糯叽叽 MCP 入口 =====
app.post('/', (req, res) => {
  console.log('📥 糯叽叽请求:', JSON.stringify(req.body, null, 2));

  const { jsonrpc, id, method, params } = req.body;

  // 处理 initialize
  if (method === 'initialize') {
    return res.json({
      jsonrpc: '2.0',
      id: id,
      result: {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'svakom-bridge', version: '1.0.0' }
      }
    });
  }

  // 处理 tools/list
  if (method === 'tools/list') {
    return res.json({
      jsonrpc: '2.0',
      id: id,
      result: {
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
            name: 'toy_set_pattern',
            description: '设置振动花样 (1-8)，等级 (1-5，可选，默认3)',
            inputSchema: {
              type: 'object',
              properties: {
                pattern: { type: 'number', minimum: 1, maximum: 8 },
                level: { type: 'number', minimum: 1, maximum: 5 }
              },
              required: ['pattern']
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
      }
    });
  }

  // 处理 tools/call
  if (method === 'tools/call') {
    const toolName = params?.name;
    const args = params?.arguments || {};

    if (toolName === 'toy_set_speed') {
      const val = args.value;
      toyQueue.command = { action: 'intensity', value: val, received: Date.now() };
      toyQueue.timestamp = Date.now();
      return res.json({
        jsonrpc: '2.0',
        id: id,
        result: {
          content: [{ type: 'text', text: `✅ 已设置强度为 ${val}%` }]
        }
      });
    }

    if (toolName === 'toy_set_pattern') {
      const pattern = args.pattern;
      const level = args.level || 3;
      toyQueue.command = { action: 'pattern', pattern: pattern, level: level, received: Date.now() };
      toyQueue.timestamp = Date.now();
      return res.json({
        jsonrpc: '2.0',
        id: id,
        result: {
          content: [{ type: 'text', text: `✅ 已设置花样 ${pattern}，等级 ${level}` }]
        }
      });
    }

    if (toolName === 'toy_stop') {
      toyQueue.command = { action: 'stop', received: Date.now() };
      toyQueue.timestamp = Date.now();
      return res.json({
        jsonrpc: '2.0',
        id: id,
        result: {
          content: [{ type: 'text', text: '✅ 已停止' }]
        }
      });
    }

    return res.json({
      jsonrpc: '2.0',
      id: id,
      error: { code: -32601, message: `未知工具: ${toolName}` }
    });
  }

  res.json({ jsonrpc: '2.0', id: id, result: {} });
});

app.listen(PORT, () => {
  console.log(`🚀 服务运行在端口 ${PORT}`);
});
