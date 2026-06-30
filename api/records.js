module.exports = async function handler(req, res) {
  try {
    const secret = process.env.HEALTH_SYNC_SECRET;
    if (!secret) return send(res, 500, { error: '云同步口令还没有在 Vercel 环境变量中设置' });
    if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
      return send(res, 500, { error: 'Vercel Blob 还没有连接到项目，请连接 Blob 后重新部署' });
    }

    const auth = req.headers.authorization || '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    if (!token || token !== secret) return send(res, 401, { error: '云同步口令不正确' });

    const { get, put } = await import('@vercel/blob');
    const key = 'ai-health/records.json';

    if (req.method === 'GET') {
      const result = await get(key, { access: 'private' });
      if (!result || result.statusCode !== 200 || !result.stream) {
        return send(res, 200, { records: {}, updatedAt: null });
      }
      const text = await new Response(result.stream).text();
      return send(res, 200, JSON.parse(text));
    }

    if (req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const records = sanitizeRecords(body.records || {});
      const payload = { records, updatedAt: new Date().toISOString() };
      await put(key, JSON.stringify(payload), {
        access: 'private',
        allowOverwrite: true,
        contentType: 'application/json'
      });
      return send(res, 200, payload);
    }

    return send(res, 405, { error: '不支持的请求方式' });
  } catch (error) {
    return send(res, 500, { error: error.message || '云同步服务暂时不可用' });
  }
};

function sanitizeRecords(records) {
  const cleaned = {};
  for (const [date, value] of Object.entries(records || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    cleaned[date] = {
      headache: normalizeLevel(value.headache),
      back: normalizeLevel(value.back),
      eyes: normalizeLevel(value.eyes),
      sleep: normalizeSleep(value.sleep),
      food: !!value.food,
      exercise: !!value.exercise,
      supplement: !!value.supplement,
      ts: Number(value.ts) || Date.now()
    };
    if (typeof value.aiText === 'string') cleaned[date].aiText = value.aiText.slice(0, 2000);
  }
  return cleaned;
}

function normalizeLevel(value) {
  const n = Number(value);
  return [0, 1, 2].includes(n) ? n : null;
}

function normalizeSleep(value) {
  if (typeof value === 'boolean') return value ? 2 : 0;
  return normalizeLevel(value);
}

function send(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
