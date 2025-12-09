// Vercel Serverless API: /api/run-workflow
// Upload resume (PDF) and JD (image) to Coze via /v1/files/upload, then run workflow.

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
        Buffer.from(`\r\n--${boundary}\r\n`, 'utf8'),
        Buffer.from('Content-Disposition: form-data; name="usage"\r\n\r\n', 'utf8'),
        Buffer.from('workflow', 'utf8'),
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
        throw new Error(`Upload failed: ${resp.status} ${text}`);
      }
      const data = await resp.json();
      const fileId = data?.data?.file_id;
      if (!fileId) throw new Error('Upload missing file_id');
      return fileId;
    };

    const resumeFileId = await uploadFile(resumeBase64, resumeName || 'resume.pdf', 'application/pdf');
    const jdFileId = await uploadFile(jdBase64, jdName || 'jd.jpg', 'image/jpeg');

    const wfResp = await fetch('https://api.coze.cn/open_api/v2/workflow/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 注意：文档要求 Bearer 开头，所以这里要拼凑一下
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        workflow_id: workflowId,
        parameters: {
          file: JSON.stringify({ file_id: resumeFileId }),
          jd: JSON.stringify({ file_id: jdFileId }),
          content: content || '生成简历与 JD 的匹配度分析报告'
        }
      })
    });

    const wfData = await wfResp.json().catch(() => ({}));
    if (!wfResp.ok) {
      return res.status(wfResp.status).json({ error: wfData?.msg || 'Workflow call failed', debug_url: wfData?.debug_url });
    }

    const output = wfData?.data?.output_text || wfData?.data?.output || JSON.stringify(wfData?.data || {});
    return res.status(200).json({ output });
  } catch (err) {
    console.error('run-workflow error', err);
    return res.status(500).json({ error: err?.message || 'Internal Server Error' });
  }
};

