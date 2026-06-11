use std::collections::HashMap;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use tantivy::collector::TopDocs;
use tantivy::query::QueryParser;
use tantivy::schema::{
    Field, IndexRecordOption, Schema, TextFieldIndexing, TextOptions, STORED, STRING,
};
use tantivy::{doc, Index, IndexReader, ReloadPolicy};
use tracing::{debug, info, warn};

use crate::loader::find_wiki_pages;
use crate::page::WikiPage;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// A single BM25 search result.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WikiSearchResult {
    /// The matching wiki page (full data, including content).
    pub page: WikiPage,
    /// BM25 relevance score as returned by tantivy.
    pub score: f32,
}

/// In-memory BM25 full-text search engine backed by tantivy.
///
/// The index is built from all `.md` files found under `wiki_dir` at
/// construction time.  No data is written to disk.
pub struct WikiEngine {
    index: Index,
    reader: IndexReader,
    #[allow(dead_code)]
    schema: Schema,

    // Field handles kept for query building and document extraction.
    #[allow(dead_code)]
    title_field: Field,
    body_field: Field,
    file_name_field: Field,

    /// Root of the wiki directory tree (reserved for loading pages on demand).
    #[allow(dead_code)]
    wiki_root: PathBuf,

    /// In-memory cache of all loaded pages, keyed by relative file name.
    pages: HashMap<String, WikiPage>,
}

impl WikiEngine {
    /// Build the search engine from all Markdown files under `wiki_dir`.
    ///
    /// The tantivy index is kept in RAM (`Index::create_in_ram`), so this
    /// method rebuilds the full index every time the application starts.
    pub fn new(wiki_dir: &Path) -> Result<Self> {
        info!(dir = %wiki_dir.display(), "Building wiki search index");

        // -----------------------------------------------------------------
        // 1. Build schema
        // -----------------------------------------------------------------
        let mut schema_builder = Schema::builder();

        // Title: indexed with BM25, stored so we can recover it in results.
        let text_options_indexed_stored = TextOptions::default()
            .set_indexing_options(
                TextFieldIndexing::default()
                    .set_tokenizer("en_stem")
                    .set_index_option(IndexRecordOption::WithFreqsAndPositions),
            )
            .set_stored();

        let title_field = schema_builder.add_text_field("title", text_options_indexed_stored.clone());
        let body_field = schema_builder.add_text_field("body", text_options_indexed_stored);

        // file_name: not tokenised — stored as an opaque STRING for retrieval.
        let file_name_field = schema_builder.add_text_field("file_name", STRING | STORED);

        let schema = schema_builder.build();

        // -----------------------------------------------------------------
        // 2. Create in-RAM index and writer
        // -----------------------------------------------------------------
        let index = Index::create_in_ram(schema.clone());

        // 50 MB write buffer is more than enough for typical wiki corpora.
        let mut writer = index
            .writer(50_000_000)
            .context("Failed to create tantivy index writer")?;

        // -----------------------------------------------------------------
        // 3. Discover, load, and index all wiki pages
        // -----------------------------------------------------------------
        let md_paths = find_wiki_pages(wiki_dir)
            .context("Failed to enumerate wiki Markdown files")?;

        info!(file_count = md_paths.len(), "Discovered wiki Markdown files");

        let mut pages: HashMap<String, WikiPage> = HashMap::with_capacity(md_paths.len());

        // Use canonicalized wiki_dir for consistent path stripping
        let wiki_root_canonical = wiki_dir
            .canonicalize()
            .unwrap_or_else(|_| wiki_dir.to_path_buf());

        for path in &md_paths {
            match WikiPage::from_file(&wiki_root_canonical, path) {
                Ok(page) => {
                    debug!(
                        file = %page.file_name,
                        title = %page.title,
                        words = page.word_count,
                        "Indexing wiki page"
                    );

                    writer.add_document(doc!(
                        title_field    => page.title.clone(),
                        body_field     => page.plain_text.clone(),
                        file_name_field => page.file_name.clone(),
                    ))?;

                    pages.insert(page.file_name.clone(), page);
                }
                Err(e) => {
                    warn!(path = %path.display(), error = %e, "Skipping unreadable wiki file");
                }
            }
        }

        writer.commit().context("Failed to commit tantivy index")?;

        // -----------------------------------------------------------------
        // 4. Open a reader that always sees the latest committed segment
        // -----------------------------------------------------------------
        let reader = index
            .reader_builder()
            .reload_policy(ReloadPolicy::OnCommitWithDelay)
            .try_into()
            .context("Failed to open tantivy index reader")?;

        info!(page_count = pages.len(), "Wiki search index ready");

        Ok(Self {
            index,
            reader,
            schema,
            title_field,
            body_field,
            file_name_field,
            wiki_root: wiki_dir.to_path_buf(),
            pages,
        })
    }

    // -----------------------------------------------------------------------
    // Search
    // -----------------------------------------------------------------------

    /// Run a BM25 query against the indexed wiki content.
    ///
    /// Returns up to `top_k` results in descending score order.  Each result
    /// contains a clone of the full `WikiPage` (including raw content).
    pub fn search(&self, query: &str, top_k: usize) -> Result<Vec<WikiSearchResult>> {
        if query.trim().is_empty() {
            return Ok(Vec::new());
        }

        let searcher = self.reader.searcher();

        // Parse the query against both title and body fields.
        let query_parser = QueryParser::for_index(
            &self.index,
            vec![self.title_field, self.body_field],
        );

        // `parse_query` may fail on malformed input; fall back to an empty result
        // rather than surfacing a parse error to the caller.
        let parsed_query = match query_parser.parse_query(query) {
            Ok(q) => q,
            Err(e) => {
                warn!(query, error = %e, "Failed to parse wiki query; returning empty results");
                return Ok(Vec::new());
            }
        };

        let top_docs = searcher
            .search(&parsed_query, &TopDocs::with_limit(top_k))
            .context("tantivy search failed")?;

        let mut results: Vec<WikiSearchResult> = Vec::with_capacity(top_docs.len());

        for (score, doc_address) in top_docs {
            let retrieved: tantivy::TantivyDocument = searcher
                .doc(doc_address)
                .context("Failed to retrieve tantivy document")?;

            // Extract the file_name stored field so we can look up the page.
            let file_name = retrieved
                .get_first(self.file_name_field)
                .and_then(|v| {
                    if let tantivy::schema::OwnedValue::Str(s) = v {
                        Some(s.as_str())
                    } else {
                        None
                    }
                })
                .unwrap_or("")
                .to_owned();

            if let Some(page) = self.pages.get(&file_name) {
                results.push(WikiSearchResult {
                    page: page.clone(),
                    score,
                });
            } else {
                warn!(file_name, "Search hit references unknown page; skipping");
            }
        }

        debug!(
            query,
            result_count = results.len(),
            "Wiki search complete"
        );

        Ok(results)
    }

    // -----------------------------------------------------------------------
    // Accessors
    // -----------------------------------------------------------------------

    /// Look up a page by its relative file name (e.g. `"entities/sgd.md"`).
    pub fn get_page(&self, file_name: &str) -> Option<&WikiPage> {
        self.pages.get(file_name)
    }

    /// Total number of pages loaded into the index.
    pub fn page_count(&self) -> usize {
        self.pages.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// Helper: create a temporary wiki directory with a couple of .md files.
    fn setup_temp_wiki() -> tempfile::TempDir {
        let dir = tempfile::tempdir().expect("tempdir");
        fs::write(
            dir.path().join("intro.md"),
            "# Introduction\n\nThis is an intro to machine learning.\n",
        )
        .unwrap();
        fs::write(
            dir.path().join("sgd.md"),
            "# Stochastic Gradient Descent\n\nSGD is an optimisation algorithm.\n",
        )
        .unwrap();
        dir
    }

    #[test]
    fn test_wiki_engine_builds_and_counts() {
        let dir = setup_temp_wiki();
        let engine = WikiEngine::new(dir.path()).expect("WikiEngine::new");
        assert_eq!(engine.page_count(), 2);
    }

    #[test]
    fn test_wiki_search_returns_results() {
        let dir = setup_temp_wiki();
        let engine = WikiEngine::new(dir.path()).expect("WikiEngine::new");
        let results = engine.search("optimisation", 5).expect("search");
        assert!(!results.is_empty(), "Expected at least one result for 'optimisation'");
        assert!(results[0].page.title.contains("Gradient") || results[0].score > 0.0);
    }

    #[test]
    fn test_wiki_search_empty_query() {
        let dir = setup_temp_wiki();
        let engine = WikiEngine::new(dir.path()).expect("WikiEngine::new");
        let results = engine.search("", 5).expect("empty query search");
        assert!(results.is_empty());
    }

    #[test]
    fn test_get_page() {
        let dir = setup_temp_wiki();
        let engine = WikiEngine::new(dir.path()).expect("WikiEngine::new");
        // Debug: list all loaded pages
        assert!(engine.page_count() > 0, "No pages loaded");
        
        // Try both "intro.md" and potential variations
        let page = engine.get_page("intro.md")
            .or_else(|| {
                // If not found, it might be stored differently
                // Check if there are any pages at all and what their names are
                None
            });
        
        assert!(page.is_some(), "Could not find page with get_page('intro.md')");
        assert_eq!(page.unwrap().title, "Introduction");
    }

    // ── Realistic ML student questions ────────────────────────────────────────

    /// Build a richer wiki for ML question tests.
    fn setup_ml_wiki() -> tempfile::TempDir {
        let dir = tempfile::tempdir().expect("tempdir");

        fs::write(dir.path().join("gradient-descent.md"),
            "# Gradient Descent\n\nGradient descent is an optimisation algorithm used to minimise a loss function.\
            It updates parameters by moving in the direction opposite to the gradient.\
            The learning rate controls the step size.\n").unwrap();

        fs::write(dir.path().join("overfitting.md"),
            "# Overfitting and Underfitting\n\nOverfitting occurs when a model learns noise in the training data\
            and fails to generalise to new examples. Underfitting happens when the model is too simple.\
            Regularisation techniques such as L1 and L2 help prevent overfitting.\n").unwrap();

        fs::write(dir.path().join("bias-variance.md"),
            "# Bias-Variance Tradeoff\n\nThe bias-variance tradeoff describes the tension between\
            a model that is too simple (high bias, underfitting) versus too complex (high variance, overfitting).\
            Total error = bias squared + variance + irreducible noise.\n").unwrap();

        fs::write(dir.path().join("neural-networks.md"),
            "# Neural Networks\n\nA neural network is composed of layers of neurons.\
            Feedforward networks pass information from input to output. Backpropagation computes\
            gradients via the chain rule to train the network weights. Activation functions\
            such as ReLU and sigmoid introduce non-linearity.\n").unwrap();

        fs::write(dir.path().join("backpropagation.md"),
            "# Backpropagation\n\nBackpropagation is the algorithm for computing gradients in a neural network.\
            It applies the chain rule of calculus to propagate the error signal backwards through the layers.\
            Vanishing gradients can make training deep networks difficult.\n").unwrap();

        fs::write(dir.path().join("regularisation.md"),
            "# Regularisation\n\nRegularisation adds a penalty term to the loss function to discourage\
            overly complex models. L1 regularisation (Lasso) promotes sparsity. L2 regularisation (Ridge)\
            penalises large weights. Dropout is a regularisation technique for neural networks.\n").unwrap();

        fs::write(dir.path().join("cross-validation.md"),
            "# Cross-Validation\n\nCross-validation is a technique for evaluating model performance.\
            K-fold cross-validation splits data into k folds, trains on k-1 and validates on the remaining fold.\
            It gives a more reliable estimate of generalisation performance than a single train-test split.\n").unwrap();

        dir
    }

    #[test]
    fn test_question_gradient_descent() {
        let dir = setup_ml_wiki();
        let engine = WikiEngine::new(dir.path()).unwrap();
        let results = engine.search("what is gradient descent and how does learning rate affect it", 3).unwrap();
        assert!(!results.is_empty(), "Should find gradient descent page");
        let top = &results[0];
        assert!(
            top.page.title.to_lowercase().contains("gradient"),
            "Top result should be gradient descent, got: {}", top.page.title
        );
    }

    #[test]
    fn test_question_overfitting() {
        let dir = setup_ml_wiki();
        let engine = WikiEngine::new(dir.path()).unwrap();
        let results = engine.search("my model memorises training data but performs poorly on test set", 3).unwrap();
        assert!(!results.is_empty(), "Should find overfitting page");
        // Should retrieve overfitting or regularisation
        let titles: Vec<_> = results.iter().map(|r| r.page.title.to_lowercase()).collect();
        let relevant = titles.iter().any(|t| t.contains("overfitting") || t.contains("regularisation") || t.contains("bias"));
        assert!(relevant, "Expected overfitting/regularisation topic, got: {:?}", titles);
    }

    #[test]
    fn test_question_bias_variance() {
        let dir = setup_ml_wiki();
        let engine = WikiEngine::new(dir.path()).unwrap();
        let results = engine.search("explain bias variance tradeoff", 3).unwrap();
        assert!(!results.is_empty(), "Should find bias-variance page");
        let top_title = results[0].page.title.to_lowercase();
        assert!(
            top_title.contains("bias") || top_title.contains("variance"),
            "Top result should be bias-variance, got: {}", top_title
        );
    }

    #[test]
    fn test_question_backpropagation() {
        let dir = setup_ml_wiki();
        let engine = WikiEngine::new(dir.path()).unwrap();
        let results = engine.search("how does backpropagation compute gradients in neural networks", 3).unwrap();
        assert!(!results.is_empty());
        let titles: Vec<_> = results.iter().map(|r| r.page.title.to_lowercase()).collect();
        let relevant = titles.iter().any(|t| t.contains("backprop") || t.contains("neural"));
        assert!(relevant, "Expected backprop or neural network, got: {:?}", titles);
    }

    #[test]
    fn test_question_regularisation() {
        let dir = setup_ml_wiki();
        let engine = WikiEngine::new(dir.path()).unwrap();
        let results = engine.search("how do L1 and L2 regularisation prevent overfitting", 3).unwrap();
        assert!(!results.is_empty());
        let top_title = results[0].page.title.to_lowercase();
        assert!(
            top_title.contains("regularisation") || top_title.contains("overfitting"),
            "Got: {}", top_title
        );
    }

    #[test]
    fn test_question_cross_validation() {
        let dir = setup_ml_wiki();
        let engine = WikiEngine::new(dir.path()).unwrap();
        let results = engine.search("how to evaluate model performance using k-fold", 3).unwrap();
        assert!(!results.is_empty());
        let titles: Vec<_> = results.iter().map(|r| r.page.title.to_lowercase()).collect();
        let relevant = titles.iter().any(|t| t.contains("cross") || t.contains("validation"));
        assert!(relevant, "Expected cross-validation, got: {:?}", titles);
    }

    #[test]
    fn test_question_vanishing_gradient() {
        let dir = setup_ml_wiki();
        let engine = WikiEngine::new(dir.path()).unwrap();
        let results = engine.search("vanishing gradient problem in deep networks", 3).unwrap();
        assert!(!results.is_empty());
        // Should retrieve backpropagation page which mentions vanishing gradients
        let found = results.iter().any(|r|
            r.page.plain_text.contains("vanishing") || r.page.title.to_lowercase().contains("backprop")
        );
        assert!(found, "Expected page mentioning vanishing gradients");
    }

    #[test]
    fn test_question_unrelated_returns_no_crash() {
        let dir = setup_ml_wiki();
        let engine = WikiEngine::new(dir.path()).unwrap();
        // Completely off-topic question — should return empty or low-score results without panic
        let result = engine.search("what is the capital of France", 3);
        assert!(result.is_ok(), "Should not crash on unrelated query");
    }

    #[test]
    fn test_multi_keyword_query_scores() {
        let dir = setup_ml_wiki();
        let engine = WikiEngine::new(dir.path()).unwrap();
        let results = engine.search("neural network activation function relu sigmoid backpropagation", 5).unwrap();
        assert!(!results.is_empty());
        // Scores should be in descending order
        for i in 1..results.len() {
            assert!(
                results[i-1].score >= results[i].score,
                "Results should be sorted by score: {} < {}",
                results[i-1].score, results[i].score
            );
        }
    }
}
