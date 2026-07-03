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

// ===== 接收指令（HTTP / MCP 调用） =====
app.post('/toy', (req, res) => {
  const { secret, action, value } = req.body;

  // 密码验证已注释（糯叽叽不需要密码）
  // if (secret !== toyQueue.secret) {
  //   return res.status(401).json({ error: 'Unauthorized' });
  // }

  // 支持三种 action：vibration / extension / stop
  if (action === 'vibration' || action === 'extension' || action === 'stop') {
    toyQueue.command = { action, value: value || 0, received: Date.now() };
    toyQueue.timestamp = Date.now();
    console.log(`📥 收到指令: ${action} = ${value}`);
    res.json({ status: 'ok', command: toyQueue.command });
  } else {
    res.status(400).json({ error: '未知 action，支持: vibration / extension / stop' });
  }
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
  console.log(`📤 中继取走: ${cmd?.action} = ${cmd?.value}`);
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
  console.log('📥 MCP 请求:', JSON.stringify(req.body, null, 2));

  const { jsonrpc, id, method, params } = req.body;

  // initialize
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

  // tools/list
  if (method === 'tools/list') {
    return res.json({
      jsonrpc: '2.0',
      id: id,
      result: {
        tools: [
          {
            name: 'toy_set_vibration',
            description: '设置震动强度 (0-100)',
            inputSchema: {
              type: 'object',
              properties: {
                value: { type: 'number', minimum: 0, maximum: 100 }
              },
              required: ['value']
            }
          },
          {
            name: 'toy_set_extension',
            description: '设置伸缩强度 (0-100)',
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
            description: '停止所有动作',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          }
        ]
      }
    });
  }

  // tools/call
  if (method === 'tools/call') {
    try {
      const toolName = params?.name;
      const args = params?.arguments || {};

      if (toolName === 'toy_set_vibration') {
        const val = typeof args.value === 'number' ? args.value : 0;
        toyQueue.command = { action: 'vibration', value: val, received: Date.now() };
        toyQueue.timestamp = Date.now();
        console.log(`📥 存入队列: 震动 ${val}%`);
        return res.json({
          jsonrpc: '2.0',
          id: id,
          result: {
            content: [{ type: 'text', text: `✅ 震动强度设为 ${val}%` }]
          }
        });
      }

      if (toolName === 'toy_set_extension') {
        const val = typeof args.value === 'number' ? args.value : 0;
        toyQueue.command = { action: 'extension', value: val, received: Date.now() };
        toyQueue.timestamp = Date.now();
        console.log(`📥 存入队列: 伸缩 ${val}%`);
        return res.json({
          jsonrpc: '2.0',
          id: id,
          result: {
            content: [{ type: 'text', text: `✅ 伸缩强度设为 ${val}%` }]
          }
        });
      }

      if (toolName === 'toy_stop') {
        toyQueue.command = { action: 'stop', value: 0, received: Date.now() };
        toyQueue.timestamp = Date.now();
        console.log(`📥 存入队列: 停止`);
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
    } catch (e) {
      console.error('MCP tools/call 出错:', e);
      return res.json({
        jsonrpc: '2.0',
        id: id,
        error: { code: -32603, message: 'Internal Server Error' }
      });
    }
  }

  res.json({ jsonrpc: '2.0', id: id, result: {} });
});

app.listen(PORT, () => {
  console.log(`🚀 服务运行在端口 ${PORT}`);
});
