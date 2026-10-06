/**
 * Aegis FiveM Service
 * Queries CFX.re API or direct FiveM Server IP:Port
 */

function cleanFiveMText(str) {
  if (!str) return "";
  return str.replace(/\^[0-9]/g, "").replace(/\^#/g, "").trim();
}

function parseFiveMInput(input) {
  let cleaned = input.trim().toLowerCase();
  cleaned = cleaned.replace(/^https?:\/\//, "").replace(/^fivem:\/\/connect\//, "");
  
  if (cleaned.includes("cfx.re/join/")) {
    const parts = cleaned.split("cfx.re/join/");
    return { type: "cfx", code: parts[1].replace(/\/.*$/, "") };
  }
  
  // Direct IP:Port or Domain:Port
  if (cleaned.includes(":")) {
    const [host, port] = cleaned.split(":");
    return { type: "ip", host, port: parseInt(port, 10) || 30120 };
  }

  // 6-8 char alphanumeric is likely a CFX code
  if (/^[a-z0-9]{5,8}$/.test(cleaned)) {
    return { type: "cfx", code: cleaned };
  }

  // Default assumption: IP with default 30120 port
  return { type: "ip", host: cleaned, port: 30120 };
}

async function fetchFiveMServer(input) {
  const parsed = parseFiveMInput(input);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    if (parsed.type === "cfx") {
      const url = "https://servers-frontend.fivem.net/api/servers/single/" + parsed.code;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json"
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        return { online: false, error: "Sunucu çevrimdışı veya CFX kodu bulunamadı (" + res.status + ")" };
      }

      const json = await res.json();
      const data = json.Data || json;
      if (!data) return { online: false, error: "Sunucu bilgisi alınamadı" };

      const name = cleanFiveMText(data.hostname || "FiveM Roleplay Sunucusu");
      const players = data.clients ?? (data.players ? data.players.length : 0);
      const maxPlayers = data.sv_maxclients ?? 128;
      const connectUrl = "fivem://connect/cfx.re/join/" + parsed.code;
      const ping = data.ping || 0;
      const gametype = data.gametype || "Roleplay";
      const mapname = data.mapname || "Los Santos";

      return {
        online: true,
        type: "cfx",
        code: parsed.code,
        name,
        players,
        maxPlayers,
        connectUrl,
        ping,
        gametype,
        mapname,
        bannerUrl: data.vars?.banner_detail || null,
        resourcesCount: Array.isArray(data.resources) ? data.resources.length : 0,
      };
    } else {
      // Direct IP query
      const dynamicUrl = "http://" + parsed.host + ":" + parsed.port + "/dynamic.json";
      const infoUrl = "http://" + parsed.host + ":" + parsed.port + "/info.json";
      const playersUrl = "http://" + parsed.host + ":" + parsed.port + "/players.json";

      const [dynRes, infoRes, plyRes] = await Promise.allSettled([
        fetch(dynamicUrl, { signal: controller.signal }),
        fetch(infoUrl, { signal: controller.signal }),
        fetch(playersUrl, { signal: controller.signal })
      ]);
      clearTimeout(timeoutId);

      if (dynRes.status !== "fulfilled" || !dynRes.value.ok) {
        return { online: false, error: "Sunucuya bağlanılamadı (IP: " + parsed.host + ":" + parsed.port + ")" };
      }

      const dynData = await dynRes.value.json();
      let infoData = {};
      let playersData = [];

      if (infoRes.status === "fulfilled" && infoRes.value.ok) {
        try { infoData = await infoRes.value.json(); } catch(e) {}
      }
      if (plyRes.status === "fulfilled" && plyRes.value.ok) {
        try { playersData = await plyRes.value.json(); } catch(e) {}
      }

      const name = cleanFiveMText(dynData.hostname || "FiveM Roleplay Sunucusu");
      const players = dynData.clients ?? playersData.length;
      const maxPlayers = dynData.sv_maxclients ?? 128;
      const connectUrl = "fivem://connect/" + parsed.host + ":" + parsed.port;

      return {
        online: true,
        type: "ip",
        host: parsed.host,
        port: parsed.port,
        name,
        players,
        maxPlayers,
        connectUrl,
        ping: 0,
        gametype: dynData.gametype || "Roleplay",
        mapname: dynData.mapname || "Los Santos",
        bannerUrl: infoData.vars?.banner_detail || null,
        resourcesCount: Array.isArray(infoData.resources) ? infoData.resources.length : 0,
      };
    }
  } catch (err) {
    clearTimeout(timeoutId);
    return { online: false, error: "Bağlantı zaman aşımına uğradı veya sunucu kapalı." };
  }
}

module.exports = {
  fetchFiveMServer,
  cleanFiveMText,
  parseFiveMInput
};
