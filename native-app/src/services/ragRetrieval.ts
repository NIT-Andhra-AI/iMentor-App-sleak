interface TrieNode {
  children: { [char: string]: TrieNode };
  postings: { [chunkId: number]: number }; // chunkId -> term frequency in chunk
  docFrequency: number;                   // Number of chunks containing this word
}

class TrieNodeImpl implements TrieNode {
  children: { [char: string]: TrieNode } = {};
  postings: { [chunkId: number]: number } = {};
  docFrequency = 0;
}

export class TrieIndex {
  root: TrieNode = new TrieNodeImpl();

  insert(word: string, chunkId: number): void {
    let current = this.root;
    for (let i = 0; i < word.length; i++) {
      const char = word[i];
      if (!current.children[char]) {
        current.children[char] = new TrieNodeImpl();
      }
      current = current.children[char];
    }
    
    if (current.postings[chunkId] === undefined) {
      current.postings[chunkId] = 1;
      current.docFrequency += 1;
    } else {
      current.postings[chunkId] += 1;
    }
  }

  search(word: string): { postings: { [chunkId: number]: number }; docFrequency: number } | null {
    let current = this.root;
    for (let i = 0; i < word.length; i++) {
      const char = word[i];
      if (!current.children[char]) {
        return null;
      }
      current = current.children[char];
    }
    return {
      postings: current.postings,
      docFrequency: current.docFrequency
    };
  }
}

export interface ChunkMetadata {
  id: number;
  text: string;
  wordCount: number;
}

const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'could', 'did', 'do', 'does', 'doing', 'down', 'during',
  'each', 'few', 'for', 'from', 'further',
  'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'him', 'himself', 'his', 'how',
  'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself',
  'me', 'more', 'most', 'my', 'myself',
  'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
  'same', 'she', 'should', 'so', 'some', 'such',
  'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too',
  'under', 'until', 'up', 'very',
  'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'would',
  'you', 'your', 'yours', 'yourself', 'yourselves'
]);

function stem(word: string): string {
  let w = word.trim().toLowerCase();
  if (w.length <= 3) return w;

  // Simple Step 1a: Plural removal
  if (w.endsWith('sses')) {
    w = w.slice(0, -2);
  } else if (w.endsWith('ies')) {
    w = w.slice(0, -3) + 'i';
  } else if (w.endsWith('ss')) {
    // Keep ss (class -> class)
  } else if (w.endsWith('s') && !w.endsWith('us') && !w.endsWith('is') && !w.endsWith('as')) {
    w = w.slice(0, -1);
  }

  // Simple Step 1b: Suffix removal
  if (w.endsWith('eed')) {
    w = w.slice(0, -1);
  } else if (w.endsWith('ing') && w.length > 5) {
    w = w.slice(0, -3);
    if (w.endsWith('bb') || w.endsWith('dd') || w.endsWith('ff') || w.endsWith('gg') || w.endsWith('mm') || w.endsWith('nn') || w.endsWith('pp') || w.endsWith('rr') || w.endsWith('tt')) {
      w = w.slice(0, -1);
    }
  } else if (w.endsWith('ed') && w.length > 4) {
    w = w.slice(0, -2);
    if (w.endsWith('bb') || w.endsWith('dd') || w.endsWith('ff') || w.endsWith('gg') || w.endsWith('mm') || w.endsWith('nn') || w.endsWith('pp') || w.endsWith('rr') || w.endsWith('tt')) {
      w = w.slice(0, -1);
    }
  }

  // Common derivational suffixes
  if (w.endsWith('ly')) {
    w = w.slice(0, -2);
  }
  if (w.endsWith('ment') && w.length > 6) {
    w = w.slice(0, -4);
  }
  if (w.endsWith('tion') && w.length > 6) {
    w = w.slice(0, -4) + 't';
  }

  return w;
}

export function tokenizeAndStem(text: string): string[] {
  if (!text) return [];
  const cleanText = text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ');
  const tokens = cleanText.split(/[\s-]+/);
  const result: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const trimmed = tokens[i].trim();
    if (trimmed.length > 1 && !STOPWORDS.has(trimmed)) {
      result.push(stem(trimmed));
    }
  }

  return result;
}

export function chunkDocument(text: string, chunkSize = 250, overlap = 50): ChunkMetadata[] {
  if (!text) return [];
  const words = text.trim().split(/\s+/);
  if (words.length <= chunkSize) {
    return [{ id: 0, text, wordCount: words.length }];
  }

  const chunks: ChunkMetadata[] = [];
  let i = 0;
  let chunkId = 0;
  while (i < words.length) {
    const chunkWords = words.slice(i, i + chunkSize);
    chunks.push({
      id: chunkId++,
      text: chunkWords.join(' '),
      wordCount: chunkWords.length
    });
    i += (chunkSize - overlap);
  }
  return chunks;
}

export interface BM25Params {
  k1?: number;
  b?: number;
}

export function scoreBM25(
  queryTerms: string[],
  trie: TrieIndex,
  chunks: ChunkMetadata[],
  avgChunkLength: number,
  params: BM25Params = {}
): { chunkId: number; score: number }[] {
  const k1 = params.k1 ?? 1.2;
  const b = params.b ?? 0.75;
  const N = chunks.length;

  const scores: { [chunkId: number]: number } = {};

  for (let i = 0; i < queryTerms.length; i++) {
    const term = queryTerms[i];
    const searchResult = trie.search(term);
    if (!searchResult) continue;

    const { postings, docFrequency } = searchResult;
    if (docFrequency === 0) continue;

    // Calculate IDF
    const idf = Math.log(1 + (N - docFrequency + 0.5) / (docFrequency + 0.5));

    for (const chunkIdStr in postings) {
      const chunkId = parseInt(chunkIdStr, 10);
      const tf = postings[chunkId];
      const chunk = chunks[chunkId];
      if (!chunk) continue;

      const dl = chunk.wordCount;
      const numerator = tf * (k1 + 1);
      const denominator = tf + k1 * (1 - b + b * (dl / (avgChunkLength || 1)));

      const termScore = idf * (numerator / denominator);
      scores[chunkId] = (scores[chunkId] ?? 0) + termScore;
    }
  }

  return Object.keys(scores).map(chunkIdStr => {
    const chunkId = parseInt(chunkIdStr, 10);
    return { chunkId, score: scores[chunkId] };
  });
}

class RagRetrievalService {
  private cachedTrie: TrieIndex | null = null;
  private cachedChunks: ChunkMetadata[] = [];
  private avgChunkLength = 0;
  private queryCache: Map<string, string> = new Map();
  private maxCacheSize = 50;

  indexDocument(docText: string): void {
    this.clearCache();
    if (!docText) return;

    // 1. Chunk document
    this.cachedChunks = chunkDocument(docText, 250, 50);
    if (this.cachedChunks.length === 0) return;

    // 2. Compute lengths
    let totalLength = 0;
    for (let i = 0; i < this.cachedChunks.length; i++) {
      totalLength += this.cachedChunks[i].wordCount;
    }
    this.avgChunkLength = totalLength / this.cachedChunks.length;

    // 3. Build Trie Index
    this.cachedTrie = new TrieIndex();
    for (let i = 0; i < this.cachedChunks.length; i++) {
      const chunk = this.cachedChunks[i];
      const words = tokenizeAndStem(chunk.text);
      for (let j = 0; j < words.length; j++) {
        this.cachedTrie.insert(words[j], chunk.id);
      }
    }
    console.log("Implemented Trie");
  }

  retrieveContext(query: string, maxCharacters = 3000): string {
    if (!this.cachedTrie || this.cachedChunks.length === 0) {
      return '';
    }

    const normalizedQuery = query.trim().toLowerCase();
    // Check query cache
    if (this.queryCache.has(normalizedQuery)) {
      return this.queryCache.get(normalizedQuery)!;
    }

    // Tokenize and stem query
    const queryTerms = tokenizeAndStem(query);
    let retrievedContext = '';

    if (queryTerms.length === 0) {
      // Fallback: Return first few chunks up to maxCharacters
      let combined = '';
      for (let i = 0; i < Math.min(3, this.cachedChunks.length); i++) {
        combined += this.cachedChunks[i].text + '\n\n';
      }
      retrievedContext = combined.slice(0, maxCharacters).trim();
    } else {
      // Score candidates
      const rankedScores = scoreBM25(queryTerms, this.cachedTrie, this.cachedChunks, this.avgChunkLength);

      if (rankedScores.length === 0) {
        // Fallback: Return first few chunks up to maxCharacters
        let combined = '';
        for (let i = 0; i < Math.min(3, this.cachedChunks.length); i++) {
          combined += this.cachedChunks[i].text + '\n\n';
        }
        retrievedContext = combined.slice(0, maxCharacters).trim();
      } else {
        // Sort by score descending
        rankedScores.sort((a, b) => b.score - a.score);

        // Retrieve chunks until character limit is reached
        let combinedText = '';
        for (let i = 0; i < rankedScores.length; i++) {
          const chunk = this.cachedChunks[rankedScores[i].chunkId];
          if (!chunk) continue;
          if (combinedText.length + chunk.text.length > maxCharacters) {
            // Keep at least one chunk even if it exceeds maxCharacters
            if (combinedText.length === 0) {
              combinedText += chunk.text.slice(0, maxCharacters);
            }
            break;
          }
          combinedText += chunk.text + '\n\n';
        }
        retrievedContext = combinedText.trim();
      }
    }

    // Add to LRU cache
    if (this.queryCache.size >= this.maxCacheSize) {
      const firstKey = this.queryCache.keys().next().value;
      if (firstKey !== undefined) this.queryCache.delete(firstKey);
    }
    this.queryCache.set(normalizedQuery, retrievedContext);

    return retrievedContext;
  }

  clearCache(): void {
    this.cachedTrie = null;
    this.cachedChunks = [];
    this.avgChunkLength = 0;
    this.queryCache.clear();
  }
}

export const ragRetrievalService = new RagRetrievalService();
