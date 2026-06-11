---
course: cs-201-data-structures
topic: hash-table-internals
title: "Hash Table Internals: Hash Functions, Chaining, and Open Addressing"
difficulty: advanced
tags: [hash-tables, collision-resolution, complexity-analysis, system-design, algorithms]
placement_domains: [software-engineering, systems-design, data-infrastructure]
has_interactive: true
has_quiz: true
has_code: true
has_gif: true
---

# Hash Table Internals: Hash Functions, Chaining, and Open Addressing

> **Hash Tables** are a fundamental data structure that implements an associative array abstract data type, mapping unique keys to values by utilizing a mathematical "hash function" to compute an index into an array of buckets or slots, enabling near-constant time complexity for search, insertion, and deletion.

## 1. Historical Background & Motivation

The genesis of the hash table dates back to January 1953, when Hans Peter Luhn, an IBM researcher, wrote an internal memorandum suggesting the use of "hashing with chaining" for storing information. While simple arrays allowed for $O(1)$ access via integer indices, they failed when the domain of possible keys (e.g., all possible names or social security numbers) far exceeded the available memory. Luhn's breakthrough was realizing that we could map a large space of keys into a smaller space of indices, provided we had a strategy to handle "collisions"—instances where two keys map to the same index.

Concurrent with Luhn, Arnold Dumey independently developed the idea of using "remaindering" (the modulo operator) as a hash function. In the decades that followed, hashing evolved from a simple lookup trick into a rigorous branch of computer science. The 1970s saw the formalization of Universal Hashing by Carter and Wegman, proving that one could achieve $O(1)$ expected time regardless of the input distribution. In modern computing, hash tables are the engine behind everything from Python's `dict` and Redis's key-value store to database indexing and load balancers. They represent the ultimate trade-off: using a small amount of extra memory to buy significant gains in speed, effectively bridging the gap between $O(N)$ linear searches and the theoretical limits of $O(1)$ random access.

## 2. Visual Intuition

![Hash Table Visual](/images/Hash_table_3_1_1_0_1_0_0_SP.svg)
*Caption: A hash table with collision resolution. Keys are mapped via a hash function to indices. When multiple keys (e.g., John Smith and Sandra Dee) map to index 152, they are stored in a linked list (Chaining).*

## 3. Core Theory & Mathematical Foundations

At its core, a hash table consists of a fixed-size array (the "table") and a mapping function. Formally, let $K$ be the universe of keys and $m$ be the size of the table $T[0 \dots m-1]$. The hash function is defined as $h: K \to \{0, 1, \dots, m-1\}$.

### 3.1 The Simple Uniform Hashing Assumption (SUHA)
To analyze hash tables, we often assume **Simple Uniform Hashing**:
1. Each key is equally likely to hash to any of the $m$ slots.
2. Each key hashes independently of where any other key has hashed.

Under SUHA, if we store $n$ keys in a table of size $m$, the **load factor** $\alpha$ is defined as:
$$\alpha = \frac{n}{m}$$
This ratio $\alpha$ is the single most important metric for hash table performance. It represents the average number of elements per slot.

### 3.2 Collision Resolution: Chaining
In **Separate Chaining**, each slot $T[j]$ contains a pointer to a linked list of all elements $k$ such that $h(k) = j$. 

**Theorem:** In a hash table with chaining, an unsuccessful search takes $O(1 + \alpha)$ time on average, and a successful search takes $O(1 + \alpha)$ time on average under SUHA.
*Proof Sketch:* To search for a key $k$, the algorithm computes $h(k)$ and searches the list at $T[h(k)]$. In an unsuccessful search, it must traverse the entire list. The expected length of that list is exactly the load factor $\alpha$. Thus, total time is $O(1)$ for hashing + $O(\alpha)$ for traversal.

### 3.3 Collision Resolution: Open Addressing
In **Open Addressing**, all elements are stored within the table itself. If a collision occurs, we "probe" other slots until an empty one is found. The probe sequence depends on the key: $h(k, p)$, where $p$ is the probe number $\{0, 1, \dots, m-1\}$.

1.  **Linear Probing:** $h(k, i) = (h'(k) + i) \mod m$. This suffers from **primary clustering**, where long runs of occupied slots build up, increasing search time.
2.  **Quadratic Probing:** $h(k, i) = (h'(k) + c_1 i + c_2 i^2) \mod m$. This mitigates primary clustering but leads to **secondary clustering**.
3.  **Double Hashing:** $h(k, i) = (h_1(k) + i \cdot h_2(k)) \mod m$. This is one of the best techniques, as the probe sequence depends on the key in two ways.

### 3.4 Hash Function Design
A "good" hash function should minimize collisions. 
- **The Division Method:** $h(k) = k \mod m$. Usually, $m$ is chosen as a prime number not close to a power of 2 to ensure that the hash depends on all bits of the key.
- **The Multiplication Method:** $h(k) = \lfloor m(kA \mod 1) \rfloor$, where $A$ is a constant (Knuth suggests $A \approx (\sqrt{5}-1)/2$).
- **Universal Hashing:** A randomized approach where we choose a hash function $h$ at random from a family $H$ such that for any two keys $x \neq y$, $P(h(x) = h(y)) \le 1/m$.

## 4. Algorithm / Process (Step-by-Step)

### The `PUT(key, value)` Operation (Chaining)
1.  **Compute Hash:** Calculate the raw hash value of the `key`.
2.  **Map to Index:** Use `index = hash(key) % capacity`.
3.  **Handle Collision:** 
    - Access the bucket at `table[index]`.
    - Iterate through the linked list at that bucket.
    - If `key` already exists, update its `value`.
    - If `key` does not exist, append a new node `(key, value)` to the list.
4.  **Rehash Check:** If $n/m > \text{threshold}$ (typically 0.75), trigger a **Resize** (doubling capacity and re-inserting all keys).

### The `GET(key)` Operation (Open Addressing / Linear Probing)
1.  **Compute Hash:** `index = hash(key) % capacity`.
2.  **Probe Sequence:**
    - Check `table[index]`. If empty, key not found.
    - If `table[index].key == key`, return `value`.
    - If `table[index]` is occupied by a different key, increment index: `index = (index + 1) % capacity`.
3.  **Termination:** Stop if an empty slot is found or if we have probed all $m$ slots.

## 5. Visual Diagram

```mermaid
graph TD
    A[Start: Key 'Apple'] --> B[Hash Function: hash('Apple')]
    B --> C[Compute Index: 145234 % 10 = 4]
    C --> D{Is Table[4] empty?}
    D -- Yes --> E[Store 'Apple' at Table[4]]
    D -- No --> F{Collision Resolution}
    F -- Chaining --> G[Append to Linked List at Table[4]]
    F -- Open Addressing --> H[Probe Table[5], Table[6]...]
    E --> I[End]
    G --> I
    H --> I
```
*Caption: The lifecycle of an insertion in a hash table, showing the branch between Chaining and Open Addressing logic.*

## 6. Implementation

### 6.1 Core Implementation (Chaining)

```python
class Node:
    """A node in a singly-linked list for Chaining."""
    def __init__(self, key, value):
        self.key = key
        self.value = value
        self.next = None

class HashTableChaining:
    def __init__(self, capacity=10):
        self.capacity = capacity
        self.size = 0
        self.table = [None] * capacity
        self.load_factor_threshold = 0.75

    def _hash(self, key):
        """Standard Python hash adjusted to capacity."""
        return hash(key) % self.capacity

    def put(self, key, value):
        """
        Inserts or updates a key-value pair.
        Complexity: O(1) average, O(n) worst case.
        """
        if self.size / self.capacity >= self.load_factor_threshold:
            self._resize()

        index = self._hash(key)
        if self.table[index] is None:
            self.table[index] = Node(key, value)
            self.size += 1
        else:
            curr = self.table[index]
            while True:
                if curr.key == key:
                    curr.value = value
                    return
                if curr.next is None:
                    break
                curr = curr.next
            curr.next = Node(key, value)
            self.size += 1

    def get(self, key):
        """
        Retrieves value for key.
        Complexity: O(1) average, O(n) worst case.
        """
        index = self._hash(key)
        curr = self.table[index]
        while curr:
            if curr.key == key:
                return curr.value
            curr = curr.next
        raise KeyError(f"Key '{key}' not found.")

    def _resize(self):
        """Doubles table size and rehashes all elements."""
        old_table = self.table
        self.capacity *= 2
        self.table = [None] * self.capacity
        self.size = 0
        for head in old_table:
            curr = head
            while curr:
                self.put(curr.key, curr.value)
                curr = curr.next

# Example Usage:
# ht = HashTableChaining()
# ht.put("user:1", {"name": "Alice"})
# print(ht.get("user:1")) # Output: {'name': 'Alice'}
```

### 6.2 Optimized Production Variant (Linear Probing with Lazy Deletion)

In production systems, open addressing is often preferred for better **cache locality**. However, we must handle deletions carefully using "Tombstones".

```python
class HashTableLinearProbing:
    def __init__(self, capacity=11):
        self.capacity = capacity
        self.keys = [None] * capacity
        self.values = [None] * capacity
        self.size = 0
        self.DELETED = object() # Sentinel for lazy deletion

    def _hash(self, key):
        return hash(key) % self.capacity

    def put(self, key, value):
        if self.size > self.capacity // 2:
            self._resize()

        idx = self._hash(key)
        while self.keys[idx] is not None and self.keys[idx] is not self.DELETED:
            if self.keys[idx] == key:
                self.values[idx] = value
                return
            idx = (idx + 1) % self.capacity
        
        self.keys[idx] = key
        self.values[idx] = value
        self.size += 1

    def delete(self, key):
        idx = self._hash(key)
        while self.keys[idx] is not None:
            if self.keys[idx] == key:
                self.keys[idx] = self.DELETED
                self.values[idx] = None
                self.size -= 1
                return
            idx = (idx + 1) % self.capacity
        raise KeyError(key)
```

### 6.3 Common Pitfalls in Code
1.  **Mutable Keys:** Never use mutable objects (like Python lists) as keys. If the object changes, its hash changes, and you can never find it again.
2.  **Poor Hash for Small Tables:** Using `hash(key) % 2` when you have many elements will collapse everything into two buckets.
3.  **Infinite Probing:** In open addressing, if the table is full and you don't have a check, `put` will enter an infinite loop.
4.  **Incorrect Deletion:** In linear probing, simply setting a slot to `None` breaks the "chain" for keys that were probed past that slot. You must use a "Tombstone" marker.

## 7. Interactive Demo

:::demo
<!-- title: Hash Collision Visualization -->
<!DOCTYPE html>
<html>
<head>
<style>
  body { background: #111; color: #fff; font-family: monospace; }
  .table-container { display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
  .slot { border: 1px solid #444; padding: 10px; width: 80px; text-align: center; background: #222; }
  .slot.active { border-color: #00ff00; background: #1a331a; }
  .controls { margin-bottom: 20px; }
  input, button { padding: 8px; background: #333; color: white; border: 1px solid #555; border-radius: 4px; }
  .log { margin-top: 20px; color: #aaa; height: 100px; overflow-y: auto; border-top: 1px solid #444; padding-top: 10px; }
</style>
</head>
<body>
  <h3>Interactive Linear Probing Simulator</h3>
  <div class="controls">
    <input type="text" id="keyInput" placeholder="Enter Key (e.g. 42)">
    <button onclick="insertKey()">Insert (Linear Probing)</button>
    <button onclick="resetTable()">Reset</button>
  </div>
  <div class="table-container" id="tableUI"></div>
  <div class="log" id="log">Log: Initialization complete. Table size: 10</div>

<script>
  let tableSize = 10;
  let table = new Array(tableSize).fill(null);

  function render() {
    const container = document.getElementById('tableUI');
    container.innerHTML = '';
    table.forEach((val, i) => {
      const div = document.createElement('div');
      div.className = 'slot' + (val !== null ? ' active' : '');
      div.innerHTML = `<small>${i}</small><br><b>${val === null ? '-' : val}</b>`;
      container.appendChild(div);
    });
  }

  function log(msg) {
    const l = document.getElementById('log');
    l.innerHTML = msg + "<br>" + l.innerHTML;
  }

  async function insertKey() {
    const input = document.getElementById('keyInput');
    const key = input.value;
    if (!key) return;

    let hash = parseInt(key) || key.length; 
    let startIdx = hash % tableSize;
    log(`Hashing "${key}" to index ${startIdx}...`);

    let i = 0;
    while (i < tableSize) {
      let currentIdx = (startIdx + i) % tableSize;
      const slots = document.getElementsByClassName('slot');
      slots[currentIdx].style.backgroundColor = '#442200';
      
      await new Promise(r => setTimeout(r, 400));

      if (table[currentIdx] === null) {
        table[currentIdx] = key;
        log(`Found empty slot at ${currentIdx}. Inserted!`);
        render();
        input.value = '';
        return;
      } else {
        log(`Collision at index ${currentIdx}. Probing next...`);
        slots[currentIdx].style.backgroundColor = '#441111';
      }
      i++;
    }
    log("Error: Table full!");
  }

  function resetTable() {
    table = new Array(tableSize).fill(null);
    render();
  }

  render();
</script>
</body>
</html>
:::

## 8. Worked Examples

### Example 1: Chaining with Modulo Hashing
**Scenario:** Insert keys $\{10, 20, 30, 5, 15\}$ into a hash table of size $m=5$ using $h(k) = k \mod 5$.

1.  **Insert 10:** $10 \mod 5 = 0$. Table: `[ [10], [], [], [], [] ]`
2.  **Insert 20:** $20 \mod 5 = 0$. Collision! Append to list at index 0. Table: `[ [10, 20], [], [], [], [] ]`
3.  **Insert 30:** $30 \mod 5 = 0$. Collision! Table: `[ [10, 20, 30], [], [], [], [] ]`
4.  **Insert 5:** $5 \mod 5 = 0$. Collision! Table: `[ [10, 20, 30, 5], [], [], [], [] ]`
5.  **Insert 15:** $15 \mod 5 = 0$. Collision! Table: `[ [10, 20, 30, 5, 15], [], [], [], [] ]`
**Observation:** This is the worst-case scenario. The hash function is poor for this data, resulting in $O(N)$ lookup.

### Example 2: Linear Probing and Deletion
**Scenario:** Table size $m=10$, $h(k) = k \mod 10$. Insert 12, 22, 32. Then delete 22.

1.  **Insert 12:** $12 \mod 10 = 2$. Slot 2: 12.
2.  **Insert 22:** $22 \mod 10 = 2$. Collision. Probe index 3. Slot 3: 22.
3.  **Insert 32:** $32 \mod 10 = 2$. Collision. Probe 3 (full). Probe index 4. Slot 4: 32.
4.  **Delete 22:**
    - *Incorrect method:* Set Slot 3 to `None`. 
    - *Resulting error:* If we search for 32, we hash to 2, check 3, see `None`, and conclude 32 doesn't exist.
    - *Correct method:* Set Slot 3 to `TOMBSTONE`. 
    - *Search for 32:* Check 2 (12), check 3 (TOMBSTONE - keep going), check 4 (32). Found!

## 9. Comparison with Alternatives

| Approach | Avg Time | Worst Time | Space | Pros | Cons |
|---|---|---|---|---|---|
| **Chaining** | $O(1)$ | $O(n)$ | $O(n+m)$ | Robust to high $\alpha$; Simple deletion. | Pointer overhead; Bad cache locality. |
| **Linear Probing** | $O(1)$ | $O(n)$ | $O(m)$ | Best cache locality; No pointers. | Clustering; Table can fill up. |
| **Double Hashing** | $O(1)$ | $O(n)$ | $O(m)$ | No clustering. | Requires 2 hash functions. |
| **Red-Black Tree** | $O(\log n)$ | $O(\log n)$ | $O(n)$ | Sorted order; Guaranteed performance. | Slower than $O(1)$ avg; Complex. |

## 10. Industry Applications & Real Systems

-   **Python's `dict` Implementation:** Uses open addressing with a specialized pseudo-random probing sequence. Since Python 3.6, dicts are also ordered by maintaining a separate compact array for indices to improve memory efficiency.
-   **Google's Abseil (Swiss Tables):** Uses a sophisticated hash map that leverages SIMD (Single Instruction, Multiple Data) instructions to check 16 slots at once during probing, dramatically reducing the cost of collisions.
-   **Redis:** Uses hashing with chaining for its main key-value store. It implements **incremental rehashing**, where it moves elements from the old table to the new table a few at a time during every command to avoid "stop-the-world" latency spikes.
-   **Database Join Engines:** Hash joins are the industry standard for joining large tables. The database builds a hash table on the smaller table and probes it using the larger table, transforming an $O(N^2)$ nested loop into an $O(N+M)$ operation.

## 11. Practice Problems

### 🟢 Easy
1.  **Static Hashing:** Given a hash table of size 7 and $h(k) = k \mod 7$, show the state after inserting 14, 21, 28, 35 using linear probing.
    *Hint: Watch how the cluster grows at index 0.*
    *Expected complexity: $O(1)$ per insert.*

### 🟡 Medium
2.  **Universal Hashing Proof:** Prove that if $h$ is chosen from a universal family, the expected number of collisions at any slot is less than 1.
    *Hint: Use indicator random variables and the linearity of expectation.*
    *Expected complexity: $O(1)$ amortized.*

3.  **Quadratic Probing Bounds:** Show that if $m$ is a prime number, quadratic probing with $h(k, i) = (h'(k) + i^2) \mod m$ will always find an empty slot if the table is less than half full.

### 🔴 Hard
4.  **Cuckoo Hashing:** Implement a basic Cuckoo Hash Map where each key has two possible locations $h_1(k)$ and $h_2(k)$. If both are full, "kick out" the existing resident and re-insert it in its other location.
    *Hint: You must detect infinite loops and rehash the entire table if one occurs.*
    *Expected complexity: $O(1)$ worst-case lookup.*

5.  **Robin Hood Hashing:** Modify a linear probing hash table so that when probing, if the current key is "further from home" than the existing key in a slot, they swap. This minimizes the variance of probe lengths.

## 12. Interactive Quiz

:::quiz
**Q1: What is the primary disadvantage of Linear Probing compared to Double Hashing?**
- A) Higher memory consumption.
- B) Primary Clustering (long runs of occupied slots).
- C) It requires more hash functions.
- D) It cannot handle deletions.
> B — Linear probing causes keys that hash to adjacent slots to join the same cluster, which grows linearly and degrades performance to $O(N)$.

**Q2: In a hash table using chaining, if the load factor $\alpha = 5$, what is the expected number of elements in each bucket?**
- A) 1
- B) 0.5
- C) 5
- D) $\log(5)$
> C — By the definition of the load factor $\alpha = n/m$, which is the average length of the chains under SUHA.

**Q3: Why is it common to use a prime number for the table size $m$ in the division method?**
- A) Prime numbers are faster for CPU division.
- B) It reduces collisions when keys have periodic patterns.
- C) It ensures the hash table can never be full.
- D) It allows for $O(1)$ worst-case search.
> B — If $m$ is not prime (e.g., $m=10$), and all keys are multiples of 5, they will only ever map to slots 0 and 5. A prime $m$ breaks these correlations.

**Q4: Which collision resolution technique provides the best cache locality?**
- A) Separate Chaining
- B) Double Hashing
- C) Linear Probing
- D) Binary Search Trees
> C — Linear probing accesses contiguous memory slots ($T[i], T[i+1], T[i+2]$), which fits perfectly within a single CPU cache line.

**Q5: What is the purpose of a "Tombstone" in open addressing?**
- A) To mark the end of the entire hash table.
- B) To signify that an element was deleted without breaking probe sequences.
- C) To store the most frequently accessed element.
- D) To prevent the table from rehashing.
> B — Without tombstones, a search would stop at a `None` slot, potentially missing keys that were moved further down the probe sequence before the deletion.
:::

## 13. Interview Preparation

### Conceptual Questions
**Q: Explain how a Hash Map works as if teaching it to a fellow engineer.**
*A: A Hash Map is an associative array that achieves $O(1)$ average-case performance by using a hash function to transform a key into an integer index. This index points to a bucket in an underlying array. When multiple keys hash to the same index (a collision), we use strategies like Chaining (linked lists at each index) or Open Addressing (finding another empty slot in the array). To maintain performance, we monitor the load factor and resize the array when it becomes too crowded.*

**Q: What is the difference between $O(1)$ and "Amortized $O(1)$" in the context of hash tables?**
*A: Standard operations like `get` are $O(1)$ on average. However, `put` is "Amortized $O(1)$" because most insertions are fast, but occasionally an insertion triggers a **resize**. Resizing involves allocating a new array and rehashing all $n$ existing elements, which takes $O(n)$. Because this happens rarely (only after $O(n)$ insertions), the cost averaged over all operations remains constant.*

**Q: How would you handle a scenario where many keys hash to the same value (Hash Flooding Attack)?**
*A: This is a classic DoS attack. If an attacker knows your hash function, they can provide keys that all collide, turning your $O(1)$ table into an $O(n)$ linked list. To prevent this: 1) Use a **cryptographically secure** or **randomized** hash function (like SipHash), and 2) In chaining, convert long linked lists into **Balanced Binary Search Trees** (e.g., Java 8's HashMap uses Red-Black Trees for buckets with > 8 elements).*

### Quick Reference (Cheat Sheet)
| Property | Value |
|---|---|
| Avg Time Complexity | $O(1)$ (Search, Insert, Delete) |
| Worst Time Complexity | $O(n)$ (When all keys collide) |
| Space Complexity | $O(n + m)$ |
| Key Requirement | Must be Immutable and Hashable |
| Resizing Trigger | Load Factor ($\alpha$) > Threshold (0.7 - 0.8) |

## 14. Key Takeaways
1.  **Load Factor is King:** Performance degrades exponentially as $\alpha \to 1$ in open addressing.
2.  **SUHA:** The Simple Uniform Hashing Assumption is the bedrock of hash table analysis, though rarely perfectly met in practice.
3.  **Cache Matters:** In modern systems, Linear Probing often outperforms Chaining due to CPU cache efficiency, despite having more collisions.
4.  **Primes are Friends:** When using the division method, always use a prime number for table size to minimize patterns.
5.  **Rehashing is Expensive:** Always pre-size your hash table if you know the approximate number of elements you'll be storing.
6.  **Security:** Use salted or randomized hash functions to prevent Hash Flooding attacks.

## 15. Common Misconceptions
- ❌ **"Hash tables always have O(1) performance."** → ✅ Performance is $O(1)$ *average* and *expected*. Worst-case is $O(n)$.
- ❌ **"A larger table always means fewer collisions."** → ✅ Not if your hash function is poor (e.g., $h(k) = 1$).
- ❌ **"Chaining is always better than Linear Probing."** → ✅ Chaining uses more memory (pointers) and is less cache-friendly than Linear Probing.

## 16. Further Reading
- **CLRS (Introduction to Algorithms), Chapter 11:** The definitive academic reference on hashing.
- **The Art of Computer Programming (Vol 3), Donald Knuth:** Section 6.4 covers hashing history and math in exhaustive detail.
- **Beautiful Code (Chapter 1):** Brian Kernighan explains a simple, elegant hash table implementation in C.
- **"Swiss Tables" talk by Abseil developers:** Excellent modern industry perspective on SIMD-accelerated hashing.

## 17. Related Topics
- [[complexity-analysis]] — For understanding amortized costs.
- [[dynamic-arrays]] — The underlying mechanism for resizing.
- [[singly-linked-list]] — The building block for Chaining.
- [[string-operations]] — How strings are hashed (Polynomial Rolling Hash).