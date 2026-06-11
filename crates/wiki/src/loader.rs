use anyhow::Result;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

/// Recursively discover all Markdown (`.md`) files under `wiki_dir`.
///
/// The following files are excluded from the result set:
/// - `index.md` located directly at the root of `wiki_dir`
/// - `log.md` located directly at the root of `wiki_dir`
///
/// All other `.md` files anywhere in the subtree are included, sorted
/// lexicographically by their full path for deterministic indexing order.
pub fn find_wiki_pages(wiki_dir: &Path) -> Result<Vec<PathBuf>> {
    // Canonicalise so that prefix comparisons work reliably.
    let root = wiki_dir
        .canonicalize()
        .unwrap_or_else(|_| wiki_dir.to_path_buf());

    let mut paths: Vec<PathBuf> = WalkDir::new(&root)
        .follow_links(false)
        .into_iter()
        .filter_map(|entry| {
            let entry = entry.ok()?;

            // Skip directories — we only want files.
            if !entry.file_type().is_file() {
                return None;
            }

            let path = entry.into_path();

            // Only include Markdown files.
            if path.extension().and_then(|e| e.to_str()) != Some("md") {
                return None;
            }

            // Skip index.md and log.md **at the wiki root only**.
            // Files with those names in subdirectories are included.
            if let Some(parent) = path.parent() {
                // Compare the canonical parent to the root.
                let canonical_parent = parent
                    .canonicalize()
                    .unwrap_or_else(|_| parent.to_path_buf());

                if canonical_parent == root {
                    let file_name = path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("");

                    if file_name == "index.md" || file_name == "log.md" {
                        return None;
                    }
                }
            }

            Some(path)
        })
        .collect();

    // Deterministic order makes diff-ing and debugging easier.
    paths.sort();

    Ok(paths)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn make_file(dir: &Path, rel: &str) {
        let full = dir.join(rel);
        if let Some(parent) = full.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(full, "# test\n").unwrap();
    }

    #[test]
    fn test_finds_md_files() {
        let dir = tempfile::tempdir().unwrap();
        make_file(dir.path(), "a.md");
        make_file(dir.path(), "sub/b.md");
        make_file(dir.path(), "sub/c.txt"); // should be excluded

        let pages = find_wiki_pages(dir.path()).unwrap();
        assert_eq!(pages.len(), 2);
        let names: Vec<&str> = pages
            .iter()
            .map(|p| p.file_name().unwrap().to_str().unwrap())
            .collect();
        assert!(names.contains(&"a.md"));
        assert!(names.contains(&"b.md"));
    }

    #[test]
    fn test_skips_root_index_and_log() {
        let dir = tempfile::tempdir().unwrap();
        make_file(dir.path(), "index.md");          // excluded
        make_file(dir.path(), "log.md");            // excluded
        make_file(dir.path(), "content.md");        // included
        make_file(dir.path(), "sub/index.md");      // included (not at root)
        make_file(dir.path(), "sub/log.md");        // included (not at root)

        let pages = find_wiki_pages(dir.path()).unwrap();
        let names: Vec<&str> = pages
            .iter()
            .map(|p| p.file_name().unwrap().to_str().unwrap())
            .collect();

        assert!(!names.contains(&"index.md") || pages.iter().any(|p| p.parent().unwrap() != dir.path().canonicalize().unwrap()),
            "Root index.md should be excluded");
        // Verify only correct files are present
        let page_count = pages.len();
        assert_eq!(page_count, 3, "Expected content.md + sub/index.md + sub/log.md, got {page_count}");
    }

    #[test]
    fn test_empty_directory() {
        let dir = tempfile::tempdir().unwrap();
        let pages = find_wiki_pages(dir.path()).unwrap();
        assert!(pages.is_empty());
    }

    #[test]
    fn test_sorted_order() {
        let dir = tempfile::tempdir().unwrap();
        make_file(dir.path(), "zzz.md");
        make_file(dir.path(), "aaa.md");
        make_file(dir.path(), "mmm.md");

        let pages = find_wiki_pages(dir.path()).unwrap();
        let names: Vec<String> = pages
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, vec!["aaa.md", "mmm.md", "zzz.md"]);
    }
}
