# Java Collections Framework

## Overview
The Java Collections Framework (JCF) is the most heavily tested topic in placement aptitude and coding rounds. It provides ready-made data structures (List, Set, Map, Queue) that are built on OOP principles — interfaces, generics, and abstract classes. Every software engineer role tests knowledge of when to use which collection and their time complexities.

## Key Concepts

### Core Interfaces
```
Collection
├── List (ordered, allows duplicates)
│   ├── ArrayList
│   ├── LinkedList
│   └── Vector (legacy, thread-safe)
├── Set (no duplicates)
│   ├── HashSet (unordered, O(1) ops)
│   ├── LinkedHashSet (insertion-ordered)
│   └── TreeSet (sorted, O(log n) ops)
└── Queue
    ├── LinkedList (FIFO queue)
    ├── PriorityQueue (min-heap by default)
    └── ArrayDeque (efficient stack and queue)

Map (key-value, not Collection)
├── HashMap (unordered, O(1) avg)
├── LinkedHashMap (insertion-ordered)
├── TreeMap (sorted by key, O(log n))
└── Hashtable (legacy, thread-safe)
```

### Choosing the Right Collection

| Need | Use |
|------|-----|
| Indexed access, frequent reads | `ArrayList` |
| Frequent insertions at head/tail | `LinkedList` or `ArrayDeque` |
| Fast lookup, no order needed | `HashSet` / `HashMap` |
| Sorted order | `TreeSet` / `TreeMap` |
| Insertion order maintained | `LinkedHashSet` / `LinkedHashMap` |
| Priority queue (min/max heap) | `PriorityQueue` |
| Thread-safe | `ConcurrentHashMap`, `CopyOnWriteArrayList` |

### Time Complexity Summary

| Operation | ArrayList | LinkedList | HashSet | TreeSet |
|-----------|-----------|------------|---------|---------|
| add | O(1) amort. | O(1) | O(1) avg | O(log n) |
| get(index) | O(1) | O(n) | N/A | N/A |
| contains | O(n) | O(n) | O(1) avg | O(log n) |
| remove | O(n) | O(1) with iter. | O(1) avg | O(log n) |

### Comparable and Comparator
- `Comparable<T>`: interface for natural ordering. Implement `compareTo(T other)` in the class itself.
```java
class Student implements Comparable<Student> {
    String name; double gpa;
    @Override public int compareTo(Student other) {
        return Double.compare(other.gpa, this.gpa);  // descending by GPA
    }
}
Collections.sort(students);  // uses natural ordering
```

- `Comparator<T>`: external comparator. Useful when you don't own the class or need multiple sort orders.
```java
Comparator<Student> byName = Comparator.comparing(s -> s.name);
students.sort(byName);
// Or with lambda:
students.sort((a, b) -> a.name.compareTo(b.name));
```

### HashMap Internals (Placement Deep Dive)
- Internally uses an array of linked lists (buckets). Java 8+: buckets become red-black trees when size > 8.
- Hash function maps key to bucket index. Collisions handled by chaining.
- `hashCode()` and `equals()` must be consistent. If two objects are `.equals()`, they MUST have the same `hashCode()`. Failing this breaks HashMap behavior.
- Default load factor: 0.75. When 75% full, the table rehashes (doubles and redistributes).

### Iterating Collections
```java
// 1. For-each (preferred for read-only)
for (String s : list) { ... }

// 2. Iterator (safe removal during iteration)
Iterator<String> it = list.iterator();
while (it.hasNext()) {
    if (it.next().equals("remove")) it.remove();  // safe
}

// 3. Stream API (Java 8+)
list.stream()
    .filter(s -> s.startsWith("A"))
    .map(String::toUpperCase)
    .sorted()
    .forEach(System.out::println);
```

**ConcurrentModificationException:** Thrown when you modify a collection directly (not via iterator) during iteration.

## Examples
```java
// Word frequency count using HashMap
Map<String, Integer> freq = new HashMap<>();
for (String word : words) {
    freq.put(word, freq.getOrDefault(word, 0) + 1);
}

// Top K frequent elements using PriorityQueue
PriorityQueue<Map.Entry<String, Integer>> pq =
    new PriorityQueue<>((a, b) -> b.getValue() - a.getValue());
pq.addAll(freq.entrySet());
for (int i = 0; i < k; i++) System.out.println(pq.poll().getKey());
```

## Common Exam Questions
- What is the difference between `ArrayList` and `LinkedList`?
- Why can't we use primitive types as type parameters in generics? (`List<int>` is invalid)
- What is `ConcurrentModificationException`? How do you avoid it?
- How does `HashMap` resolve hash collisions?
- What happens if `hashCode()` always returns the same value? (All keys go to same bucket — O(n) lookup)

## Related Topics
- [[java-classes-objects]] — OOP foundation of JCF
- [[interfaces-abstract-classes]] — Collection and Map are interfaces
- [[java-strings]] — String as Map key — important for interning behavior
