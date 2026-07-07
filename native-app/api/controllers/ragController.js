const pdfParse = require('pdf-parse');
const { v4: uuidv4 } = require('uuid');
const RagDocument = require('../models/RagDocument');
const RagMessage = require('../models/RagMessage');

// Helper function to deduplicate text at sentence level and line level
function deduplicateText(text) {
  if (!text) return '';
  
  // Normalize line endings and multiple spaces
  let normalized = text.replace(/\r\n/g, '\n').replace(/ {2,}/g, ' ');
  
  // Split into paragraphs
  const paragraphs = normalized.split(/\n\s*\n/);
  const uniqueParagraphs = [];
  const seenSentences = new Set();
  
  for (const para of paragraphs) {
    if (!para.trim()) continue;
    
    // Split paragraph into sentences
    // This splits on spaces following a period, exclamation mark, or question mark
    const sentences = para.split(/(?<=[.!?])\s+/);
    const uniqueSentences = [];
    
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;
      
      // Normalize sentence for comparison (lowercase, alphanumeric only)
      const normSentence = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      // Only filter duplicates for sentences with content length > 15
      if (normSentence.length > 15) {
        if (seenSentences.has(normSentence)) {
          continue; // Skip duplicate sentence
        }
        seenSentences.add(normSentence);
      }
      uniqueSentences.push(trimmed);
    }
    
    if (uniqueSentences.length > 0) {
      uniqueParagraphs.push(uniqueSentences.join(' '));
    }
  }
  
  return uniqueParagraphs.join('\n\n');
}

/**
 * Uploads a PDF, parses and deduplicates its text, saves it to MongoDB,
 * and returns the saved document metadata & markdown.
 */
exports.uploadAndProcessPdf = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded.' });
    }

    const userId = req.user.id;
    const fileId = uuidv4();

    // 1. Parse text using pdf-parse
    let pdfData;
    try {
      pdfData = await pdfParse(req.file.buffer);
    } catch (parseError) {
      console.error('Error parsing PDF text:', parseError);
      return res.status(500).json({ error: 'Failed to parse PDF text.' });
    }

    const rawText = pdfData.text || '';
    
    // 2. Deduplicate text (consecutive lines and duplicated sentences)
    const cleanedText = deduplicateText(rawText);

    // 3. Compile Markdown representation
    const fileName = req.file.originalname || 'document.pdf';
    let markdownDoc = `# Document Analysis: ${fileName}\n\n`;
    markdownDoc += `## Extracted Text Content\n\n${cleanedText}\n\n`;

    // 4. Save to Database
    const newDoc = new RagDocument({
      userId,
      fileName,
      fileId,
      text: cleanedText,
      markdownDoc
    });

    await newDoc.save();

    return res.status(200).json({
      success: true,
      document: {
        id: newDoc._id,
        fileName: newDoc.fileName,
        fileId: newDoc.fileId,
        markdownDoc: newDoc.markdownDoc,
        createdAt: newDoc.createdAt
      }
    });

  } catch (err) {
    console.error('RAG PDF processing failed:', err);
    return res.status(500).json({ error: 'An unexpected error occurred during PDF processing.' });
  }
};

/**
 * Get all RAG documents uploaded by the user (omits full text to keep response light)
 */
exports.getDocuments = async (req, res) => {
  try {
    const userId = req.user.id;
    const documents = await RagDocument.find({ userId })
      .sort({ createdAt: -1 })
      .select('-text -markdownDoc');
    res.status(200).json(documents);
  } catch (error) {
    console.error('Error fetching RAG documents:', error);
    res.status(500).json({ error: 'Server error fetching RAG documents.' });
  }
};

/**
 * Deletes a RAG document and its associated messages
 */
exports.deleteDocument = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const doc = await RagDocument.findOne({ _id: id, userId });
    if (!doc) {
      return res.status(404).json({ error: 'Document not found or unauthorized.' });
    }

    // Delete associated RAG messages
    await RagMessage.deleteMany({ documentId: id });
    await RagDocument.deleteOne({ _id: id });

    res.status(200).json({ message: 'Document and its chat history deleted successfully.' });
  } catch (error) {
    console.error('Error deleting RAG document:', error);
    res.status(500).json({ error: 'Server error deleting RAG document.' });
  }
};

/**
 * Gets message history for a specific RAG document
 */
exports.getMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const doc = await RagDocument.findOne({ _id: id, userId });
    if (!doc) {
      return res.status(404).json({ error: 'Document not found or unauthorized.' });
    }

    const messages = await RagMessage.find({ documentId: id }).sort({ createdAt: 1 });
    
    res.status(200).json({
      messages,
      markdownDoc: doc.markdownDoc,
      fileName: doc.fileName
    });
  } catch (error) {
    console.error('Error fetching RAG messages:', error);
    res.status(500).json({ error: 'Server error fetching RAG messages.' });
  }
};

/**
 * Adds a new message (user or assistant) for a RAG document conversation
 */
exports.addMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { role, content } = req.body;

    if (!role || !content) {
      return res.status(400).json({ error: 'Role and content are required.' });
    }

    const doc = await RagDocument.findOne({ _id: id, userId });
    if (!doc) {
      return res.status(404).json({ error: 'Document not found or unauthorized.' });
    }

    const newMessage = new RagMessage({
      userId,
      documentId: id,
      role,
      content
    });

    await newMessage.save();
    res.status(201).json(newMessage);
  } catch (error) {
    console.error('Error adding RAG message:', error);
    res.status(500).json({ error: 'Server error adding RAG message.' });
  }
};
