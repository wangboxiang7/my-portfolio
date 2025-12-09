const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const Tesseract = require('tesseract.js');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const upload = multer();

app.post('/api/run-workflow', upload.fields([
  { name: 'resume', maxCount: 1 },
  { name: 'jd', maxCount: 1 }
]), async (req, res) => {
  try {
    const resumeFile = req.files?.resume?.[0];
    const jdFile = req.files?.jd?.[0];

    if (!resumeFile || !jdFile) {
      return res.status(400).json({ error: 'resume (PDF) 和 jd (image) 必填' });
    }

    const resumeBuffer = resumeFile.buffer;
    const jdBuffer = jdFile.buffer;

    // Step 2: PDF -> text
    const resumeText = (await pdfParse(resumeBuffer)).text || '';

    // Step 3: OCR image -> text
    const { data: { text: jdTextRaw } } = await Tesseract.recognize(jdBuffer, 'chi_sim+eng');
    const jdText = jdTextRaw?.trim() || '';

    // Step 4: call Coze Workflow API
    const response = await fetch('https://api.coze.cn/open_api/v2/workflow/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.COZE_API_KEY || ''}`
      },
      body: JSON.stringify({
        workflow_id: process.env.COZE_WORKFLOW_ID,
        parameters: { jd: jdText, resume: resumeText }
      })
    });

    const result = await response.json().catch(() => ({}));
    return res.status(200).json({
      output: result?.data?.output_text || 'No output.'
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'workflow failed', detail: err?.message });
  }
});

// Static hosting for the existing front-end
app.use(express.static('.'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});


