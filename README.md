# XiaoZhi Music Bridge

Cloud bridge between the XiaoZhi MCP endpoint and an existing Music MCP WebSocket server.

## Environment variables

- `XIAOZHI_MCP_URL` = your private XiaoZhi MCP WebSocket endpoint
- `MUSIC_MCP_URL` = your Music MCP WebSocket URL

Example:

`MUSIC_MCP_URL=wss://your-music-service.up.railway.app`

The bridge connects OUTBOUND to both servers and transparently forwards MCP JSON-RPC messages.

## Railway

Deploy this repository as a Node.js service. Railway supplies `PORT` automatically.

Health endpoint:

`/health`
