#!/usr/bin/env node
/**
 * xiaozhi-music-railway
 * Music MCP server + optional outbound XiaoZhi MCP bridge.
 *
 * Env:
 *   PORT=Railway supplied port
 *   XIAOZHI_MCP_URL=wss://api.xiaozhi.me/mcp/?token=...
 *
 * The existing WebSocket MCP music server remains available on PORT.
 * When XIAOZHI_MCP_URL is set, this process also connects OUTBOUND
 * to XiaoZhi and exposes the same music tools there.
 */
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import Meting from './lib/meting/meting.js';

const PORT = parseInt(process.env.PORT || '8765', 10);
const HOST = process.env.HOST || '0.0.0.0';
const XIAOZHI_MCP_URL = process.env.XIAOZHI_MCP_URL || process.env.MCP_ENDPOINT || '';

function createClient(platform) {
  const meting = new Meting(platform);
  meting.format(true);
  const cookieVar = `METING_${platform.toUpperCase()}_COOKIE`;
  const cookie = process.env[cookieVar] || process.env.METING_COOKIE;
  if (cookie) meting.cookie(cookie);
  return meting;
}

const PLATFORMS = ['netease', 'tencent', 'kugou', 'kuwo'];

const TOOLS = [
  {
    name: 'platforms',
    description: 'List supported music platforms.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => JSON.stringify({
      ok: true,
      data: PLATFORMS.map(p => ({
        code: p,
        name: {
          netease: 'NetEase Cloud Music',
          tencent: 'Tencent QQ Music',
          kugou: 'KuGou Music',
          kuwo: 'Kuwo Music'
        }[p]
      }))
    }, null, 2)
  },
  {
    name: 'search',
    description: 'Search songs, albums or artists on a music platform.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: PLATFORMS, description: 'Music platform' },
        keyword: { type: 'string', description: 'Song or artist name' },
        page: { type: 'integer', description: 'Page number', default: 1 },
        limit: { type: 'integer', description: 'Results per page', default: 20 }
      },
      required: ['platform', 'keyword']
    },
    handler: async (args) => {
      const client = createClient(args.platform);
      const options = {};
      if (args.page) options.page = args.page;
      if (args.limit) options.limit = args.limit;
      const raw = await client.search(args.keyword, options);
      return typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
    }
  },
  {
    name: 'song',
    description: 'Get song details by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: PLATFORMS },
        id: { type: 'string', description: 'Song ID' }
      },
      required: ['platform', 'id']
    },
    handler: async (args) => {
      const raw = await createClient(args.platform).song(args.id);
      return typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
    }
  },
  {
    name: 'url',
    description: 'Get a playable audio URL for a song by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: PLATFORMS },
        id: { type: 'string', description: 'Song ID' },
        br: { type: 'integer', description: 'Bitrate', default: 320 }
      },
      required: ['platform', 'id']
    },
    handler: async (args) => {
      const raw = await createClient(args.platform).url(args.id, args.br || 320);
      return typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
    }
  },
  {
    name: 'album',
    description: 'Get album details by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: PLATFORMS },
        id: { type: 'string' }
      },
      required: ['platform', 'id']
    },
    handler: async (args) => {
      const raw = await createClient(args.platform).album(args.id);
      return typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
    }
  },
  {
    name: 'artist',
    description: 'Get artist songs by artist ID.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: PLATFORMS },
        id: { type: 'string' },
        limit: { type: 'integer', default: 50 }
      },
      required: ['platform', 'id']
    },
    handler: async (args) => {
      const raw = await createClient(args.platform).artist(args.id, args.limit || 50);
      return typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
    }
  },
  {
    name: 'playlist',
    description: 'Get playlist details by playlist ID.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: PLATFORMS },
        id: { type: 'string' }
      },
      required: ['platform', 'id']
    },
    handler: async (args) => {
      const raw = await createClient(args.platform).playlist(args.id);
      return typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
    }
  },
  {
    name: 'lyric',
    description: 'Get song lyrics by song ID.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: PLATFORMS },
        id: { type: 'string' }
      },
      required: ['platform', 'id']
    },
    handler: async (args) => {
      const raw = await createClient(args.platform).lyric(args.id);
      return typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
    }
  },
  {
    name: 'pic',
    description: 'Get cover image URL by resource ID.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: PLATFORMS },
        id: { type: 'string' },
        size: { type: 'integer', default: 300 }
      },
      required: ['platform', 'id']
    },
    handler: async (args) => {
      const raw = await createClient(args.platform).pic(args.id, args.size || 300);
      return typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
    }
  }
];

async function handleMessage(data) {
  const { id, method, params = {} } = data;

  try {
    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: { listChanged: true } },
            serverInfo: { name: 'xiaozhi-music-railway', version: '1.1.0-xiaozhi-bridge' }
          }
        };

      case 'notifications/initialized':
      case 'ping':
        return id == null ? null : { jsonrpc: '2.0', id, result: {} };

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: TOOLS.map(t => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema
            }))
          }
        };

      case 'tools/call': {
        const tool = TOOLS.find(t => t.name === params.name);
        if (!tool) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Unknown tool: ${params.name}` }
          };
        }

        const text = await tool.handler(params.arguments || {});
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text }]
          }
        };
      }

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Unknown method: ${method}` }
        };
    }
  } catch (err) {
    console.error(`Error handling ${method}:`, err);
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32603, message: err?.message || 'Internal error' }
    };
  }
}

// Railway health endpoint.
const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      musicMcp: true,
      xiaozhiBridge: Boolean(XIAOZHI_MCP_URL)
    }));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('xiaozhi-music-railway is running\\n');
});
httpServer.listen(PORT, HOST, () => {
  console.log(`[ready] HTTP health on ${HOST}:${PORT}`);
});

// Existing inbound music MCP WebSocket server remains available.
const wss = new WebSocketServer({ server: httpServer });
wss.on('connection', (ws, req) => {
  console.log(`[music-connect] ${req.socket.remoteAddress}`);
  ws.on('message', async raw => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({
        jsonrpc: '2.0', id: null,
        error: { code: -32700, message: 'Parse error' }
      }));
      return;
    }
    const response = await handleMessage(data);
    if (response) ws.send(JSON.stringify(response));
  });
  ws.on('close', () => console.log('[music-disconnect]'));
  ws.on('error', err => console.error('[music-error]', err.message));
});

// Outbound XiaoZhi bridge: XiaoZhi connects to us by our outbound WebSocket.
let xiaozhiWs = null;
let reconnectTimer = null;

function connectToXiaoZhi() {
  if (!XIAOZHI_MCP_URL) {
    console.log('[xiaozhi] XIAOZHI_MCP_URL/MCP_ENDPOINT not set; bridge disabled');
    return;
  }

  if (xiaozhiWs && (xiaozhiWs.readyState === WebSocket.OPEN ||
                    xiaozhiWs.readyState === WebSocket.CONNECTING)) {
    return;
  }

  console.log('[xiaozhi] Connecting to Xiaozhi MCP endpoint...');
  xiaozhiWs = new WebSocket(XIAOZHI_MCP_URL);

  xiaozhiWs.on('open', () => {
    console.log('[xiaozhi] CONNECTED to Xiaozhi MCP endpoint');
  });

  xiaozhiWs.on('message', async raw => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      console.error('[xiaozhi] Invalid JSON received');
      return;
    }

    const response = await handleMessage(data);
    if (response && xiaozhiWs?.readyState === WebSocket.OPEN) {
      xiaozhiWs.send(JSON.stringify(response));
    }
  });

  xiaozhiWs.on('close', () => {
    console.log('[xiaozhi] Disconnected; reconnecting in 5s');
    xiaozhiWs = null;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectToXiaoZhi, 5000);
  });

  xiaozhiWs.on('error', err => {
    console.error('[xiaozhi] WebSocket error:', err.message);
  });
}

connectToXiaoZhi();
