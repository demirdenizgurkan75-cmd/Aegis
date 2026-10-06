// ─── Discord OAuth giriş/çıkış + oturum bilgisi ────────────────────────────
const { signToken, verifyToken, getBearerToken, sendJSON, getPublicBaseUrl } = require('./helpers');
const { getOrCreateWebUser, getWebUser } = require('../database');
const { getVerified, addVerified } = require('../verifiedAdmins');

const CALLBACK_PATH = '/auth/discord/callback';

module.exports = {
  name: 'auth',
  async handle(ctx) {
    const { req, res, url } = ctx;

    // ─── GET /auth/discord/login — Discord OAuth başlat ────────────────────
    if (url.pathname === '/auth/discord/login' && req.method === 'GET') {
      const redirectTo = url.searchParams.get('redirect') || '/';
      const state = signToken({ redirectTo, exp: Date.now() + 10 * 60 * 1000 });
      const baseUrl = getPublicBaseUrl(req);
      const callbackUrl = `${baseUrl}${CALLBACK_PATH}`;
      const discordAuthUrl =
        `https://discord.com/oauth2/authorize?client_id=${process.env.CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
        `&response_type=code&scope=identify+guilds&state=${encodeURIComponent(state)}`;
      res.writeHead(302, { Location: discordAuthUrl });
      res.end();
      return true;
    }

    // ─── GET /auth/discord/callback — Discord OAuth callback ────────────────
    if (url.pathname === CALLBACK_PATH && req.method === 'GET') {
      const code = url.searchParams.get('code');
      const stateParam = url.searchParams.get('state');
      const stateData = verifyToken(stateParam);
      const redirectTo = stateData?.redirectTo || '/';

      if (!code) {
        res.writeHead(302, { Location: `${redirectTo}?error=no_code` });
        res.end();
        return true;
      }

      try {
        const baseUrl = getPublicBaseUrl(req);
        const callbackUrl = `${baseUrl}${CALLBACK_PATH}`;

        const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            grant_type: 'authorization_code',
            code,
            redirect_uri: callbackUrl,
          }),
        });
        const tokenData = await tokenRes.json();
        console.log('[Auth] Token response:', tokenData);
        if (!tokenData.access_token) throw new Error(`Token alınamadı: ${JSON.stringify(tokenData)}`);

        const userRes = await fetch('https://discord.com/api/users/@me', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const userData = await userRes.json();
        if (!userData.id) throw new Error('Kullanıcı bilgisi alınamadı');

        // Sunucu listesi çek (dashboard için)
        const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const guildsData = await guildsRes.json();

        const avatar = userData.avatar
          ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png`
          : `https://cdn.discordapp.com/embed/avatars/${parseInt(userData.discriminator || 0) % 5}.png`;

        const account = getOrCreateWebUser(userData.id, {
          username: userData.username,
          avatar,
          guilds: Array.isArray(guildsData) ? guildsData : [],
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
        });

        // guilds listesi cookie'ye KALDIRILDI - 4KB limitini aşıp token'ı bozuyordu.
        // Dashboard /api/dashboard/guilds endpoint'inden Discord'dan taze çekiyor.
        const session = signToken({
          discordId: userData.id,
          username: userData.username,
          avatar,
          exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
        });

        // Session'ı URL'ye değil httpOnly cookie'ye yaz. Sebep:
        //  1) Guild listesi büyükse Location başlığı nginx'in proxy_buffer_size'ını aşıyor ve
        //     nginx 502 Bad Gateway döndürüyordu (OAuth callback'inde görülen hata buydu).
        //  2) Token URL'de kalırsa referrer/log/history üzerinden dışarı sızar.
        res.setHeader('Set-Cookie', `aegis_session=${session}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${7 * 24 * 60 * 60}`);
        res.writeHead(302, { Location: redirectTo });
        res.end();
      } catch (err) {
        console.error('OAuth hatası:', err);
        res.writeHead(302, { Location: `${redirectTo}?error=oauth_failed` });
        res.end();
      }
      return true;
    }

    // ─── GET /auth/logout — oturum cookie'sini sil ─────────────────────────
    if (url.pathname === '/auth/logout' && req.method === 'GET') {
      res.setHeader('Set-Cookie', 'aegis_session=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0');
      res.writeHead(302, { Location: '/' });
      res.end();
      return true;
    }

    // ─── GET /api/me — oturum bilgisi ───────────────────────────────────────
    if (url.pathname === '/api/me' && req.method === 'GET') {
      const token = getBearerToken(req);
      console.log('[API/me] Cookie header:', req.headers['cookie']);
      console.log('[API/me] Extracted token:', token);
      const session = verifyToken(token);
      console.log('[API/me] Verified session:', session);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });

      const account = getWebUser(session.discordId);
      if (!account) return sendJSON(res, 404, { error: 'Hesap bulunamadı' });

      const now = Date.now();
      const trialActive = account.trialEnd > now;
      const trialDaysLeft = Math.max(0, Math.ceil((account.trialEnd - now) / (1000 * 60 * 60 * 24)));

      sendJSON(res, 200, {
        discordId: account.discordId,
        username: account.username,
        avatar: account.avatar,
        trialActive,
        trialDaysLeft,
        selectedPackageId: account.selectedPackageId,
        orders: account.orders,
      });
      return true;
    }

    // ─── GET /api/verify/status — bu hesap doğrulanmış mı? ──────────────────
    if (url.pathname === '/api/verify/status' && req.method === 'GET') {
      const session = verifyToken(getBearerToken(req));
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });
      const v = getVerified(session.discordId);
      sendJSON(res, 200, {
        verified: !!(v && v.verified),
        verifiedAt: v ? v.verifiedAt : null,
        discordId: session.discordId,
      });
      return true;
    }

    // ─── POST /api/verify — Discord ile giriş yapan kullanıcıyı doğrula ────
    if (url.pathname === '/api/verify' && req.method === 'POST') {
      const session = verifyToken(getBearerToken(req));
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });
      const account = getWebUser(session.discordId);
      addVerified(session.discordId, {
        username: account?.username || session.username || null,
        avatar: account?.avatar || session.avatar || null,
      });
      sendJSON(res, 200, { ok: true, verified: true });
      return true;
    }

    return false;
  },
};
