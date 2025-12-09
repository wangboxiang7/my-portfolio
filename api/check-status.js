const { CozeAPI } = require('@coze/api');

// Query workflow execution status by execute_id
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const token = process.env.COZE_API_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'Missing COZE_API_TOKEN' });
  }

  const executeId = req.query?.id || req.query?.execute_id;
  if (!executeId) {
    return res.status(400).json({ error: 'execute_id is required' });
  }

  try {
    const apiClient = new CozeAPI({
      token,
      baseURL: 'https://api.coze.cn'
    });

    // SDK 方法命名参考 coze-js: workflows.runs.get
    const resp = await apiClient.workflows.runs.get({
      execute_id: executeId
    });

    // 期望返回结构：code/msg/data/output_text/output/status 等
    if (resp?.code !== 0) {
      return res.status(200).json({
        status: 'Error',
        code: resp?.code,
        msg: resp?.msg || 'Workflow query failed',
        debug_url: resp?.debug_url,
        fullResponse: resp
      });
    }

    // 如果 data 已经是最终结果（字符串）
    const rawData = resp?.data;
    let output = rawData;
    try {
      // 若 data 是 JSON 字符串，尝试解析并取 data 字段
      const parsed = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
      if (parsed && typeof parsed === 'object' && parsed.data) {
        output = parsed.data;
      }
    } catch (e) {
      // 保留原始 rawData
      output = rawData;
    }

    // 判断状态：如果存在 output 即视为完成
    const isDone = !!output;
    return res.status(200).json({
      status: isDone ? 'Success' : 'Running',
      output: isDone ? output : undefined,
      debug_url: resp?.debug_url,
      execute_id: executeId
    });
  } catch (err) {
    console.error('check-status error:', err);
    return res.status(500).json({
      status: 'Error',
      error: err?.message || 'check-status failed'
    });
  }
};

