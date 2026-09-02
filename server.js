#!/usr/bin/env node
/**
 * XiaoZhi ↔ Music MCP WebSocket bridge
 *
 * Connects OUTBOUND to:
 *   1) XiaoZhi MCP endpoint
 *   2) Existing Music MCP WebSocket server
 *
 * It transparently forwards MCP JSON-RPC messages between them.
 */

import http from "http";
import WebSocket from "ws";

const PORT = Number.parseInt(process.env.PORT || "8080", 10);
const HOST = process.env.HOST || "0.0.0.0";

const XIAOZHI_MCP_URL = process.env.XIAOZHI_MCP_URL || "";
const MUSIC_MCP_URL = process.env.MUSIC_MCP_URL || "";

if (!XIAOZHI_MCP_URL || !MUSIC_MCP_URL) {
  console.error("[config] Missing XIAOZHI_MCP_URL or MUSIC_MCP_URL");
  process.exit(1);
}

let xiaozhi = null;
let music = null;

let xiaozhiConnected = false;
let musicConnected = false;

function safeSend(ws, data, label) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.log(`[${label}] socket not open; message skipped`);
    return false;
  }

  try {
    ws.send(data);
    return true;
  } catch (err) {
    console.error(`[${label}] send error:`, err.message);
    return false;
  }
}

function connectMusic() {
  console.log("[music] Connecting to Music MCP...");
  const ws = new WebSocket(MUSIC_MCP_URL);

  music = ws;

  ws.on("open", () => {
    musicConnected = true;
    console.log("[music] CONNECTED to Music MCP");
  });

  ws.on("message", (data) => {
    console.log("[music→xiaozhi]", data.toString().slice(0, 500));
    safeSend(xiaozhi, data, "xiaozhi");
  });

  ws.on("close", (code, reason) => {
    musicConnected = false;
    console.log(`[music] CLOSED ${code} ${reason?.toString() || ""}`);
    if (music === ws) music = null;
    setTimeout(connectMusic, 3000);
  });

  ws.on("error", (err) => {
    musicConnected = false;
    console.error("[music] ERROR:", err.message);
  });
}

function connectXiaozhi() {
  console.log("[xiaozhi] Connecting to XiaoZhi MCP endpoint...");
  const ws = new WebSocket(XIAOZHI_MCP_URL);

  xiaozhi = ws;

  ws.on("open", () => {
    xiaozhiConnected = true;
    console.log("[xiaozhi] CONNECTED to XiaoZhi MCP endpoint");
  });

  ws.on("message", (data) => {
    console.log("[xiaozhi→music]", data.toString().slice(0, 500));

    if (!musicConnected) {
      console.log("[bridge] Music MCP is not connected yet; message skipped");
      return;
    }

    safeSend(music, data, "music");
  });

  ws.on("close", (code, reason) => {
    xiaozhiConnected = false;
    console.log(`[xiaozhi] CLOSED ${code} ${reason?.toString() || ""}`);
    if (xiaozhi === ws) xiaozhi = null;
    setTimeout(connectXiaozhi, 3000);
  });

  ws.on("error", (err) => {
    xiaozhiConnected = false;
    console.error("[xiaozhi] ERROR:", err.message);
  });
}

// Simple Railway health endpoint.
const server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    const body = JSON.stringify({
      ok: true,
      xiaozhiConnected,
      musicConnected
    });

    res.writeHead(200, {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body)
    });
    res.end(body);
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

server.listen(PORT, HOST, () => {
  console.log(`[ready] HTTP health on ${HOST}:${PORT}`);
  console.log("[bridge] Starting outbound MCP connections...");
  connectMusic();
  connectXiaozhi();
});
