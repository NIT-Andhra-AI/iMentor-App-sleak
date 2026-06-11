---
course: "data-structures"
course_title: "Data Structures"
topic: "searching"
title: "Searching Algorithms"
difficulty: "beginner"
tags: ["data-structures", "algorithms", "cs-core", "placement"]
placement_domains: ["SDE", "Software Engineer"]
has_interactive: true
has_quiz: true
has_code: true
rag_indexed: true
---

# Searching Algorithms

> Searching algorithms are the fundamental building blocks of data retrieval, providing systematic procedures to locate specific elements within a structure based on constraints like order, density, and access patterns.

## Overview

Searching is the computational process of identifying the presence or location of a target element within a collection of data. It is perhaps the most ubiquitous operation in computer science, serving as the backbone for database queries, file system indexing, and real-time information retrieval. The performance of a search algorithm is rarely an inherent property of the algorithm alone; rather, it is a function of the underlying data structure's invariants—specifically, whether the data is sorted, indexed, or linked.

Historically, the evolution of search algorithms has mirrored our growth in data volume. From the simple $O(n)$ linear scan used in early magnetic tape storage systems to the sophisticated $O(\log \log n)$ interpolation techniques used in modern high-speed memory caches, the field has optimized for diverse access patterns. Choosing the right algorithm requires an understanding of the trade-off between *preprocessing overhead* (sorting or indexing) and *query latency*. In production environments, identifying when to accept $O(n)$ scan speed versus when to invest in a $O(\log n)$ balanced search tree is a critical architectural decision.

## 2. Visual Intuition
:::demo
<div style="background:#1e1e1e;padding:16px;border-radius:10px;color:#e5e7eb;font-family:system-ui,sans-serif">
  <h3 style="margin:0 0 8px 0;color:#7dd3fc">Searching Algorithms - Concept Map</h3>
  <svg width="100%" height="280" viewBox="0 0 640 280" role="img" aria-label="Searching Algorithms visual intuition" style="background:#111827;border-radius:8px">
    <rect x="24" y="28" width="180" height="64" rx="10" fill="#1d4ed8" />
    <text x="114" y="66" text-anchor="middle" fill="#e5e7eb" font-size="14">Problem</text>
    <rect x="230" y="28" width="180" height="64" rx="10" fill="#0f766e" />
    <text x="320" y="66" text-anchor="middle" fill="#e5e7eb" font-size="14">Process</text>
    <rect x="436" y="28" width="180" height="64" rx="10" fill="#7c3aed" />
    <text x="526" y="66" text-anchor="middle" fill="#e5e7eb" font-size="14">Outcome</text>

    <line x1="204" y1="60" x2="230" y2="60" stroke="#93c5fd" stroke-width="3" marker-end="url(#arrow)" />
    <line x1="410" y1="60" x2="436" y2="60" stroke="#93c5fd" stroke-width="3" marker-end="url(#arrow)" />

    <rect x="24" y="130" width="592" height="120" rx="10" fill="#0b1220" stroke="#334155" />
    <text x="320" y="156" text-anchor="middle" fill="#cbd5e1" font-size="14">Key intuition for Searching Algorithms</text>
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
*Caption: An animated representation of binary search: the search range is halved at each step until the target value is identified.*

## Core Theory

The efficiency of search is governed by the information gain at each step of the algorithm.

### Linear Search
Linear search examines each element $A[i]$ until $A[i] == \text{target}$. 
- **Time Complexity:** $T(n) = O(n)$ worst case, $O(1)$ best case.
- **Sentinel Technique:** To reduce loop overhead, we can place the target at the end of the array, eliminating the need to check for the array bounds in every iteration:
  ```python
  def linear_search(arr, target):
      last = arr[-1]
      arr[-1] = target
      i = 0
      while arr[i] != target: i += 1
      arr[-1] = last
      return i if (i < len(arr) - 1 or arr[-1] == target) else -1
  ```

### Binary Search
Binary search operates on the principle of divide and conquer. For a sorted array of size $n$, the search space is divided by 2 at each step.
- **Complexity:** $T(n) = T(n/2) + O(1)$, which solves to $O(\log n)$ via the Master Theorem.
- **Bounds:**
  - **Lower Bound:** The index of the first element $\ge$ target.
  - **Upper Bound:** The index of the first element $>$ target.

### Interpolation Search
When data is uniformly distributed, we use the value of the target to estimate its position, rather than strictly jumping to the middle.
The estimated position $pos$ is calculated as:
$$pos = low + \left\lfloor \frac{(target - arr[low]) \times (high - low)}{arr[high] - arr[low]} \right\rfloor$$
This achieves an average time complexity of $O(\log \log n)$.

## Visual Diagram
```mermaid
graph TD
    A[Start Search] --> B{Data Sorted?}
    B -- No --> C[Linear Scan O(n)]
    B -- Yes --> D{Uniform Distribution?}
    D -- Yes --> E[Interpolation Search O(log log n)]
    D -- No --> F[Binary Search O(log n)]
    C --> G[Result]
    E --> G
    F --> G
```
*A decision tree for selecting a search strategy based on data characteristics.*

## Code Example

```python
import math

def binary_search(arr, target):
    """Performs a standard binary search on a sorted list."""
    low, high = 0, len(arr) - 1
    while low <= high:
        mid = (low + high) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            low = mid + 1
        else:
            high = mid - 1
    return -1

# Execution
data = [10, 22, 35, 47, 50, 68, 75, 88, 99]
target = 68
result = binary_search(data, target)

print(f"Index of {target}: {result}") 
# Output: Index of 68: 5
```

## Interactive Demo
:::demo
<!-- Title: Binary Search Visualizer -->
<div id="visualizer">
  <div id="array-container" style="display:flex; gap:5px;"></div>
  <button onclick="stepSearch()">Step Search</button>
  <p id="status">Click button to start</p>
</div>
<script>
  let arr = [10, 20, 30, 40, 50, 60, 70];
  let target = 60;
  let low = 0, high = arr.length - 1;
  const container = document.getElementById('array-container');
  
  function render() {
    container.innerHTML = arr.map((v, i) => 
      `<div style="padding:10px; border:1px solid #555; ${i>=low && i<=high ? 'background:#3b82f6' : ''}">${v}</div>`
    ).join('');
  }
  
  function stepSearch() {
    if (low <= high) {
      let mid = Math.floor((low + high) / 2);
      if (arr[mid] === target) document.getElementById('status').innerText = "Found at " + mid;
      else if (arr[mid] < target) low = mid + 1;
      else high = mid - 1;
      render();
    }
  }
  render();
</script>
:::

## Worked Example
Searching for `target = 23` in `[11, 15, 23, 29, 34]`:
1. `low=0, high=4`. `mid = 2`.
2. `arr[2]` is `23`.
3. `23 == 23`. Return index `2`.

## Industry Applications
- **Google Search:** Uses inverted indices and specialized binary search variants to locate documents.
- **Database Indexing (PostgreSQL/MySQL):** B-Tree indexes utilize binary search to locate record pointers in $O(\log n)$.
- **Streaming Services (Netflix/Spotify):** Using "Binary Search on the Answer" to find the optimal bit-rate to match network bandwidth.

## Practice Problems
### Easy
1. Find the index of the first occurrence of a number in a sorted array with duplicates.
### Medium
2. Implement `sqrt(x)` using binary search to find the integer part of the square root.
3. Find the peak element in a mountain array (where values increase then decrease).
### Hard
4. **Allocate Books:** Given books with pages, find the minimum maximum pages allocated to students such that the distribution is contiguous.

## Interactive Quiz
:::quiz
**Q1:** What is the worst-case time complexity of binary search?
- A) O(n)
- B) O(log n)
- C) O(1)
- D) O(n log n)
> B — Binary search halves the search space at each iteration, resulting in a logarithmic number of steps.

**Q2:** When is Interpolation Search preferred over Binary Search?
- A) When the array is small.
- B) When data is not sorted.
- C) When data is uniformly distributed.
- D) When data has many duplicates.
> C — Interpolation search estimates the probe position based on value magnitude, which is highly efficient for uniform distribution.

**Q3:** Which search algorithm requires the least pre-processing?
- A) Binary Search
- B) Interpolation Search
- C) Linear Search
- D) Hash Map Lookup
> C — Linear search works on completely unsorted and unstructured data, requiring zero pre-processing or structural invariants.
:::

## Interview Questions
**Q: Explain searching to a senior engineer.**
A: Searching is the optimization of search space reduction. While simple linear scans are $O(n)$, we utilize structural properties—like sorted order or mathematical distribution—to reduce the search space logarithmically ($O(\log n)$) or better, effectively trading memory or preprocessing time for retrieval speed.

**Q: Time complexity of finding the "first occurrence" of a target?**
A: Still $O(\log n)$. You perform a standard binary search but, upon finding a match, you do not return immediately; you continue searching the left half to see if an earlier occurrence exists.

**Q: What if the data is constantly changing?**
A: A static array with binary search is inefficient because inserts/deletes are $O(n)$. We would move to a balanced BST or a Skip List, which maintains $O(\log n)$ search while providing $O(\log n)$ insertion/deletion.

**Q: How do you search in an infinite sorted array?**
A: Use "Exponential Search." Start by checking index 1, 2, 4, 8... until you find a value greater than the target. This establishes an upper bound, then perform binary search within that range.

## Key Takeaways
- Linear search is $O(n)$; use only for unsorted, small data.
- Binary search is the gold standard for sorted arrays: $O(\log n)$.
- Interpolation search is a niche tool for uniform data: $O(\log \log n)$.
- Always consider "Binary Search on the Answer" for optimization problems.
- Sentinel values can optimize inner-loop performance.
- Search performance is fundamentally tied to data structure invariants.

## Common Misconceptions
- ❌ Binary search works on all arrays → ✅ It requires the array to be sorted.
- ❌ O(log n) is always faster than O(n) → ✅ For very small $n$, the constant factors in binary search may make linear search faster.

## Related Topics
- [[sorting]] — Prerequisite for binary search.
- [[bst]] — Dynamic equivalent of sorted arrays.
- [[hashing]] — $O(1)$ lookup alternative.
