---
course: "artificial-intelligence"
course_title: "Artificial Intelligence"
topic: "informed-search"
title: "Informed Search"
difficulty: "intermediate"
tags: ["ai", "search", "planning", "nlp", "agents", "placement"]
placement_domains: ["AI Engineer", "ML Engineer", "Research Scientist"]
has_interactive: true
has_quiz: true
has_code: true
rag_indexed: true
---

# Informed Search

> Informed search algorithms use problem-specific knowledge in the form of heuristic functions to find solutions more efficiently.

## Overview
Informed search, also known as heuristic search, is a significant improvement over uninformed search strategies. These algorithms have access to problem-specific information that can guide the search towards the goal. This information is provided by a **heuristic function**, which estimates the cost of the cheapest path from a node to the goal. By using this estimate, informed search algorithms can explore the most promising paths first, often finding a solution much more quickly and with less computation than uninformed search.

The two most popular informed search algorithms are Greedy Best-First Search and A* Search. While Greedy search can be very fast, it is not optimal. A* search, on the other hand, is both complete and optimal, provided that the heuristic function is admissible (i.e., it never overestimates the cost to the goal).

## 2. Visual Intuition
:::demo
<div style="background:#1e1e1e;padding:16px;border-radius:10px;color:#e5e7eb;font-family:system-ui,sans-serif">
  <h3 style="margin:0 0 8px 0;color:#7dd3fc">Informed Search - Concept Map</h3>
  <svg width="100%" height="280" viewBox="0 0 640 280" role="img" aria-label="Informed Search visual intuition" style="background:#111827;border-radius:8px">
    <rect x="24" y="28" width="180" height="64" rx="10" fill="#1d4ed8" />
    <text x="114" y="66" text-anchor="middle" fill="#e5e7eb" font-size="14">Problem</text>
    <rect x="230" y="28" width="180" height="64" rx="10" fill="#0f766e" />
    <text x="320" y="66" text-anchor="middle" fill="#e5e7eb" font-size="14">Process</text>
    <rect x="436" y="28" width="180" height="64" rx="10" fill="#7c3aed" />
    <text x="526" y="66" text-anchor="middle" fill="#e5e7eb" font-size="14">Outcome</text>

    <line x1="204" y1="60" x2="230" y2="60" stroke="#93c5fd" stroke-width="3" marker-end="url(#arrow)" />
    <line x1="410" y1="60" x2="436" y2="60" stroke="#93c5fd" stroke-width="3" marker-end="url(#arrow)" />

    <rect x="24" y="130" width="592" height="120" rx="10" fill="#0b1220" stroke="#334155" />
    <text x="320" y="156" text-anchor="middle" fill="#cbd5e1" font-size="14">Key intuition for Informed Search</text>
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
*Caption: An animation of A* search. The algorithm explores promising paths (green) while avoiding more costly ones (red), guided by a heuristic.*

## Core Theory
The core of informed search is the evaluation function `f(n)`, which is used to prioritize nodes in the search space.

**Greedy Best-First Search:**
Greedy search expands the node that appears to be closest to the goal. It uses the heuristic function `h(n)` as its evaluation function:
`f(n) = h(n)`
This approach is "greedy" because it makes the locally optimal choice at each step, hoping to find a global optimum. However, this is not always the case, and Greedy search can be led down a long, suboptimal path.

**A* Search:**
A* search combines the cost to reach the node `g(n)` with the estimated cost to the goal `h(n)`:
`f(n) = g(n) + h(n)`
- `g(n)` is the actual cost of the path from the start node to `n`.
- `h(n)` is the estimated cost of the cheapest path from `n` to the goal.

A* is optimal and complete if the heuristic `h(n)` is **admissible**, meaning it never overestimates the actual cost to the goal. A common example of an admissible heuristic is the straight-line distance between two points on a map.

**Admissibility and Consistency:**
- An admissible heuristic is one that never overestimates the cost.
- A consistent (or monotone) heuristic is one where, for every node `n` and every successor `n'` of `n`, the estimated cost of reaching the goal from `n` is no greater than the cost of getting to `n'` plus the estimated cost of reaching the goal from `n'`.
`h(n) <= c(n, a, n') + h(n')`
All consistent heuristics are also admissible.

## Visual Diagram
```mermaid
graph TD
    subgraph A* Search Node Evaluation
        A[g(n) - Cost from Start]
        B[h(n) - Heuristic (Est. to Goal)]
        A --> C{f(n) = g(n) + h(n)};
        B --> C;
    end
```
*The evaluation function of A* search, which combines the actual cost from the start with the estimated cost to the goal.*

## Code Example
```python
# A simple implementation of A* search
import heapq

def a_star_search(graph, start, goal, heuristic):
    """
    Performs an A* search on a graph.
    """
    frontier = [(0, start)]  # (f(n), node)
    came_from = {}
    cost_so_far = {start: 0}

    while frontier:
        current_cost, current_node = heapq.heappop(frontier)

        if current_node == goal:
            path = []
            while current_node in came_from:
                path.append(current_node)
                current_node = came_from[current_node]
            path.append(start)
            return path[::-1]

        for neighbor in graph.get(current_node, []):
            new_cost = cost_so_far[current_node] + graph[current_node][neighbor]
            if neighbor not in cost_so_far or new_cost < cost_so_far[neighbor]:
                cost_so_far[neighbor] = new_cost
                priority = new_cost + heuristic(neighbor, goal)
                heapq.heappush(frontier, (priority, neighbor))
                came_from[neighbor] = current_node

    return "No path found"

# Example usage
graph = {
    'A': {'B': 1, 'C': 4},
    'B': {'C': 2, 'D': 5},
    'C': {'D': 1},
    'D': {}
}

def heuristic(node, goal):
    # A simple heuristic for this example
    h = {'A': 3, 'B': 2, 'C': 1, 'D': 0}
    return h[node]

print(a_star_search(graph, 'A', 'D', heuristic))
# Expected output: ['A', 'B', 'C', 'D']
```

## Interactive Demo
:::demo
<!-- title: "A* Search Visualization" -->
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { margin:0; background:#0f1117; color:#e5e7eb; font-family: system-ui, sans-serif; font-size:13px; padding:12px; display: flex; justify-content: center; align-items: center; }
  .grid { display: grid; grid-template-columns: repeat(20, 20px); grid-template-rows: repeat(20, 20px); gap: 1px; }
  .cell { width: 20px; height: 20px; background: white; }
  .start { background: green !important; }
  .goal { background: red !important; }
  .obstacle { background: black !important; }
  .open { background: lightblue; }
  .closed { background: lightcoral; }
  .path { background: yellow; }
</style>
</head>
<body>
<div id="grid" class="grid"></div>
<script>
    // This is a simplified A* visualization. A full implementation is complex.
    const COLS = 20;
    const ROWS = 20;
    const grid = document.getElementById('grid');
    let nodes = [];

    class Node {
        constructor(x, y) {
            this.x = x; this.y = y; this.f = 0; this.g = 0; this.h = 0;
            this.neighbors = []; this.previous = undefined; this.wall = false;
            if (Math.random() < 0.3) this.wall = true;
        }
        show(color) {
            const cell = document.getElementById(`cell-${this.x}-${this.y}`);
            cell.style.background = this.wall ? 'black' : color;
        }
    }

    // Setup grid
    for (let i = 0; i < COLS; i++) {
        nodes[i] = new Array(ROWS);
        for (let j = 0; j < ROWS; j++) {
            const cell = document.createElement('div');
            cell.id = `cell-${i}-${j}`;
            cell.className = 'cell';
            grid.appendChild(cell);
            nodes[i][j] = new Node(i, j);
        }
    }
    const start = nodes[0][0];
    const end = nodes[COLS-1][ROWS-1];
    start.wall = false; end.wall = false;

    // A* logic (simplified for visualization)
    let openSet = [start];
    let closedSet = [];

    function heuristic(a, b) {
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    }

    function draw() {
        for (let i = 0; i < COLS; i++) for (let j = 0; j < ROWS; j++) nodes[i][j].show('white');
        for (let node of openSet) node.show('lightblue');
        for (let node of closedSet) node.show('lightcoral');
        
        if (openSet.length > 0) {
            let winner = 0;
            for (let i = 1; i < openSet.length; i++) {
                if (openSet[i].f < openSet[winner].f) winner = i;
            }
            let current = openSet[winner];
            if (current === end) {
                let path = [];
                let temp = current;
                path.push(temp);
                while(temp.previous) {
                    path.push(temp.previous);
                    temp = temp.previous;
                }
                for (let node of path) node.show('yellow');
                return; // Found path
            }
            
            openSet.splice(winner, 1);
            closedSet.push(current);

            // ... (neighbor logic omitted for brevity)
        }
        
        requestAnimationFrame(draw);
    }
    
    start.show('green');
    end.show('red');
    //draw(); // Animation is computationally expensive for a simple demo
    
</script>
</body>
</html>
:::

## Worked Example
**Problem:** Using the graph and heuristic from the code example, trace the execution of A* search from 'A' to 'D'.

**Solution:**
1.  **Initialize:** frontier = `[(3, 'A')]`, cost_so_far = `{'A': 0}`
2.  **Pop 'A':**
    -   Explore 'B': cost = 1. `f('B')` = `g('B')` + `h('B')` = 1 + 2 = 3. Add `(3, 'B')` to frontier.
    -   Explore 'C': cost = 4. `f('C')` = `g('C')` + `h('C')` = 4 + 1 = 5. Add `(5, 'C')` to frontier.
    -   frontier = `[(3, 'B'), (5, 'C')]`
3.  **Pop 'B':**
    -   Explore 'C': cost = 1 (from A) + 2 (from B) = 3. This is cheaper than the previous path to 'C' (cost 4). Update cost and add to frontier. `f('C')` = 3 + 1 = 4. Add `(4, 'C')` to frontier.
    -   Explore 'D': cost = 1 + 5 = 6. `f('D')` = 6 + 0 = 6. Add `(6, 'D')` to frontier.
    -   frontier = `[(4, 'C'), (5, 'C'), (6, 'D')]` (Note: old 'C' is still there but won't be chosen first)
4.  **Pop 'C' (with cost 4):**
    -   Explore 'D': cost = 3 (to 'C') + 1 = 4. Cheaper than 6. Update cost. `f('D')` = 4 + 0 = 4. Add `(4, 'D')` to frontier.
    -   frontier = `[(4, 'D'), (5, 'C'), (6, 'D')]`
5.  **Pop 'D' (with cost 4):** Goal reached. Reconstruct path: D <- C <- B <- A. Path is `['A', 'B', 'C', 'D']`.

## Industry Applications
- **GPS Navigation:** Google Maps and Waze use A* and other heuristic search algorithms to find the fastest route.
- **Video Games:** Pathfinding for non-player characters (NPCs) to navigate game worlds.
- **Robotics:** Motion planning for robots to move from a start to a goal location without colliding with obstacles.
- **Computational Biology:** Sequence alignment in bioinformatics.

## Practice Problems

### Easy
1. What is a heuristic function? Give an example of a heuristic for finding the shortest driving distance between two cities.

### Medium
2. Is the straight-line distance an admissible heuristic for finding the shortest driving distance? Why or why not?

### Hard
3. Explain why A* is optimal if the heuristic is admissible.

## Interactive Quiz
:::quiz
**Q1:** What is the evaluation function f(n) for A* search?
- A) f(n) = h(n)
- B) f(n) = g(n)
- C) f(n) = g(n) + h(n)
- D) f(n) = g(n) - h(n)
> C — A* search combines the cost to reach the node `g(n)` with the estimated cost to the goal `h(n)`.

**Q2:** A heuristic is admissible if it...
- A) Always returns 0.
- B) Never overestimates the cost to the goal.
- C) Always overestimates the cost to the goal.
- D) Is always correct.
> B — An admissible heuristic is optimistic, which is crucial for A*'s optimality.

**Q3:** What is the main advantage of informed search over uninformed search?
- A) It is always optimal.
- B) It has better space complexity.
- C) It uses domain-specific knowledge to search more efficiently.
- D) It is easier to implement.
> C — Informed search algorithms are more efficient because they use heuristics to guide the search.
:::

## Interview Questions

**Q: What is A* search and how does it work?**
*A: A* is a best-first search algorithm that finds the shortest path between two nodes in a graph. It uses an evaluation function f(n) = g(n) + h(n), where g(n) is the cost from the start to node n, and h(n) is a heuristic estimate of the cost from n to the goal. It maintains a priority queue of nodes to visit, always choosing the node with the lowest f(n) value.*

**Q: When would you use Greedy Best-First Search instead of A*?**
*A: You might use Greedy search if you need a solution very quickly and optimality is not a concern. Greedy search only considers the heuristic h(n), so it can be much faster than A*, but it might not find the best path.*

**Q: How do you choose a good heuristic?**
*A: A good heuristic should be a trade-off between accuracy and computation time. A more accurate heuristic will reduce the number of nodes A* needs to explore, but it might be more expensive to compute. The heuristic must also be admissible if you need an optimal solution.*

**Q: Can you give an example of a non-admissible heuristic?**
*A: In a route-finding problem, if your heuristic was the straight-line distance multiplied by 2, it would be non-admissible because it could overestimate the actual driving distance. This could cause A* to find a suboptimal route.*

## Key Takeaways
- Informed search uses heuristics to guide the search.
- A* is a popular informed search algorithm that is both complete and optimal.
- The quality of the heuristic is crucial for the performance of informed search algorithms.
- Admissible heuristics are essential for the optimality of A*.
- Informed search is widely used in pathfinding and other optimization problems.

## Common Misconceptions
- ❌ A* is always the best search algorithm. → ✅ For problems with small search spaces, a simple BFS might be faster due to the overhead of the heuristic.
- ❌ A good heuristic is always a very complex one. → ✅ A simple, fast-to-compute heuristic is often better than a complex, slow one.

## Related Topics
- [[search-algorithms]] — The foundation for informed search.
- [[adversarial-search]] — These algorithms also use heuristics to evaluate game states.
- [[intelligent-agents]] — Agents that use informed search for planning and navigation.
