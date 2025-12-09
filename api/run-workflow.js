// Vercel Serverless API: /api/run-workflow
// Upload resume (PDF) and JD (image) to Coze via /v1/files/upload, then run workflow.

const { CozeAPI } = require('@coze/api');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 代码里的名字必须和 Vercel 里的 Key 完全一致
  const token = process.env.COZE_API_TOKEN;
  const workflowId = process.env.COZE_WORKFLOW_ID;

  if (!token || !workflowId) {
    return res.status(500).json({ error: 'Missing COZE_API_TOKEN or COZE_WORKFLOW_ID' });
  }

  try {
    const { resumeBase64, resumeName, jdBase64, jdName, content } = req.body || {};
    if (!resumeBase64 || !jdBase64) {
      return res.status(400).json({ error: 'resumeBase64 and jdBase64 are required' });
    }

    const normalizeBase64 = (data) => {
      if (!data) return '';
      const idx = data.indexOf('base64,');
      return idx !== -1 ? data.slice(idx + 7) : data;
    };

    const uploadFile = async (base64, filename, mime) => {
      const buffer = Buffer.from(normalizeBase64(base64), 'base64');
      
      // 构造 multipart/form-data (Node.js 兼容，不使用浏览器 FormData/Blob)
      const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2, 15);
      const parts = [
        Buffer.from(`--${boundary}\r\n`, 'utf8'),
        Buffer.from(`Content-Disposition: form-data; name="file"; filename="${filename || 'upload.bin'}"\r\n`, 'utf8'),
        Buffer.from(`Content-Type: ${mime}\r\n\r\n`, 'utf8'),
        buffer,
        // 注意：文档中没有提到 usage 参数，如果 workflow 需要，可能需要单独设置
        // 先注释掉，如果 API 报错再添加回来
        // Buffer.from(`\r\n--${boundary}\r\n`, 'utf8'),
        // Buffer.from('Content-Disposition: form-data; name="usage"\r\n\r\n', 'utf8'),
        // Buffer.from('workflow', 'utf8'),
        Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')
      ];
      
      const body = Buffer.concat(parts);

      const resp = await fetch('https://api.coze.cn/v1/files/upload', {
        method: 'POST',
        headers: {
          // 注意：文档要求 Bearer 开头，所以这里要拼凑一下
          'Authorization': `Bearer ${token}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`
        },
        body: body
      });
      
      if (!resp.ok) {
        const text = await resp.text();
        console.error(`Upload failed (${resp.status}):`, text);
        throw new Error(`Upload failed: ${resp.status} ${text}`);
      }
      
      const data = await resp.json();
      
      // 🔍 根据文档，响应格式是：{ code: 0, data: { id: "...", ... }, msg: "" }
      // 所以应该使用 data.data.id 而不是 data.data.file_id
      const fileId = data?.data?.id;
      
      if (!fileId) {
        console.error('Upload response missing id. Full response:', JSON.stringify(data, null, 2));
        throw new Error(`Upload missing id. Response: ${JSON.stringify(data)}`);
      }
      
      return fileId;
    };

    const resumeFileId = await uploadFile(resumeBase64, resumeName || 'resume.pdf', 'application/pdf');
    const jdFileId = await uploadFile(jdBase64, jdName || 'jd.jpg', 'image/jpeg');

    console.log('Uploaded files - resume ID:', resumeFileId, 'jd ID:', jdFileId);

    // 使用 @coze/api SDK
    const apiClient = new CozeAPI({
      token: token,
      baseURL: 'https://api.coze.cn'
    });

    try {
      const wfData = await apiClient.workflows.runs.create({
        workflow_id: workflowId,
        parameters: {
          file: JSON.stringify({ file_id: resumeFileId }),
          jd: JSON.stringify({ file_id: jdFileId }),
          content: content || '生成简历与 JD 的匹配度分析报告'
        }
      });

      console.log('Workflow response:', JSON.stringify(wfData, null, 2));
      
      // 立即返回 execute_id，不等待 workflow 完成
      // 因为 workflow 可能需要很长时间（超过 Vercel 的 60 秒限制）
      if (wfData?.code === 0) {
        return res.status(200).json({
          execute_id: wfData?.execute_id,
          debug_url: wfData?.debug_url,
          message: 'Workflow 已启动，正在处理中...',
          note: '由于处理时间较长，请通过 debug_url 查看进度，或稍后刷新页面查看结果'
        });
      } else {
        return res.status(500).json({
          error: wfData?.msg || 'Workflow execution failed',
          code: wfData?.code,
          debug_url: wfData?.debug_url
        });
      }
    } catch (err) {
      console.error('Workflow API error:', err);
      return res.status(500).json({
        error: err?.message || 'Workflow call failed',
        details: err?.response?.data || err
      });
    }
  } catch (err) {
    console.error('run-workflow error', err);
    return res.status(500).json({ error: err?.message || 'Internal Server Error' });
  }
};

