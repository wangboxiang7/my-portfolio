// Express app adapted for Vercel Serverless: no app.listen, export app.
const express = require('express');

const COZE_API_KEY = process.env.COZE_API_KEY || '';
const COZE_WORKFLOW_ID = process.env.COZE_WORKFLOW_ID || '';
const COZE_FILE_UPLOAD_URL = 'https://api.coze.cn/open_api/v2/file/upload';
const COZE_WORKFLOW_URL = 'https://api.coze.cn/open_api/v2/workflow/run';

const app = express();
app.use(express.json({ limit: '10mb' }));

function normalizeBase64(data) {
  if (!data) return '';
  const idx = data.indexOf('base64,');
  return idx !== -1 ? data.slice(idx + 7) : data;
}

async function uploadToCoze(buffer, filename, mime) {
  const formData = new FormData();
  const blob = new Blob([buffer], { type: mime });
  formData.append('file', blob, filename || 'upload.bin');
  formData.append('usage', 'workflow');

  const resp = await fetch(COZE_FILE_UPLOAD_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${COZE_API_KEY}` },
    body: formData
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Coze file upload failed: ${resp.status} ${text}`);
  }
  const data = await resp.json();
  const fileId = data?.data?.file_id;
  if (!fileId) throw new Error('Coze file upload missing file_id');
  return fileId;
}

app.post('/run-workflow', async (req, res) => {
  if (!COZE_API_KEY || !COZE_WORKFLOW_ID) {
    return res.status(500).json({ error: 'Missing COZE_API_KEY or COZE_WORKFLOW_ID' });
  }
  try {
    const { resumeBase64, resumeName, jdBase64, jdName } = req.body || {};
    if (!resumeBase64 || !jdBase64) {
      return res.status(400).json({ error: 'resumeBase64 and jdBase64 are required' });
    }

    const resumeBuffer = Buffer.from(normalizeBase64(resumeBase64), 'base64');
    const jdBuffer = Buffer.from(normalizeBase64(jdBase64), 'base64');

    const resumeFileId = await uploadToCoze(resumeBuffer, resumeName || 'resume.pdf', 'application/pdf');
    const jdFileId = await uploadToCoze(jdBuffer, jdName || 'jd.jpg', 'image/jpeg');

    const wfResp = await fetch(COZE_WORKFLOW_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${COZE_API_KEY}`
      },
      body: JSON.stringify({
        workflow_id: COZE_WORKFLOW_ID,
        parameters: {
          file: JSON.stringify({ file_id: resumeFileId }),
          jd: JSON.stringify({ file_id: jdFileId }),
          content: '输出内容'
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
});

// Export app for Vercel
module.exports = app;


