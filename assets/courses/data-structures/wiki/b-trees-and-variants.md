---
course: cs-201
topic: b-trees-and-variants
title: "B-Trees and B+ Trees: Disk-Based Storage and Database Indexing"
difficulty: advanced
tags: [databases, file-systems, trees, disk-io, indexing]
placement_domains: [backend-engineering, database-internals, systems-design]
has_interactive: true
has_quiz: true
has_code: true
has_gif: true
---

# B-Trees and B+ Trees: Disk-Based Storage and Database Indexing

> A B-Tree is a self-balancing, multi-way search tree optimized for systems that read and write large blocks of data, maintaining sorted data and allowing searches, sequential access, insertions, and deletions in logarithmic time.

## 1. Historical Background & Motivation

The B-Tree was first proposed by Rudolf Bayer and Edward M. McCreight while working at Boeing Scientific Research Labs in 1970. At the time, the computing world was facing a "memory wall": while internal RAM was growing, it remained far too small to house massive datasets, necessitating the use of "secondary storage" (magnetic drums and disks). Traditional Binary Search Trees (BSTs) and even balanced variants like AVL trees or Red-Black trees performed poorly in these environments because they were designed with the assumption that all nodes reside in memory.

In a disk-based environment, the cost of accessing a single byte of data is dominated by the "seek time"—the physical movement of the disk arm and the rotation of the platter. Once the disk head is positioned, reading a large block of contiguous data (a "page") is relatively fast. B-Trees solved the performance bottleneck by increasing the **fan-out** of each node. Instead of two children, a B-Tree node could have hundreds or thousands, matching the tree's node size to the disk's page size. This evolution shifted the paradigm from minimizing *comparisons* (the goal of BSTs) to minimizing *disk I/O operations*. Today, B-Trees and their most popular variant, the B+ Tree, form the foundational architecture of nearly every relational database (MySQL, PostgreSQL, Oracle) and modern file system (NTFS, APFS, XFS).

## 2. Visual Intuition
:::demo
<div style="background:#1e1e1e;padding:16px;border-radius:10px;color:#e5e7eb;font-family:system-ui,sans-serif">
  <h3 style="margin:0 0 8px 0;color:#7dd3fc">B-Trees and B+ Trees: Disk-Based Storage and Database Indexing - Concept Map</h3>
  <svg width="100%" height="280" viewBox="0 0 640 280" role="img" aria-label="B-Trees and B+ Trees: Disk-Based Storage and Database Indexing visual intuition" style="background:#111827;border-radius:8px">
    <rect x="24" y="28" width="180" height="64" rx="10" fill="#1d4ed8" />
    <text x="114" y="66" text-anchor="middle" fill="#e5e7eb" font-size="14">Problem</text>
    <rect x="230" y="28" width="180" height="64" rx="10" fill="#0f766e" />
    <text x="320" y="66" text-anchor="middle" fill="#e5e7eb" font-size="14">Process</text>
    <rect x="436" y="28" width="180" height="64" rx="10" fill="#7c3aed" />
    <text x="526" y="66" text-anchor="middle" fill="#e5e7eb" font-size="14">Outcome</text>

    <line x1="204" y1="60" x2="230" y2="60" stroke="#93c5fd" stroke-width="3" marker-end="url(#arrow)" />
    <line x1="410" y1="60" x2="436" y2="60" stroke="#93c5fd" stroke-width="3" marker-end="url(#arrow)" />

    <rect x="24" y="130" width="592" height="120" rx="10" fill="#0b1220" stroke="#334155" />
    <text x="320" y="156" text-anchor="middle" fill="#cbd5e1" font-size="14">Key intuition for B-Trees and B+ Trees: Disk-Based Storage and Database Indexing</text>
    <text x="320" y="182" text-anchor="middle" fill="#94a3b8" font-size="12">Track state changes, constraints, and final behavior.</text>
    <text x="320" y="206" text-anchor="middle" fill="#94a3b8" font-size="12">Use this as a mental model before formal proofs or code.</text>

    <defs>
      <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
        <polygon points="0 0, 10 3, 0 6" fill="#93c5fd" />
      </marker>
    </defs>
  </svg>
  <p style="margin-top:10px;color:#cbd5e1">Interactive-ready visual scaffold for the topic.</p>
</div>
:::
*Caption: A B-Tree of degree $t=3$ growing from the root. Notice how the tree expands upwards when the root splits, ensuring all leaves remain at the same depth.*

## 3. Core Theory & Mathematical Foundations

### 3.1 The Memory Hierarchy and Disk I/O
To understand B-Trees, one must understand the latency gap. Accessing L1 cache takes ~1ns, while a mechanical disk seek takes ~10ms—a difference of seven orders of magnitude. 

If we store $10^9$ elements in a balanced BST, the height is $\approx \log_2(10^9) \approx 30$. In a worst-case scenario where each node is on a different disk page, a search requires 30 disk seeks. By contrast, a B-Tree with a fan-out (degree) of 100 would have a height of $\log_{100}(10^9) \approx 5$. Reducing disk seeks from 30 to 5 is a transformative performance gain.

### 3.2 Formal Definition
A B-Tree of minimum degree $t \geq 2$ is a rooted tree satisfying the following properties:
1.  **Node Structure**: Every node $x$ has:
    *   $x.n$: The number of keys currently stored in node $x$.
    *   The $x.n$ keys stored in non-decreasing order: $x.key_1 \leq x.key_2 \leq \dots \leq x.key_{x.n}$.
    *   $x.leaf$: A boolean value, true if $x$ is a leaf.
2.  **Child Pointers**: Every internal node contains $x.n + 1$ pointers $c_1, c_2, \dots, c_{x.n+1}$ to its children. Leaf nodes have no children.
3.  **Key Ranges**: The keys $x.key_i$ separate the ranges of keys stored in each subtree. If $k_i$ is any key stored in the subtree with root $x.c_i$, then:
    $$k_1 \leq x.key_1 \leq k_2 \leq x.key_2 \leq \dots \leq x.key_{x.n} \leq k_{x.n+1}$$
4.  **Height Balance**: All leaves are at the same depth, which is the tree's height $h$.
5.  **Node Capacity (The Degree Bounds)**:
    *   Every node other than the root must have at least $t-1$ keys. Every internal node other than the root thus has at least $t$ children.
    *   Every node can contain at most $2t-1$ keys. Therefore, an internal node can have at most $2t$ children. We say a node is **full** if it contains exactly $2t-1$ keys.

### 3.3 B+ Trees: The Industry Standard
While Bayer's original B-Tree stored data pointers in both internal and leaf nodes, modern systems almost exclusively use **B+ Trees**. 
*   **Data at Leaves**: In a B+ Tree, internal nodes only store "keys" (guides); all actual records (or pointers to them) are stored in leaf nodes.
*   **Linked Leaves**: Leaf nodes are linked together in a doubly-linked list. This allows for $O(\log_M N + K)$ range queries, where $K$ is the number of elements in the range. In a standard B-Tree, a range query requires an expensive in-order traversal moving up and down the tree.

### 3.4 Formal Analysis
**Theorem: Height of a B-Tree**
If $n \geq 1$, then for any $n$-key B-tree of height $h$ and minimum degree $t \geq 2$:
$$h \leq \log_t \left( \frac{n+1}{2} \right)$$

*Proof Sketch*:
The root has at least one key. All other nodes have at least $t-1$ keys. 
At depth 1, there are at least 2 nodes.
At depth 2, there are at least $2t$ nodes.
At depth $h$, there are at least $2t^{h-1}$ nodes.
The total number of keys $n$ is:
$$n \geq 1 + (t-1) \sum_{i=1}^h 2t^{i-1} = 1 + 2(t-1) \left( \frac{t^h - 1}{t-1} \right) = 2t^h - 1$$
Solving for $h$:
$$n+1 \geq 2t^h \implies \frac{n+1}{2} \geq t^h \implies h \leq \log_t \left( \frac{n+1}{2} \right)$$
This proves that the height grows logarithmically with the base $t$. Since $t$ can be large (e.g., 512), the height stays very small.

## 4. Algorithm / Process (Step-by-Step)

### 4.1 Searching
Searching is a generalized version of BST search. Within a node, we perform binary search (or linear search if $t$ is small) to find the correct child pointer.
1. Start at `root`.
2. Find the smallest $i$ such that $k \leq x.key_i$.
3. If $k == x.key_i$, return $(x, i)$.
4. If $x$ is a leaf, the key is not present.
5. Else, `Search(x.c_i, k)`.

### 4.2 Insertion (Proactive Splitting)
To avoid two passes (one down to find the leaf, one up to split), we use **proactive splitting**. As we descend the tree, if we encounter a "full" node ($2t-1$ keys), we split it immediately.
1. If root is full, create a new root, make the old root its child, and split the old root.
2. Traverse down to the leaf.
3. If the next node in the path is full, split it.
4. When at the leaf, insert the key in the correct sorted position.

**The Split Operation**:
A full node $y$ is split at its median key $y.key_t$. The median key is moved up to $y$'s parent, and the remaining $2t-2$ keys are divided equally into two nodes with $t-1$ keys each.

### 4.3 Deletion
Deletion is more complex because we must maintain the $t-1$ minimum key constraint.
1. If the key is in a leaf, simply delete it.
2. If the key is in an internal node $x$:
    *   If the child $y$ preceding the key has $\geq t$ keys, find the predecessor $k'$ in $y$'s subtree, replace $k$ with $k'$, and delete $k'$.
    *   Else if the child $z$ following the key has $\geq t$ keys, find the successor $k'$ and repeat.
    *   If both have $t-1$ keys, merge $y$ and $z$ and the key into a single node.
3. If a node has $t-2$ keys after deletion, it must **borrow** from a sibling or **merge** with a sibling to maintain invariants.

## 5. Visual Diagram

```mermaid
graph TD
    subgraph Root
    R[Key: 50]
    end
    
    subgraph Internal_Layer
    R --> I1[Keys: 20 | 35]
    R --> I2[Keys: 70 | 85]
    end
    
    subgraph Leaf_Layer
    I1 --> L1[Keys: 5 | 10 | 15]
    I1 --> L2[Keys: 22 | 25 | 30]
    I1 --> L3[Keys: 38 | 42 | 45]
    
    I2 --> L4[Keys: 55 | 60 | 65]
    I2 --> L5[Keys: 72 | 75 | 80]
    I2 --> L6[Keys: 90 | 95 | 99]
    end
    
    L1 -.-> L2 -.-> L3 -.-> L4 -.-> L5 -.-> L6
```
*Caption: A B+ Tree structure. Internal nodes contain only keys for routing. Leaf nodes contain all actual data and are linked sequentially for range scans. All leaves reside at the same depth.*

## 6. Implementation

### 6.1 Core B-Tree Implementation (Python)
This implementation demonstrates the core B-Tree logic focusing on proactive splitting.

```python
class BTreeNode:
    def __init__(self, leaf=False):
        self.leaf = leaf
        self.keys = []
        self.child = []

class BTree:
    def __init__(self, t):
        self.root = BTreeNode(True)
        self.t = t  # Minimum degree

    def search(self, k, x=None):
        """
        Search for key k in the subtree rooted at x.
        Complexity: O(t * log_t n) -> t keys per node, log_t n nodes.
        """
        if x is None:
            x = self.root
        
        i = 0
        while i < len(x.keys) and k > x.keys[i]:
            i += 1
            
        if i < len(x.keys) and k == x.keys[i]:
            return (x, i)
        elif x.leaf:
            return None
        else:
            return self.search(k, x.child[i])

    def insert(self, k):
        root = self.root
        if len(root.keys) == (2 * self.t) - 1:
            # Root is full, tree grows in height
            temp = BTreeNode()
            self.root = temp
            temp.child.insert(0, root)
            self.split_child(temp, 0)
            self.insert_non_full(temp, k)
        else:
            self.insert_non_full(root, k)

    def split_child(self, x, i):
        t = self.t
        y = x.child[i]
        z = BTreeNode(y.leaf)
        
        # New node z takes the last t-1 keys of y
        x.child.insert(i + 1, z)
        x.keys.insert(i, y.keys[t - 1])
        
        z.keys = y.keys[t : (2 * t) - 1]
        y.keys = y.keys[0 : t - 1]
        
        if not y.leaf:
            z.child = y.child[t : 2 * t]
            y.child = y.child[0 : t]

    def insert_non_full(self, x, k):
        i = len(x.keys) - 1
        if x.leaf:
            # Insert k into the sorted keys of leaf x
            x.keys.append(None)
            while i >= 0 and k < x.keys[i]:
                x.keys[i + 1] = x.keys[i]
                i -= 1
            x.keys[i + 1] = k
        else:
            # Find the child to descend into
            while i >= 0 and k < x.keys[i]:
                i -= 1
            i += 1
            if len(x.child[i].keys) == (2 * self.t) - 1:
                self.split_child(x, i)
                if k > x.keys[i]:
                    i += 1
            self.insert_non_full(x.child[i], k)

# Example Usage:
# btree = BTree(t=3)
# for i in [10, 20, 5, 6, 12, 30, 7, 17]:
#     btree.insert(i)
# print(btree.search(12)) # Returns node object and index
```

### 6.2 Optimized Production Considerations
In a production system (like a storage engine), B+ Trees are implemented with:
1.  **Buffer Pool Integration**: Nodes are not objects but raw byte arrays in the buffer pool.
2.  **Concurrency Control**: Using "Latch Crabbing" (holding latches on children before releasing parents) to allow multiple threads to traverse the tree.
3.  **Prefix Compression**: Storing only the suffix of keys in nodes to increase fan-out.

### 6.3 Common Pitfalls
*   **Off-by-one in Splitting**: Forgetting that a node with $2t-1$ keys has $2t$ children. When splitting, the median is key index $t-1$ (0-indexed).
*   **Root Splitting**: The only case where the tree height increases. Many beginners fail to handle the creation of a new root correctly.
*   **Ignoring Disk Alignment**: In Python, B-Trees are theoretical. In C++, if your node size doesn't match the OS page size (usually 4KB), you lose the B-Tree's primary advantage.

## 7. Interactive Demo

:::demo
<!-- title: B-Tree (t=3) Insertion Visualizer -->
<!DOCTYPE html>
<html>
<head>
<style>
  body { margin:0; background:#0f1117; color:#e5e7eb; font-family: monospace; padding:16px; }
  canvas { border: 1px solid #374151; background: #1f2937; display: block; margin: auto; }
  .controls { display:flex; gap:10px; margin-bottom:10px; justify-content: center; }
  input, button { background:#374151; color:white; border:1px solid #4b5563; padding:5px 10px; cursor:pointer; }
</style>
</head>
<body>
  <div class="controls">
    <input type="number" id="val" value="10" style="width:50px">
    <button onclick="addNode()">Insert</button>
    <button onclick="resetTree()">Reset</button>
  </div>
  <canvas id="treeCanvas" width="800" height="400"></canvas>
<script>
class DemoNode {
    constructor(leaf = false) {
        self.leaf = leaf; self.keys = []; self.children = [];
    }
}
let tree = { root: { keys: [], children: [], leaf: true }, t: 3 };

function split(parent, i) {
    let t = tree.t;
    let y = parent.children[i];
    let z = { keys: y.keys.slice(t), children: y.children.slice(t), leaf: y.leaf };
    parent.keys.splice(i, 0, y.keys[t-1]);
    parent.children.splice(i + 1, 0, z);
    y.keys = y.keys.slice(0, t-1);
    y.children = y.children.slice(0, t);
}

function insertNonFull(x, k) {
    let i = x.keys.length - 1;
    if (x.leaf) {
        x.keys.push(null);
        while (i >= 0 && k < x.keys[i]) { x.keys[i+1] = x.keys[i]; i--; }
        x.keys[i+1] = k;
    } else {
        while (i >= 0 && k < x.keys[i]) i--;
        i++;
        if (x.children[i].keys.length === 2 * tree.t - 1) {
            split(x, i);
            if (k > x.keys[i]) i++;
        }
        insertNonFull(x.children[i], k);
    }
}

function addNode() {
    let k = parseInt(document.getElementById('val').value);
    let r = tree.root;
    if (r.keys.length === 2 * tree.t - 1) {
        let s = { keys: [], children: [r], leaf: false };
        tree.root = s;
        split(s, 0);
        insertNonFull(s, k);
    } else {
        insertNonFull(r, k);
    }
    draw();
}

function resetTree() {
    tree.root = { keys: [], children: [], leaf: true };
    draw();
}

function drawNode(x, y, node, ctx) {
    let w = node.keys.length * 30 + 10;
    ctx.fillStyle = "#3b82f6";
    ctx.fillRect(x - w/2, y, w, 30);
    ctx.strokeRect(x - w/2, y, w, 30);
    ctx.fillStyle = "white";
    ctx.fillText(node.keys.join('|'), x - w/2 + 5, y + 20);
    
    if (!node.leaf) {
        let startX = x - (node.children.length * 60) / 2;
        node.children.forEach((child, i) => {
            let childX = startX + i * 60;
            let childY = y + 60;
            ctx.beginPath();
            ctx.moveTo(x, y + 30);
            ctx.lineTo(childX, childY);
            ctx.stroke();
            drawNode(childX, childY, child, ctx);
        });
    }
}

function draw() {
    const canvas = document.getElementById('treeCanvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,800,400);
    ctx.strokeStyle = "#94a3b8";
    drawNode(400, 20, tree.root, ctx);
}
draw();
</script>
</body>
</html>
:::

## 8. Worked Examples

### Example 1: B-Tree Construction
**Task**: Insert the sequence `[10, 20, 5, 6, 12, 30, 7, 17]` into a B-Tree of degree $t=3$ (max keys = 5).

1.  **Insert 10, 20, 5, 6, 12**: These all fit in the root. Root: `[5, 6, 10, 12, 20]`. Node is full ($2t-1 = 5$).
2.  **Insert 30**: Root is full. Split! Median (10) moves to a new root.
    *   Root: `[10]`
    *   Children: `L:[5, 6]`, `R:[12, 20]`
    *   Now insert 30 into `R`. `R` becomes `[12, 20, 30]`.
3.  **Insert 7**: Descend to `L`. `L` becomes `[5, 6, 7]`.
4.  **Insert 17**: Descend to `R`. `R` becomes `[12, 17, 20, 30]`.

### Example 2: The B+ Tree Range Query Advantage
Imagine a database table with 1 million records indexed by `ID`. We want to find all records where `100 < ID < 200`.

*   **B-Tree**: Find 101. Then perform an in-order traversal. This involves moving back up to the parent, down to the next child, etc. If the tree is 4 levels deep, we may go up and down multiple times, causing non-contiguous disk reads.
*   **B+ Tree**: Perform one search for `101`. This lands in a specific leaf. Because leaves are linked, we simply read the leaf sequentially and follow the `next` pointer to the next leaf. This results in **linear disk streaming**, which is orders of magnitude faster than random seeks.

## 9. Comparison with Alternatives

| Structure | Time (Search) | Disk I/O | Range Query | Best Used For |
|---|---|---|---|---|
| **BST / AVL** | $O(\log_2 N)$ | High (Height is large) | $O(K \log N)$ | In-memory data |
| **B-Tree** | $O(\log_t N)$ | Low (Height is small) | $O(K \log N)$ | Metadata, small filesystems |
| **B+ Tree** | $O(\log_t N)$ | Low | $O(K + \log_t N)$ | Database Indexing |
| **LSM Tree** | $O(\log N)$ | Medium (Compaction overhead) | Good | Write-heavy workloads (NoSQL) |
| **Hash Index** | $O(1)$ | Lowest | Impossible | Equality checks (unique lookups) |

## 10. Industry Applications & Real Systems

-   **MySQL (InnoDB)**: The default storage engine for MySQL uses B+ Trees for its clustered indexes. The primary key index contains the actual row data in the leaf nodes (index-organized table).
-   **PostgreSQL**: Uses B-Trees for its default index type. It implements the "Lehman and Yao" algorithm to allow concurrent access without locking the entire tree.
-   **Linux Filesystems (EXT4/XFS)**: XFS uses B+ Trees to track free space extents and inode locations, allowing it to scale to petabytes of data.
-   **SQLite**: The most widely deployed database engine uses a B-Tree variant for both table and index storage, mapping nodes directly to pages in a single file.

## 11. Practice Problems

### 🟢 Easy
1. **Node Capacity**: Given a B-Tree with $t=4$, what is the minimum and maximum number of keys a non-root node can hold?
   *Hint: Use the $t-1$ and $2t-1$ rules.*
   *Expected: Min 3, Max 7.*

### 🟡 Medium
2. **Height Calculation**: What is the maximum possible height of a B-Tree with $t=2$ (minimum degree) containing 100 keys?
   *Hint: $t=2$ is effectively a 2-3-4 tree. Calculate using the height formula.*

3. **B vs B+**: Explain why B+ Trees allow for higher fan-out than B-Trees if the page size is fixed at 4KB.
   *Hint: Think about what is stored in internal nodes.*

### 🔴 Hard
4. **Concurrency**: Design a locking strategy for a B-Tree where multiple threads can insert keys simultaneously.
   *Hint: Look up "Latch Crabbing".*

5. **External Sort Merger**: How would you use a B+ Tree to efficiently merge 100 sorted files that are each too large to fit in memory?

## 12. Interactive Quiz

:::quiz
**Q1: Why is the fan-out (t) of a B-Tree usually set to a large number (e.g., 512)?**
- A) To minimize the number of key comparisons in CPU.
- B) To minimize the number of disk I/O operations by reducing height.
- C) To make the implementation of deletion easier.
- D) To allow the tree to store duplicate keys.
> B — The primary bottleneck in large systems is disk latency. A large fan-out minimizes the tree height, thus minimizing disk seeks.

**Q2: In a B+ Tree, what is stored in the internal (non-leaf) nodes?**
- A) Full data records.
- B) Only keys (used for routing).
- C) Only pointers to the next sibling.
- D) Only the bit-values of the keys.
> B — B+ Trees optimize leaf space for data and internal space for keys to maximize fan-out.

**Q3: What happens when a root node in a B-Tree of degree t splits?**
- A) The tree height remains the same; keys are redistributed to children.
- B) The tree height increases by 1.
- C) The tree height decreases by 1.
- D) The tree becomes a binary search tree.
> B — Splitting the root is the only mechanism by which a B-Tree increases its height.

**Q4: Which property of B+ Trees makes them superior to standard B-Trees for SQL queries like `SELECT * WHERE age BETWEEN 20 AND 30`?**
- A) Faster individual lookups.
- B) Smaller memory footprint.
- C) Linked-list pointers between leaf nodes.
- D) Use of binary search within nodes.
> C — The linked leaves allow for sequential scanning after the initial search.

**Q5: What is the minimum number of keys in a non-root node for a B-Tree with minimum degree t=10?**
- A) 10
- B) 20
- C) 9
- D) 11
> C — The formula is $t-1$. So $10-1 = 9$.
:::

## 13. Interview Preparation

### Conceptual Questions
**Q: Why don't we use Red-Black trees for database indexing?**
*A: Red-Black trees are binary trees ($t=2$). For $10^9$ records, an RB-Tree has a height of $\approx 30$. This requires 30 disk seeks. A B-Tree with $t=500$ has a height of $\approx 4$, requiring only 4 seeks. In a disk-based environment, minimizing seeks is more important than minimizing CPU comparisons.*

**Q: Explain the "Proactive Split" strategy during insertion.**
*A: Standard insertion might find a full leaf, split it, and then find the parent is also full, causing a cascade of splits back to the root. Proactive splitting ensures that as we traverse down the tree, we split any full node we encounter. This guarantees that when we reach the leaf, its parent has space to accommodate a new key, allowing insertion in a single downward pass.*

**Q: Derive the time complexity of a B-Tree search.**
*A: A search visits $h$ nodes. In each node, we perform a search among $O(t)$ keys. Since $h \leq \log_t N$, the total complexity is $O(t \log_t N)$. Using binary search within a node, this can be $O(\log_2 t \cdot \log_t N)$, which simplifies to $O(\log_2 N)$. Note that while CPU time is $O(\log_2 N)$, the Disk I/O complexity is $O(\log_t N)$.*

### Quick Reference (Cheat Sheet)
| Property | B-Tree | B+ Tree |
|---|---|---|
| **Data Storage** | Internal & Leaf Nodes | Leaf Nodes Only |
| **Search Time** | $O(\log_t N)$ | $O(\log_t N)$ |
| **Range Query** | Slow (Traverses tree) | Fast (Follows leaf links) |
| **Fan-out** | Lower (Nodes store data) | Higher (Nodes store only keys) |
| **Height** | Balanced (All leaves same level) | Balanced |

## 14. Key Takeaways
1.  **I/O is the Bottleneck**: B-Trees are designed to minimize disk access, not CPU cycles.
2.  **Fan-out is King**: High degree $t$ results in shallow trees.
3.  **B+ for Scans**: Always choose B+ Trees for range-heavy workloads (typical of SQL).
4.  **Invariants Matter**: Every node (except root) must be at least half-full. This ensures $O(\log N)$ depth.
5.  **Logarithmic Scaling**: B-Trees allow us to manage trillions of records with only 3-5 disk reads.

## 15. Common Misconceptions
- ❌ **"The 'B' stands for Binary"** → ✅ It stands for "Balanced" (or Bayer/Boeing). It is a **multi-way** tree, not binary.
- ❌ **"B-Trees are only for databases"** → ✅ They are used anywhere large datasets exceed RAM, including file systems and even some specialized message queues.
- ❌ **"Binary search within a node is always better"** → ✅ If $t$ is small (e.g., $t=6$), a linear search might be faster due to CPU cache effects and SIMD instructions.

## 16. Further Reading
- **CLRS Chapter 18**: The definitive formal treatment of B-Trees.
- **Database System Concepts (Silberschatz)**: Excellent coverage of B+ Tree implementation in storage engines.
- **"The Ubiquitous B-Tree" (Douglas Comer)**: A classic survey paper on B-Tree variants.
- **Modern B-Tree Techniques (Goetz Graefe)**: For advanced optimization strategies (prefix compression, etc.).

## 17. Related Topics
- [[complexity-analysis]] — Understanding the $O(\log N)$ performance.
- [[binary-search-trees]] — The ancestor of the B-Tree.
- [[lsm-trees]] — An alternative used in write-heavy NoSQL databases.
- [[buffer-pool-management]] — How B-Tree nodes are cached in memory.
