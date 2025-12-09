// Query workflow execution status by execute_id using workflow history API
// 参考：https://www.coze.cn/open/docs/developer_guides/workflow_history
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
    // 使用 workflow history API 查询执行结果
    // API 端点根据 Coze 文档：https://www.coze.cn/open/docs/developer_guides/workflow_history
    const apiUrl = 'https://api.coze.cn/open_api/v2/workflow/history';
    
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        execute_id: executeId
      })
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      console.error('Coze API error:', resp.status, errorText);
      return res.status(500).json({
        status: 'Error',
        error: `API request failed: ${resp.status}`,
        details: errorText.substring(0, 500)
      });
    }

    const result = await resp.json();
    console.log('Workflow history response:', JSON.stringify(result, null, 2));

    // 检查响应格式
    if (result?.code !== 0) {
      return res.status(200).json({
        status: 'Error',
        code: result?.code,
        msg: result?.msg || 'Workflow query failed',
        debug_url: result?.debug_url,
        fullResponse: result
      });
    }

    // 解析历史记录数据
    const historyData = result?.data;
    let output = null;
    let isDone = false;

    // 检查执行状态和结果
    // 根据实际 API 响应，可能的状态字段：status, state, is_completed, completed 等
    if (historyData) {
      const status = historyData?.status || historyData?.state || historyData?.execution_status;
      const hasData = historyData?.data !== undefined && historyData?.data !== null;
      
      // 判断是否完成：有数据或状态为已完成
      isDone = hasData || 
               status === 'completed' || 
               status === 'success' || 
               status === 'done' ||
               status === 'succeeded' ||
               historyData?.is_completed === true;

      if (isDone && hasData) {
        const rawData = historyData.data;
        
        try {
          // 如果 data 是 JSON 字符串，解析它
          const parsed = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
          if (parsed && typeof parsed === 'object' && parsed.data) {
            output = parsed.data;
          } else if (typeof parsed === 'string') {
            output = parsed;
          } else {
            output = rawData;
          }
        } catch (e) {
          // 如果解析失败，直接使用原始数据
          output = rawData;
        }
      }
    }

    return res.status(200).json({
      status: isDone ? 'Success' : 'Running',
      output: isDone ? output : undefined,
      debug_url: result?.debug_url || historyData?.debug_url,
      execute_id: executeId,
      executionStatus: historyData?.status || historyData?.state
    });
  } catch (err) {
    console.error('check-status error:', err);
    return res.status(500).json({
      status: 'Error',
      error: err?.message || 'check-status failed',
      stack: process.env.NODE_ENV === 'development' ? err?.stack : undefined
    });
  }
};

