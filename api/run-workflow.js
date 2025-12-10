// Upload resume (PDF) and JD (image) to Coze via /v1/files/upload, then run workflow. Express router version.
const express = require('express');
const { CozeAPI } = require('@coze/api');

const router = express.Router();

router.post('/', async (req, res) => {
  const token = process.env.COZE_API_TOKEN;
  const workflowId = process.env.COZE_WORKFLOW_ID;

  if (!token || !workflowId) {
    return res.status(500).json({ error: 'Missing COZE_API_TOKEN or COZE_WORKFLOW_ID' });
  }

  try {
    const {
      resumeBase64,
      resumeName,
      resumeMime,
      jdBase64,
      jdName,
      jdMime,
      content
    } = req.body || {};
    if (!resumeBase64 || !jdBase64) {
      return res.status(400).json({ error: 'resumeBase64 and jdBase64 are required' });
    }

    const detectMimeFromDataUrl = (data) => {
      if (!data) return null;
      const match = data.match(/^data:(.+?);base64,/);
      return match?.[1] || null;
    };

    const normalizeBase64 = (data) => {
      if (!data) return '';
      const idx = data.indexOf('base64,');
      return idx !== -1 ? data.slice(idx + 7) : data;
    };

    const uploadFile = async (base64, filename, mime) => {
      const safeMime = mime || detectMimeFromDataUrl(base64) || 'application/octet-stream';
      const buffer = Buffer.from(normalizeBase64(base64), 'base64');
      
      const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2, 15);
      const parts = [
        Buffer.from(`--${boundary}\r\n`, 'utf8'),
        Buffer.from(`Content-Disposition: form-data; name="file"; filename="${filename || 'upload.bin'}"\r\n`, 'utf8'),
        Buffer.from(`Content-Type: ${safeMime}\r\n\r\n`, 'utf8'),
        buffer,
        Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')
      ];
      
      const body = Buffer.concat(parts);

      const resp = await fetch('https://api.coze.cn/v1/files/upload', {
        method: 'POST',
        headers: {
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
      const fileId = data?.data?.id;
      
      if (!fileId) {
        console.error('Upload response missing id. Full response:', JSON.stringify(data, null, 2));
        throw new Error(`Upload missing id. Response: ${JSON.stringify(data)}`);
      }
      
      return fileId;
    };

    const resumeFileId = await uploadFile(
      resumeBase64,
      resumeName || 'resume.pdf',
      resumeMime || 'application/pdf'
    );
    const jdFileId = await uploadFile(
      jdBase64,
      jdName || 'jd.jpg',
      jdMime || 'image/jpeg'
    );

    console.log('Uploaded files - resume ID:', resumeFileId, 'jd ID:', jdFileId);

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
      
      if (wfData?.code === 0) {
        const hasCompletedData = wfData?.data && typeof wfData.data === 'string' && wfData.data.trim() !== '';
        
        if (hasCompletedData) {
          try {
            const parsedData = JSON.parse(wfData.data);
            const output = parsedData?.data || wfData.data;
            console.log('Workflow completed immediately, returning output');
            return res.status(200).json({
              status: 'Success',
              output: output,
              execute_id: wfData?.execute_id,
              debug_url: wfData?.debug_url
            });
          } catch (parseErr) {
            console.warn('Failed to parse immediate result, falling back to polling:', parseErr);
            return res.status(200).json({
              status: 'Started',
              execute_id: wfData?.execute_id,
              debug_url: wfData?.debug_url,
              message: 'Workflow 已启动，正在处理中...'
            });
          }
        } else {
          return res.status(200).json({
            status: 'Started',
            execute_id: wfData?.execute_id,
            debug_url: wfData?.debug_url,
            message: 'Workflow 已启动，正在处理中...'
          });
        }
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
});

module.exports = router;


