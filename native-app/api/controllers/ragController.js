const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const pdfParse = require('pdf-parse');
const { v4: uuidv4 } = require('uuid');

exports.uploadAndProcessPdf = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded.' });
    }

    const fileId = uuidv4();
    const tempDir = path.join(__dirname, '../temp');
    const uploadsDir = path.join(__dirname, '../uploads/rag', fileId);

    // Ensure temp and uploads directories exist
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const tempPdfPath = path.join(tempDir, `${fileId}.pdf`);

    // Write temp PDF file to disk for image extraction CLI
    fs.writeFileSync(tempPdfPath, req.file.buffer);

    // 1. Parse text using pdf-parse
    let pdfData;
    try {
      pdfData = await pdfParse(req.file.buffer);
    } catch (parseError) {
      console.error('Error parsing PDF text:', parseError);
      // Clean up temp file
      if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath);
      return res.status(500).json({ error: 'Failed to parse PDF text.' });
    }

    // 2. Extract embedded images using pdf-export-images
    // Run npx pdf-export-images tempPdfPath uploadsDir
    exec(`npx pdf-export-images "${tempPdfPath}" "${uploadsDir}"`, (error, stdout, stderr) => {
      // Clean up temp PDF file
      if (fs.existsSync(tempPdfPath)) {
        try {
          fs.unlinkSync(tempPdfPath);
        } catch (cleanupErr) {
          console.error('Failed to delete temp PDF:', cleanupErr);
        }
      }

      if (error) {
        console.error('Error extracting images:', error, stderr);
        // Note: Even if image extraction fails, we can still return the text contents
        return res.status(200).json({
          success: true,
          fileId,
          text: pdfData.text || '',
          images: [],
          warning: 'Text extracted, but image extraction failed.'
        });
      }

      // Read output directory to find extracted images
      let images = [];
      try {
        if (fs.existsSync(uploadsDir)) {
          const files = fs.readdirSync(uploadsDir);
          images = files
            .filter(file => /\.(png|jpe?g|gif|webp)$/i.test(file))
            .map(file => `/uploads/rag/${fileId}/${file}`);
        }
      } catch (readErr) {
        console.error('Error reading extracted images directory:', readErr);
      }

      return res.status(200).json({
        success: true,
        fileId,
        text: pdfData.text || '',
        images
      });
    });

  } catch (err) {
    console.error('RAG PDF processing failed:', err);
    return res.status(500).json({ error: 'An unexpected error occurred during PDF processing.' });
  }
};
