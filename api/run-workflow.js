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

    // 根据文档：文件参数需要字符串化的 JSON，格式："{\"file_id\":\"...\"}"
    // ⚠️ 重要：参数名（file, jd）必须与你的 workflow 定义中的参数名完全一致
    // 请在你的 workflow 编排页面确认参数名
    const workflowBody = {
      workflow_id: workflowId,
      parameters: {
        // 如果 workflow 参数名是 "file" 或 "resume"
        file: JSON.stringify({ file_id: resumeFileId }),
        // 如果 workflow 参数名是 "jd" 或 "job_description" 或 "jd_image"
        jd: JSON.stringify({ file_id: jdFileId }),
        // content 参数（如果 workflow 需要）
        content: content || '生成简历与 JD 的匹配度分析报告'
      }
    };
    
    console.log('Workflow request body:', JSON.stringify(workflowBody, null, 2));

    const wfResp = await fetch('https://api.coze.cn/open_api/v2/workflow/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(workflowBody)
    });

    // 先获取响应文本，确保能看到完整错误
    const responseText = await wfResp.text();
    console.log('Workflow response status:', wfResp.status);
    console.log('Workflow response:', responseText);

    let wfData;
    try {
      wfData = JSON.parse(responseText);
    } catch (e) {
      console.error('Failed to parse workflow response:', e);
      return res.status(500).json({ 
        error: 'Invalid JSON response from workflow API',
        rawResponse: responseText.substring(0, 500)
      });
    }
    
    if (!wfResp.ok || wfData?.code !== 0) {
      console.error('Workflow API error:', {
        status: wfResp.status,
        code: wfData?.code,
        msg: wfData?.msg,
        debug_url: wfData?.debug_url,
        fullResponse: wfData
      });
      return res.status(wfResp.status || 500).json({ 
        error: wfData?.msg || 'Workflow call failed',
        code: wfData?.code,
        debug_url: wfData?.debug_url,
        fullResponse: wfData
      });
    }

    const output = wfData?.data?.output_text || wfData?.data?.output || JSON.stringify(wfData?.data || {});
    console.log('Workflow success, output:', output);
    return res.status(200).json({ output });
  } catch (err) {
    console.error('run-workflow error', err);
    return res.status(500).json({ error: err?.message || 'Internal Server Error' });
  }
};

