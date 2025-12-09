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
      
      // 检查 workflow 执行是否成功
      if (wfData?.code === 0 && wfData?.data) {
        try {
          // wfData.data 是一个 JSON 字符串，需要解析
          const parsedData = JSON.parse(wfData.data);
          // 从解析后的对象中提取 data 字段，这就是实际的分析结果
          const output = parsedData.data || wfData.data;
          console.log('Workflow output:', output);
          return res.status(200).json({ output });
        } catch (parseErr) {
          // 如果解析失败，使用原始字符串
          console.warn('Failed to parse workflow data, using raw string:', parseErr);
          return res.status(200).json({ output: wfData.data });
        }
      } else {
        // workflow 执行失败
        console.error('Workflow execution failed:', {
          code: wfData?.code,
          msg: wfData?.msg,
          debug_url: wfData?.debug_url
        });
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

