import json, os

OUT = r"D:\app2\app\tools\course_gen\textbook_syllabi"
os.makedirs(OUT, exist_ok=True)

COURSES = {}

# ─────────────────────────────────────────────────────────────────────────────
# 1. ALGORITHMS
# ─────────────────────────────────────────────────────────────────────────────
COURSES["algorithms"] = {
    "course": "algorithms",
    "title": "Design and Analysis of Algorithms",
    "textbook_refs": ["CLRS 4th Ed", "Kleinberg & Tardos: Algorithm Design", "Skiena: Algorithm Design Manual 3rd Ed"],
    "topics": [
        # ── already existing (kept for ordering reference, NOT written as new slugs) ──
        # overview, asymptotic-analysis, sorting-algorithms, linear-sorting,
        # divide-conquer, recurrence-relations, dynamic-programming, dp-advanced,
        # greedy, graph-algorithms, shortest-path, minimum-spanning-tree,
        # network-flow, backtracking, string-algorithms, suffix-arrays,
        # computational-geometry, randomized-algorithms, amortized-analysis,
        # complexity-theory, approximation-algorithms, online-algorithms,
        # parallel-algorithms, number-theory-algorithms, competitive-programming,
        # interview-prep, placement-guide, index
        # ── NEW subtopics ──
        {"slug": "master-theorem", "title": "Master Theorem: Solving Divide-and-Conquer Recurrences", "section": "Recurrences", "difficulty": "intermediate"},
        {"slug": "akra-bazzi-method", "title": "Akra–Bazzi Method: Generalized Recurrence Analysis", "section": "Recurrences", "difficulty": "advanced"},
        {"slug": "substitution-method", "title": "Substitution Method and Recursion Tree Technique", "section": "Recurrences", "difficulty": "intermediate"},
        {"slug": "binary-search-variations", "title": "Binary Search Variations: Rotated Arrays and Fractional Cascading", "section": "Searching", "difficulty": "intermediate"},
        {"slug": "merge-sort-analysis", "title": "Merge Sort: Inversion Counting and External Sorting", "section": "Sorting", "difficulty": "intermediate"},
        {"slug": "quicksort-analysis", "title": "Quicksort Analysis: Randomized Pivot and Expected Time", "section": "Sorting", "difficulty": "intermediate"},
        {"slug": "comparison-lower-bounds", "title": "Comparison-Based Sorting Lower Bound: Decision Tree Model", "section": "Sorting", "difficulty": "advanced"},
        {"slug": "order-statistics", "title": "Order Statistics: Median-of-Medians and Linear Selection", "section": "Searching", "difficulty": "advanced"},
        {"slug": "dag-algorithms", "title": "DAG Algorithms: Topological Sort and Longest Path", "section": "Graph Algorithms", "difficulty": "intermediate"},
        {"slug": "strongly-connected-components", "title": "Strongly Connected Components: Kosaraju and Tarjan Algorithms", "section": "Graph Algorithms", "difficulty": "intermediate"},
        {"slug": "bridge-articulation-points", "title": "Bridges and Articulation Points: Tarjan's DFS-Based Algorithm", "section": "Graph Algorithms", "difficulty": "advanced"},
        {"slug": "euler-circuits", "title": "Euler Circuits and Paths: Hierholzer's Algorithm", "section": "Graph Algorithms", "difficulty": "intermediate"},
        {"slug": "bipartite-matching", "title": "Bipartite Matching: Hopcroft–Karp and Hungarian Algorithms", "section": "Network Flow", "difficulty": "advanced"},
        {"slug": "matrix-chain-multiplication", "title": "Matrix Chain Multiplication: Optimal Parenthesization via DP", "section": "Dynamic Programming", "difficulty": "intermediate"},
        {"slug": "lcs-edit-distance", "title": "LCS and Edit Distance: Sequence Alignment Problems", "section": "Dynamic Programming", "difficulty": "intermediate"},
        {"slug": "knapsack-variants", "title": "Knapsack Problem Variants: 0/1, Bounded, and Unbounded", "section": "Dynamic Programming", "difficulty": "intermediate"},
        {"slug": "dp-on-trees", "title": "Dynamic Programming on Trees: Subtree DP and Rerooting", "section": "Dynamic Programming", "difficulty": "advanced"},
        {"slug": "bitmask-dp", "title": "Bitmask Dynamic Programming: TSP and Set-Cover Problems", "section": "Dynamic Programming", "difficulty": "advanced"},
        {"slug": "digit-dp", "title": "Digit Dynamic Programming: Counting Numbers with Constraints", "section": "Dynamic Programming", "difficulty": "advanced"},
        {"slug": "fast-fourier-transform", "title": "Fast Fourier Transform: Polynomial Multiplication and NTT", "section": "Advanced Topics", "difficulty": "advanced"},
        {"slug": "matrix-multiplication-strassen", "title": "Matrix Multiplication: Strassen's Algorithm and Cache-Oblivious Methods", "section": "Divide and Conquer", "difficulty": "advanced"},
        {"slug": "segment-tree-algorithms", "title": "Segment Trees and Lazy Propagation for Range Queries", "section": "Data Structures for Algorithms", "difficulty": "advanced"},
        {"slug": "fenwick-tree-algorithms", "title": "Fenwick Trees (BIT): Prefix Sums and Point Updates", "section": "Data Structures for Algorithms", "difficulty": "intermediate"},
        {"slug": "sparse-table", "title": "Sparse Table and Range Minimum Query in O(1)", "section": "Data Structures for Algorithms", "difficulty": "intermediate"},
        {"slug": "string-kmp-z", "title": "KMP and Z-Algorithm: Linear-Time String Matching", "section": "String Algorithms", "difficulty": "intermediate"},
        {"slug": "aho-corasick", "title": "Aho–Corasick Automaton: Multi-Pattern String Matching", "section": "String Algorithms", "difficulty": "advanced"},
        {"slug": "suffix-automaton", "title": "Suffix Automaton: Optimal Substring Data Structure", "section": "String Algorithms", "difficulty": "advanced"},
        {"slug": "manacher-algorithm", "title": "Manacher's Algorithm: All Palindromic Substrings in Linear Time", "section": "String Algorithms", "difficulty": "advanced"},
        {"slug": "convex-hull-algorithms", "title": "Convex Hull: Graham Scan, Jarvis March, and Chan's Algorithm", "section": "Computational Geometry", "difficulty": "intermediate"},
        {"slug": "sweep-line-algorithms", "title": "Sweep Line Algorithms: Interval Scheduling and Segment Intersection", "section": "Computational Geometry", "difficulty": "advanced"},
        {"slug": "flow-matching-advanced", "title": "Advanced Flow: Min-Cost Max-Flow and Circulation Problems", "section": "Network Flow", "difficulty": "advanced"},
        {"slug": "np-completeness-reductions", "title": "NP-Completeness: Polynomial Reductions and Cook–Levin Theorem", "section": "Complexity Theory", "difficulty": "advanced"},
        {"slug": "approximation-schemes", "title": "Approximation Schemes: PTAS, FPTAS, and Inapproximability", "section": "Approximation Algorithms", "difficulty": "advanced"},
        {"slug": "lp-based-algorithms", "title": "LP Relaxation and Primal-Dual Algorithms", "section": "Approximation Algorithms", "difficulty": "advanced"},
        {"slug": "cache-oblivious-algorithms", "title": "Cache-Oblivious Algorithms: Memory-Efficient Computation Models", "section": "Advanced Topics", "difficulty": "advanced"},
        {"slug": "external-memory-algorithms", "title": "External Memory Algorithms: I/O Complexity and B-Trees", "section": "Advanced Topics", "difficulty": "advanced"},
        {"slug": "skip-lists", "title": "Skip Lists: Probabilistic Data Structure for Search", "section": "Data Structures for Algorithms", "difficulty": "intermediate"},
        {"slug": "treap-algorithms", "title": "Treap: Randomized BST with Implicit Keys", "section": "Data Structures for Algorithms", "difficulty": "advanced"},
        {"slug": "heavy-light-decomposition", "title": "Heavy-Light Decomposition: Path Queries on Trees", "section": "Data Structures for Algorithms", "difficulty": "advanced"},
        {"slug": "centroid-decomposition", "title": "Centroid Decomposition: Distance Problems on Trees", "section": "Data Structures for Algorithms", "difficulty": "advanced"},
        {"slug": "mo-algorithm", "title": "Mo's Algorithm: Offline Range Queries in O((N+Q)√N)", "section": "Advanced Topics", "difficulty": "advanced"},
    ]
}

# ─────────────────────────────────────────────────────────────────────────────
# 2. ARTIFICIAL INTELLIGENCE
# ─────────────────────────────────────────────────────────────────────────────
COURSES["artificial-intelligence"] = {
    "course": "artificial-intelligence",
    "title": "Artificial Intelligence: A Modern Approach",
    "textbook_refs": ["Russell & Norvig: AIMA 4th Ed", "Poole & Mackworth: Artificial Intelligence 2nd Ed", "Mitchell: Machine Learning"],
    "topics": [
        {"slug": "heuristic-design", "title": "Heuristic Function Design: Admissibility, Consistency, and Dominance", "section": "Search", "difficulty": "intermediate"},
        {"slug": "bidirectional-search", "title": "Bidirectional Search and Meet-in-the-Middle Strategies", "section": "Search", "difficulty": "intermediate"},
        {"slug": "local-search-optimization", "title": "Local Search: Hill Climbing, Simulated Annealing, and Tabu Search", "section": "Search", "difficulty": "intermediate"},
        {"slug": "monte-carlo-tree-search", "title": "Monte Carlo Tree Search: UCT and Game Tree Exploration", "section": "Adversarial Search", "difficulty": "advanced"},
        {"slug": "alpha-beta-enhancements", "title": "Alpha-Beta Pruning Enhancements: MTD(f) and Iterative Deepening", "section": "Adversarial Search", "difficulty": "advanced"},
        {"slug": "arc-consistency", "title": "Arc Consistency (AC-3) and Constraint Propagation Algorithms", "section": "CSP", "difficulty": "intermediate"},
        {"slug": "temporal-logic", "title": "Temporal Logic: LTL and CTL for Reasoning About Time", "section": "Logic and Knowledge", "difficulty": "advanced"},
        {"slug": "description-logics", "title": "Description Logics and OWL Ontologies", "section": "Knowledge Representation", "difficulty": "advanced"},
        {"slug": "forward-backward-chaining", "title": "Forward and Backward Chaining: Rule-Based Inference", "section": "Logic and Knowledge", "difficulty": "intermediate"},
        {"slug": "markov-chains", "title": "Markov Chains and Stationary Distributions", "section": "Probabilistic Models", "difficulty": "intermediate"},
        {"slug": "hidden-markov-models", "title": "Hidden Markov Models: Forward-Backward and Viterbi Algorithms", "section": "Probabilistic Models", "difficulty": "intermediate"},
        {"slug": "kalman-filters", "title": "Kalman Filters and Extended Kalman Filters for State Estimation", "section": "Probabilistic Models", "difficulty": "advanced"},
        {"slug": "particle-filters", "title": "Particle Filters: Sequential Monte Carlo Methods", "section": "Probabilistic Models", "difficulty": "advanced"},
        {"slug": "conditional-independence", "title": "Conditional Independence and d-Separation in Bayesian Networks", "section": "Probabilistic Models", "difficulty": "advanced"},
        {"slug": "causal-reasoning", "title": "Causal Reasoning: Interventions and Counterfactuals (do-calculus)", "section": "Probabilistic Models", "difficulty": "advanced"},
        {"slug": "q-learning-deep-rl", "title": "Q-Learning to Deep Q-Networks: Value-Based Reinforcement Learning", "section": "Reinforcement Learning", "difficulty": "advanced"},
        {"slug": "policy-gradient-methods", "title": "Policy Gradient Methods: REINFORCE and Actor-Critic Architectures", "section": "Reinforcement Learning", "difficulty": "advanced"},
        {"slug": "speech-understanding", "title": "Speech Understanding: ASR Pipelines and Acoustic Modeling", "section": "NLP", "difficulty": "intermediate"},
        {"slug": "semantic-parsing", "title": "Semantic Parsing: Mapping Language to Logical Forms", "section": "NLP", "difficulty": "advanced"},
        {"slug": "image-recognition-ai", "title": "Image Recognition and Scene Understanding Pipelines", "section": "Computer Vision AI", "difficulty": "intermediate"},
        {"slug": "classical-planning-pddl", "title": "Classical Planning: PDDL, STRIPS, and GraphPlan", "section": "Planning", "difficulty": "advanced"},
        {"slug": "hierarchical-task-networks", "title": "Hierarchical Task Networks (HTN) and Partial-Order Planning", "section": "Planning", "difficulty": "advanced"},
        {"slug": "swarm-intelligence", "title": "Swarm Intelligence: Ant Colony Optimization and Particle Swarms", "section": "Evolutionary AI", "difficulty": "intermediate"},
        {"slug": "evolutionary-strategies", "title": "Evolutionary Strategies and CMA-ES for Black-Box Optimization", "section": "Evolutionary AI", "difficulty": "advanced"},
        {"slug": "neural-symbolic-integration", "title": "Neural-Symbolic Integration: Combining Learning and Reasoning", "section": "Advanced AI", "difficulty": "advanced"},
        {"slug": "explainable-ai", "title": "Explainable AI (XAI): LIME, SHAP, and Interpretability Methods", "section": "AI Ethics and Safety", "difficulty": "intermediate"},
        {"slug": "ai-safety", "title": "AI Safety: Alignment, Robustness, and Adversarial Attacks", "section": "AI Ethics and Safety", "difficulty": "advanced"},
        {"slug": "federated-learning-ai", "title": "Federated Learning: Privacy-Preserving Distributed AI", "section": "Advanced AI", "difficulty": "advanced"},
        {"slug": "knowledge-graphs", "title": "Knowledge Graphs: Construction, Embedding, and Querying (SPARQL)", "section": "Knowledge Representation", "difficulty": "intermediate"},
        {"slug": "ai-hardware-accelerators", "title": "AI Hardware: GPUs, TPUs, and Neuromorphic Computing", "section": "AI Systems", "difficulty": "intermediate"},
    ]
}

# ─────────────────────────────────────────────────────────────────────────────
# 3. COMPILER DESIGN
# ─────────────────────────────────────────────────────────────────────────────
COURSES["compiler-design"] = {
    "course": "compiler-design",
    "title": "Compiler Design: Principles, Techniques, and Tools",
    "textbook_refs": ["Aho, Lam, Sethi, Ullman: Compilers (Dragon Book) 2nd Ed", "Cooper & Torczon: Engineering a Compiler 3rd Ed", "Appel: Modern Compiler Implementation"],
    "topics": [
        {"slug": "compiler-overview-phases", "title": "Compiler Architecture: Phases, Passes, and Toolchain Overview", "section": "Introduction", "difficulty": "beginner"},
        {"slug": "formal-languages", "title": "Formal Languages: Regular, Context-Free, and Context-Sensitive Grammars", "section": "Formal Theory", "difficulty": "beginner"},
        {"slug": "regular-expressions-theory", "title": "Regular Expressions: Syntax, Semantics, and Kleene's Theorem", "section": "Lexical Analysis", "difficulty": "beginner"},
        {"slug": "nfa-dfa-construction", "title": "NFA to DFA Construction: Subset Construction and Minimization", "section": "Lexical Analysis", "difficulty": "intermediate"},
        {"slug": "dfa-minimization", "title": "DFA Minimization: Hopcroft's Algorithm and Table-Filling Method", "section": "Lexical Analysis", "difficulty": "intermediate"},
        {"slug": "tokenization-patterns", "title": "Tokenization: Token Patterns, Lexeme Recognition, and Reserved Words", "section": "Lexical Analysis", "difficulty": "beginner"},
        {"slug": "context-free-grammars", "title": "Context-Free Grammars: Derivations, Parse Trees, and Ambiguity", "section": "Syntax Analysis", "difficulty": "intermediate"},
        {"slug": "cfg-transformations", "title": "CFG Transformations: Eliminating Ambiguity, Left Recursion, and Left Factoring", "section": "Syntax Analysis", "difficulty": "intermediate"},
        {"slug": "first-follow-sets", "title": "FIRST and FOLLOW Sets: Computing Parsing Table Entries", "section": "Syntax Analysis", "difficulty": "intermediate"},
        {"slug": "top-down-parsing-ll", "title": "Top-Down Parsing: Recursive Descent and LL(1) Parsers", "section": "Syntax Analysis", "difficulty": "intermediate"},
        {"slug": "bottom-up-parsing-lr", "title": "Bottom-Up Parsing: Shift-Reduce Parsing and LR(0) Automata", "section": "Syntax Analysis", "difficulty": "intermediate"},
        {"slug": "slr-lalr-parsing", "title": "SLR(1) and LALR(1) Parsers: Construction and Conflict Resolution", "section": "Syntax Analysis", "difficulty": "advanced"},
        {"slug": "lr1-canonical-parsing", "title": "Canonical LR(1) Parsers and Comparison with LALR(1)", "section": "Syntax Analysis", "difficulty": "advanced"},
        {"slug": "error-recovery-parsing", "title": "Error Recovery in Parsers: Panic Mode and Phrase-Level Recovery", "section": "Syntax Analysis", "difficulty": "intermediate"},
        {"slug": "ast-construction", "title": "Abstract Syntax Tree Construction and Traversal Strategies", "section": "Intermediate Representation", "difficulty": "intermediate"},
        {"slug": "symbol-table-design", "title": "Symbol Table Design: Scope Rules, Hashing, and Block Structure", "section": "Semantic Analysis", "difficulty": "intermediate"},
        {"slug": "type-systems", "title": "Type Systems: Type Rules, Soundness, and Completeness", "section": "Semantic Analysis", "difficulty": "advanced"},
        {"slug": "type-checking-inference", "title": "Type Checking and Type Inference: Hindley-Milner Algorithm", "section": "Semantic Analysis", "difficulty": "advanced"},
        {"slug": "scope-binding-analysis", "title": "Scope Analysis and Name Binding: Static vs Dynamic Scoping", "section": "Semantic Analysis", "difficulty": "intermediate"},
        {"slug": "semantic-actions", "title": "Semantic Actions in Parsers: Syntax-Directed Translation Schemes", "section": "Semantic Analysis", "difficulty": "intermediate"},
        {"slug": "three-address-code", "title": "Three-Address Code: Quadruples, Triples, and SSA Form", "section": "Intermediate Code", "difficulty": "intermediate"},
        {"slug": "ssa-form", "title": "Static Single Assignment (SSA) Form: Construction and Dominance Frontiers", "section": "Intermediate Code", "difficulty": "advanced"},
        {"slug": "control-flow-analysis", "title": "Control Flow Analysis: Basic Blocks, CFG Construction, and Dominators", "section": "Code Optimization", "difficulty": "advanced"},
        {"slug": "data-flow-analysis", "title": "Data Flow Analysis: Reaching Definitions, Live Variables, and Available Expressions", "section": "Code Optimization", "difficulty": "advanced"},
        {"slug": "loop-optimizations", "title": "Loop Optimizations: Induction Variables, Loop Invariant Code Motion, and Unrolling", "section": "Code Optimization", "difficulty": "advanced"},
        {"slug": "peephole-optimization", "title": "Peephole Optimization: Window-Based Local Transformations", "section": "Code Optimization", "difficulty": "intermediate"},
        {"slug": "register-allocation", "title": "Register Allocation: Graph Coloring, Spilling, and Coalescing", "section": "Code Generation", "difficulty": "advanced"},
        {"slug": "instruction-selection", "title": "Instruction Selection: Tree Pattern Matching and IBURG", "section": "Code Generation", "difficulty": "advanced"},
        {"slug": "instruction-scheduling", "title": "Instruction Scheduling: List Scheduling and Software Pipelining", "section": "Code Generation", "difficulty": "advanced"},
        {"slug": "calling-conventions", "title": "Calling Conventions, Stack Frames, and Function Prologue/Epilogue", "section": "Runtime", "difficulty": "intermediate"},
        {"slug": "runtime-environments", "title": "Runtime Environments: Activation Records, Heap Management, and Closures", "section": "Runtime", "difficulty": "intermediate"},
        {"slug": "garbage-collection", "title": "Garbage Collection: Mark-Sweep, Reference Counting, and Generational GC", "section": "Runtime", "difficulty": "advanced"},
        {"slug": "jit-compilation", "title": "Just-in-Time Compilation: Tracing JIT, Method JIT, and Deoptimization", "section": "Advanced Compilation", "difficulty": "advanced"},
        {"slug": "interprocedural-analysis", "title": "Interprocedural Analysis: Call Graphs, Inlining, and Points-To Analysis", "section": "Advanced Compilation", "difficulty": "advanced"},
        {"slug": "linking-loading", "title": "Linking and Loading: Object Files, Relocation, and Dynamic Linking", "section": "Runtime", "difficulty": "intermediate"},
        {"slug": "compiler-tools-flex-bison", "title": "Compiler Construction Tools: Flex, Bison, and ANTLR", "section": "Practical Compiler Construction", "difficulty": "intermediate"},
        {"slug": "llvm-architecture", "title": "LLVM Architecture: IR, Pass Manager, and Backend Code Generation", "section": "Modern Compilers", "difficulty": "advanced"},
        {"slug": "wasm-compilation", "title": "WebAssembly Compilation: Stack Machine IR and Portability", "section": "Modern Compilers", "difficulty": "advanced"},
        {"slug": "language-implementation-patterns", "title": "Language Implementation Patterns: Interpreters, Transpilers, and VMs", "section": "Modern Compilers", "difficulty": "advanced"},
        {"slug": "placement-guide", "title": "Placement Guide: Compiler Design Interview Questions and Career Paths", "section": "Career", "difficulty": "beginner"},
    ]
}

# ─────────────────────────────────────────────────────────────────────────────
# 4. COMPUTER NETWORKS
# ─────────────────────────────────────────────────────────────────────────────
COURSES["computer-networks"] = {
    "course": "computer-networks",
    "title": "Computer Networks: A Top-Down Approach",
    "textbook_refs": ["Kurose & Ross: Computer Networking 8th Ed", "Tanenbaum & Wetherall: Computer Networks 6th Ed", "Stevens: TCP/IP Illustrated Vol 1"],
    "topics": [
        {"slug": "network-history-evolution", "title": "History and Evolution of Computer Networks: ARPANET to 5G", "section": "Introduction", "difficulty": "beginner"},
        {"slug": "osi-model-deep-dive", "title": "OSI Seven-Layer Model: Detailed Functions and Service Primitives", "section": "Network Models", "difficulty": "beginner"},
        {"slug": "tcp-ip-stack", "title": "TCP/IP Protocol Stack: Layers, Encapsulation, and Demultiplexing", "section": "Network Models", "difficulty": "beginner"},
        {"slug": "physical-layer", "title": "Physical Layer: Signals, Bandwidth, Nyquist Theorem, and Shannon's Capacity", "section": "Physical Layer", "difficulty": "beginner"},
        {"slug": "transmission-media", "title": "Transmission Media: Guided (Copper, Fiber) and Unguided (Wireless)", "section": "Physical Layer", "difficulty": "beginner"},
        {"slug": "encoding-modulation", "title": "Digital Encoding and Modulation: NRZ, Manchester, QAM, and OFDM", "section": "Physical Layer", "difficulty": "intermediate"},
        {"slug": "error-detection-correction", "title": "Error Detection and Correction: CRC, Hamming Codes, and Reed-Solomon", "section": "Data Link Layer", "difficulty": "intermediate"},
        {"slug": "framing-protocols", "title": "Framing Protocols: Byte Stuffing, Bit Stuffing, and HDLC", "section": "Data Link Layer", "difficulty": "intermediate"},
        {"slug": "mac-protocols", "title": "Multiple Access Protocols: TDMA, FDMA, CDMA, and Contention-Based", "section": "Data Link Layer", "difficulty": "intermediate"},
        {"slug": "csma-cd-ca", "title": "CSMA/CD and CSMA/CA: Collision Detection and Avoidance", "section": "Data Link Layer", "difficulty": "intermediate"},
        {"slug": "ethernet-standards", "title": "Ethernet Standards: 10/100/1G/10G Ethernet and Frame Format", "section": "LAN Technologies", "difficulty": "beginner"},
        {"slug": "switching-bridging", "title": "Switches and Bridges: MAC Learning, Forwarding Tables, and STP", "section": "LAN Technologies", "difficulty": "intermediate"},
        {"slug": "vlans-trunking", "title": "VLANs and Trunking: 802.1Q Tagging and Inter-VLAN Routing", "section": "LAN Technologies", "difficulty": "intermediate"},
        {"slug": "ip-addressing-subnetting", "title": "IP Addressing and Subnetting: CIDR, VLSM, and Supernetting", "section": "Network Layer", "difficulty": "intermediate"},
        {"slug": "ipv6", "title": "IPv6: Address Space, Header Format, Transition Mechanisms, and NDP", "section": "Network Layer", "difficulty": "intermediate"},
        {"slug": "arp-rarp", "title": "ARP and RARP: Address Resolution and Reverse Address Resolution", "section": "Network Layer", "difficulty": "beginner"},
        {"slug": "icmp-ping-traceroute", "title": "ICMP: Error Reporting, Ping, and Traceroute Implementation", "section": "Network Layer", "difficulty": "intermediate"},
        {"slug": "routing-protocols-rip-ospf", "title": "Intra-Domain Routing: RIP (Distance Vector) and OSPF (Link State)", "section": "Network Layer", "difficulty": "intermediate"},
        {"slug": "bgp-interdomain-routing", "title": "BGP: Internet's Inter-Domain Routing Protocol and Policy Routing", "section": "Network Layer", "difficulty": "advanced"},
        {"slug": "nat-pat", "title": "NAT and PAT: Network Address Translation, Port Forwarding, and Traversal", "section": "Network Layer", "difficulty": "intermediate"},
        {"slug": "multicast-routing", "title": "IP Multicasting: IGMP, PIM, and Multicast Routing Trees", "section": "Network Layer", "difficulty": "advanced"},
        {"slug": "tcp-deep-dive", "title": "TCP Protocol Deep Dive: Connection Setup, Teardown, and State Machine", "section": "Transport Layer", "difficulty": "intermediate"},
        {"slug": "tcp-flow-congestion-control", "title": "TCP Flow and Congestion Control: Slow Start, CUBIC, and BBR", "section": "Transport Layer", "difficulty": "advanced"},
        {"slug": "udp-real-time", "title": "UDP and Real-Time Protocols: RTP, RTCP, and WebRTC", "section": "Transport Layer", "difficulty": "intermediate"},
        {"slug": "socket-programming", "title": "Socket Programming: TCP/UDP Sockets, Non-Blocking I/O, and epoll", "section": "Transport Layer", "difficulty": "intermediate"},
        {"slug": "quic-http3", "title": "QUIC and HTTP/3: Modern Transport Protocol Design", "section": "Transport Layer", "difficulty": "advanced"},
        {"slug": "dns", "title": "DNS: Hierarchical Resolution, Caching, Resource Records, and DNSSEC", "section": "Application Layer", "difficulty": "intermediate"},
        {"slug": "http-https", "title": "HTTP/1.1 to HTTP/2: Request-Response, Caching, and Multiplexing", "section": "Application Layer", "difficulty": "intermediate"},
        {"slug": "smtp-pop3-imap", "title": "Email Protocols: SMTP, POP3, IMAP, and MIME Encoding", "section": "Application Layer", "difficulty": "beginner"},
        {"slug": "ftp-ssh-protocols", "title": "FTP, SSH, and Telnet: File Transfer and Secure Remote Access", "section": "Application Layer", "difficulty": "beginner"},
        {"slug": "cdn-content-delivery", "title": "Content Delivery Networks: Anycast, Edge Caching, and Load Balancing", "section": "Application Layer", "difficulty": "intermediate"},
        {"slug": "dhcp-protocol", "title": "DHCP: Dynamic Host Configuration, DORA Process, and Options", "section": "Application Layer", "difficulty": "beginner"},
        {"slug": "ssl-tls-certificates", "title": "SSL/TLS: Handshake Protocol, Certificate Chains, and PKI", "section": "Network Security", "difficulty": "advanced"},
        {"slug": "firewall-ids-ips", "title": "Firewalls, IDS, and IPS: Packet Filtering, Deep Inspection, and Snort", "section": "Network Security", "difficulty": "intermediate"},
        {"slug": "vpn-tunneling", "title": "VPN Technologies: IPSec, L2TP, OpenVPN, and WireGuard", "section": "Network Security", "difficulty": "intermediate"},
        {"slug": "wireless-networks-80211", "title": "IEEE 802.11 Wi-Fi: MAC Protocol, CSMA/CA, and 802.11ax (Wi-Fi 6)", "section": "Wireless Networks", "difficulty": "intermediate"},
        {"slug": "mobile-networks-4g-5g", "title": "Cellular Networks: LTE/4G Architecture and 5G NR Technologies", "section": "Wireless Networks", "difficulty": "advanced"},
        {"slug": "sdn-network-virtualization", "title": "Software-Defined Networking: OpenFlow, Control Plane Separation, and NFV", "section": "Modern Networks", "difficulty": "advanced"},
        {"slug": "overlay-p2p-networks", "title": "Overlay Networks and P2P: DHT, Chord, BitTorrent, and Kademlia", "section": "Modern Networks", "difficulty": "advanced"},
        {"slug": "network-qos", "title": "Quality of Service: DiffServ, IntServ, Traffic Shaping, and RSVP", "section": "Network Performance", "difficulty": "advanced"},
        {"slug": "network-measurement-tools", "title": "Network Measurement and Monitoring: Wireshark, NetFlow, and SNMP", "section": "Network Management", "difficulty": "intermediate"},
        {"slug": "placement-guide", "title": "Placement Guide: Computer Networks Interview Questions and Career Paths", "section": "Career", "difficulty": "beginner"},
    ]
}

# ─────────────────────────────────────────────────────────────────────────────
# 5. COMPUTER ORGANIZATION
# ─────────────────────────────────────────────────────────────────────────────
COURSES["computer-organization"] = {
    "course": "computer-organization",
    "title": "Computer Organization and Architecture",
    "textbook_refs": ["Patterson & Hennessy: Computer Organization and Design (RISC-V Ed)", "Tanenbaum: Structured Computer Organization 6th Ed", "Hamacher: Computer Organization and Embedded Systems"],
    "topics": [
        {"slug": "boolean-functions-minimization", "title": "Boolean Functions and Minimization: Karnaugh Maps and Quine-McCluskey", "section": "Digital Circuits", "difficulty": "beginner"},
        {"slug": "combinational-circuit-design", "title": "Combinational Circuit Design: Adders, Subtractors, Comparators, and Muxes", "section": "Digital Circuits", "difficulty": "beginner"},
        {"slug": "sequential-circuit-design", "title": "Sequential Circuit Design: Flip-Flops, Registers, and Counters", "section": "Digital Circuits", "difficulty": "intermediate"},
        {"slug": "number-representations", "title": "Number Representations: Twos Complement, IEEE 754 Floating Point", "section": "Data Representation", "difficulty": "beginner"},
        {"slug": "integer-arithmetic-unit", "title": "Integer Arithmetic Unit: Carry-Lookahead Adders and Booth Multiplier", "section": "ALU Design", "difficulty": "intermediate"},
        {"slug": "floating-point-arithmetic", "title": "Floating-Point Arithmetic: IEEE 754 Operations and Rounding Modes", "section": "ALU Design", "difficulty": "intermediate"},
        {"slug": "risc-vs-cisc", "title": "RISC vs CISC: Architecture Philosophy and Real-World Trade-offs", "section": "ISA", "difficulty": "beginner"},
        {"slug": "risc-v-isa", "title": "RISC-V ISA: Instruction Formats, Registers, and Base Integer Instructions", "section": "ISA", "difficulty": "intermediate"},
        {"slug": "x86-isa", "title": "x86 and x86-64 ISA: Key Instructions and Programming Model", "section": "ISA", "difficulty": "intermediate"},
        {"slug": "addressing-modes", "title": "Addressing Modes: Immediate, Register, Direct, Indirect, and Indexed", "section": "ISA", "difficulty": "beginner"},
        {"slug": "datapath-design", "title": "Single-Cycle Datapath Design: ALU, Register File, and Control", "section": "CPU Design", "difficulty": "intermediate"},
        {"slug": "control-unit-design", "title": "Control Unit Design: Hardwired and Microprogrammed Control", "section": "CPU Design", "difficulty": "intermediate"},
        {"slug": "pipeline-hazards", "title": "Pipeline Hazards: Data, Control, and Structural Hazards and Solutions", "section": "Pipelining", "difficulty": "advanced"},
        {"slug": "out-of-order-execution", "title": "Out-of-Order Execution: Tomasulo Algorithm and Reorder Buffer", "section": "Pipelining", "difficulty": "advanced"},
        {"slug": "branch-prediction", "title": "Branch Prediction: Static, Dynamic, and Tournament Predictors", "section": "Pipelining", "difficulty": "advanced"},
        {"slug": "superscalar-vliw", "title": "Superscalar and VLIW Processors: Instruction-Level Parallelism", "section": "Advanced CPU", "difficulty": "advanced"},
        {"slug": "cache-design", "title": "Cache Design: Direct-Mapped, Set-Associative, and Fully-Associative", "section": "Memory Hierarchy", "difficulty": "intermediate"},
        {"slug": "cache-replacement-policies", "title": "Cache Replacement Policies: LRU, FIFO, Clock, and Belady's Optimal", "section": "Memory Hierarchy", "difficulty": "intermediate"},
        {"slug": "cache-coherence", "title": "Cache Coherence Protocols: MSI, MESI, and Directory-Based Coherence", "section": "Memory Hierarchy", "difficulty": "advanced"},
        {"slug": "virtual-memory-hardware", "title": "Virtual Memory Hardware: TLB, Page Tables, and Multi-Level Paging", "section": "Memory Hierarchy", "difficulty": "intermediate"},
        {"slug": "dram-sdram", "title": "DRAM and SDRAM: Internal Organization, Timing, and DDR Standards", "section": "Memory Devices", "difficulty": "intermediate"},
        {"slug": "storage-systems", "title": "Storage Systems: HDD Mechanics, SSD Flash, and NVMe Interface", "section": "I/O Systems", "difficulty": "intermediate"},
        {"slug": "io-interface-buses", "title": "I/O Interfaces and Buses: PCI Express, USB, SATA, and I2C", "section": "I/O Systems", "difficulty": "intermediate"},
        {"slug": "interrupt-dma", "title": "Interrupts and DMA: Programmed I/O, Interrupt-Driven, and DMA Transfer", "section": "I/O Systems", "difficulty": "intermediate"},
        {"slug": "multicore-smp", "title": "Multicore and SMP Architecture: Memory Consistency and Synchronization", "section": "Parallel Architecture", "difficulty": "advanced"},
        {"slug": "gpu-architecture", "title": "GPU Architecture: SIMD, Warps, Memory Hierarchy, and CUDA Model", "section": "Parallel Architecture", "difficulty": "advanced"},
        {"slug": "embedded-systems-arch", "title": "Embedded Systems Architecture: Microcontrollers, Real-Time Constraints", "section": "Embedded Systems", "difficulty": "intermediate"},
        {"slug": "power-performance-design", "title": "Power and Performance: Dynamic Voltage Scaling, Amdahl's Law, Roofline Model", "section": "Performance Analysis", "difficulty": "advanced"},
        {"slug": "memory-consistency-models", "title": "Memory Consistency Models: Sequential Consistency, TSO, and RVWMO", "section": "Parallel Architecture", "difficulty": "advanced"},
        {"slug": "placement-guide", "title": "Placement Guide: Computer Organization Interview Questions and GATE Preparation", "section": "Career", "difficulty": "beginner"},
    ]
}

# ─────────────────────────────────────────────────────────────────────────────
# 6. DATA STRUCTURES
# ─────────────────────────────────────────────────────────────────────────────
COURSES["data-structures"] = {
    "course": "data-structures",
    "title": "Data Structures and Algorithms: Foundations",
    "textbook_refs": ["CLRS 4th Ed", "Goodrich & Tamassia: Data Structures and Algorithms in Python", "Sedgewick & Wayne: Algorithms 4th Ed"],
    "topics": [
        {"slug": "complexity-analysis", "title": "Complexity Analysis: Big-O, Theta, Omega, and Space Complexity", "section": "Foundations", "difficulty": "beginner"},
        {"slug": "recursion-basics", "title": "Recursion: Base Cases, Call Stack, and Tail Recursion Optimization", "section": "Foundations", "difficulty": "beginner"},
        {"slug": "dynamic-arrays", "title": "Dynamic Arrays: Amortized Analysis and ArrayList Internals", "section": "Arrays and Strings", "difficulty": "beginner"},
        {"slug": "string-operations", "title": "String Operations: Manipulation, Pattern Matching, and StringBuilder", "section": "Arrays and Strings", "difficulty": "beginner"},
        {"slug": "matrix-operations", "title": "Matrix Operations: 2D Arrays, Rotation, Transposition, and Spiral Traversal", "section": "Arrays and Strings", "difficulty": "beginner"},
        {"slug": "singly-linked-list", "title": "Singly Linked List: Insertion, Deletion, Reversal, and Floyd's Cycle Detection", "section": "Linked Lists", "difficulty": "beginner"},
        {"slug": "doubly-circular-linked", "title": "Doubly and Circular Linked Lists: Operations and LRU Cache Implementation", "section": "Linked Lists", "difficulty": "intermediate"},
        {"slug": "stack-implementation", "title": "Stack Implementation: Array and Linked List Backed, Monotonic Stack Uses", "section": "Stacks and Queues", "difficulty": "beginner"},
        {"slug": "queue-deque", "title": "Queue and Deque: Circular Buffer, Priority Queue, and Sliding Window Maximum", "section": "Stacks and Queues", "difficulty": "beginner"},
        {"slug": "binary-tree-fundamentals", "title": "Binary Tree Fundamentals: Properties, Traversals, and Reconstruction", "section": "Trees", "difficulty": "beginner"},
        {"slug": "bst-operations", "title": "Binary Search Tree Operations: Search, Insert, Delete, and Successor", "section": "Trees", "difficulty": "intermediate"},
        {"slug": "avl-trees", "title": "AVL Trees: Rotation Operations, Balance Factor, and Height Analysis", "section": "Trees", "difficulty": "intermediate"},
        {"slug": "red-black-trees", "title": "Red-Black Trees: Color Properties, Insertions, and Deletions", "section": "Trees", "difficulty": "advanced"},
        {"slug": "b-trees-and-variants", "title": "B-Trees and B+ Trees: Disk-Based Storage and Database Indexing", "section": "Trees", "difficulty": "advanced"},
        {"slug": "trie-data-structure", "title": "Trie (Prefix Tree): Insert, Search, Autocomplete, and Compressed Trie", "section": "Trees", "difficulty": "intermediate"},
        {"slug": "segment-tree-ds", "title": "Segment Trees: Range Sum, Range Minimum, and Lazy Propagation", "section": "Advanced Trees", "difficulty": "advanced"},
        {"slug": "fenwick-tree-ds", "title": "Fenwick Tree (BIT): Point Updates and Prefix Queries", "section": "Advanced Trees", "difficulty": "intermediate"},
        {"slug": "heap-operations", "title": "Heap Operations: Heapify, Extract-Min/Max, Heap Sort, and k-th Largest", "section": "Heaps", "difficulty": "intermediate"},
        {"slug": "hash-table-internals", "title": "Hash Table Internals: Hash Functions, Chaining, and Open Addressing", "section": "Hashing", "difficulty": "intermediate"},
        {"slug": "bloom-filters", "title": "Bloom Filters and Probabilistic Data Structures: Count-Min Sketch", "section": "Hashing", "difficulty": "advanced"},
        {"slug": "graph-representation", "title": "Graph Representation: Adjacency Matrix, List, and Edge List Comparison", "section": "Graphs", "difficulty": "beginner"},
        {"slug": "bfs-dfs-algorithms", "title": "BFS and DFS: Traversal, Connected Components, and Cycle Detection", "section": "Graphs", "difficulty": "intermediate"},
        {"slug": "union-find-ds", "title": "Union-Find (Disjoint Sets): Union by Rank and Path Compression", "section": "Graphs", "difficulty": "intermediate"},
        {"slug": "skip-list-ds", "title": "Skip List: Probabilistic Layered Structure and O(log n) Operations", "section": "Advanced Structures", "difficulty": "advanced"},
        {"slug": "van-emde-boas", "title": "Van Emde Boas Trees and Integer Data Structure Optimizations", "section": "Advanced Structures", "difficulty": "advanced"},
        {"slug": "persistent-data-structures", "title": "Persistent Data Structures: Immutable Updates and Functional Trees", "section": "Advanced Structures", "difficulty": "advanced"},
        {"slug": "external-data-structures", "title": "External Memory Data Structures: Buffer Trees and Cache-Oblivious Layouts", "section": "Advanced Structures", "difficulty": "advanced"},
        {"slug": "placement-guide", "title": "Placement Guide: Data Structures Interview Tips and Common Patterns", "section": "Career", "difficulty": "beginner"},
    ]
}

# ─────────────────────────────────────────────────────────────────────────────
# 7. DATABASE MANAGEMENT
# ─────────────────────────────────────────────────────────────────────────────
COURSES["database-management"] = {
    "course": "database-management",
    "title": "Database Management Systems",
    "textbook_refs": ["Ramakrishnan & Gehrke: Database Management Systems 3rd Ed", "Silberschatz, Korth, Sudarshan: Database System Concepts 7th Ed", "Date: An Introduction to Database Systems 8th Ed"],
    "topics": [
        {"slug": "db-architecture", "title": "DBMS Architecture: Three-Schema, Client-Server, and Storage Engines", "section": "Introduction", "difficulty": "beginner"},
        {"slug": "er-modeling", "title": "Entity-Relationship Modeling: Entities, Attributes, Relationships, and ERD to Schema", "section": "Data Modeling", "difficulty": "beginner"},
        {"slug": "enhanced-er", "title": "Enhanced ER Model: Specialization, Generalization, and Aggregation", "section": "Data Modeling", "difficulty": "intermediate"},
        {"slug": "relational-algebra", "title": "Relational Algebra: Selection, Projection, Join, and Set Operations", "section": "Relational Model", "difficulty": "intermediate"},
        {"slug": "relational-calculus", "title": "Relational Calculus: Tuple and Domain Relational Calculus", "section": "Relational Model", "difficulty": "intermediate"},
        {"slug": "sql-advanced-queries", "title": "Advanced SQL: Window Functions, CTEs, Recursive Queries, and PIVOT", "section": "SQL", "difficulty": "intermediate"},
        {"slug": "sql-joins-deep-dive", "title": "SQL Joins Deep Dive: INNER, OUTER, CROSS, SELF, and NATURAL Joins", "section": "SQL", "difficulty": "beginner"},
        {"slug": "sql-aggregate-groupby", "title": "SQL Aggregation: GROUP BY, HAVING, ROLLUP, CUBE, and GROUPING SETS", "section": "SQL", "difficulty": "intermediate"},
        {"slug": "sql-subqueries", "title": "Subqueries and Correlated Subqueries: EXISTS, NOT EXISTS, and ANY/ALL", "section": "SQL", "difficulty": "intermediate"},
        {"slug": "stored-procedures-triggers", "title": "Stored Procedures, Functions, Triggers, and Cursor Programming", "section": "SQL", "difficulty": "intermediate"},
        {"slug": "functional-dependencies", "title": "Functional Dependencies: Armstrong's Axioms and Closure Computation", "section": "Normalization", "difficulty": "intermediate"},
        {"slug": "1nf-2nf-3nf", "title": "1NF, 2NF, and 3NF: Stepwise Normalization with Examples", "section": "Normalization", "difficulty": "intermediate"},
        {"slug": "bcnf-4nf-5nf", "title": "BCNF, 4NF, and 5NF: Higher Normal Forms and Lossless Decomposition", "section": "Normalization", "difficulty": "advanced"},
        {"slug": "concurrency-control", "title": "Concurrency Control: Locking Protocols, Two-Phase Locking, and MVCC", "section": "Transaction Management", "difficulty": "advanced"},
        {"slug": "serializability", "title": "Serializability: Conflict Serializability, View Serializability, and Schedules", "section": "Transaction Management", "difficulty": "advanced"},
        {"slug": "recovery-logging", "title": "Recovery and Logging: ARIES Protocol, Undo/Redo Logs, and Checkpointing", "section": "Transaction Management", "difficulty": "advanced"},
        {"slug": "isolation-levels", "title": "Isolation Levels: Read Uncommitted to Serializable and Phantom Reads", "section": "Transaction Management", "difficulty": "intermediate"},
        {"slug": "btree-index", "title": "B+ Tree Index: Clustered vs Unclustered, Insertion, and Range Queries", "section": "Indexing and Storage", "difficulty": "intermediate"},
        {"slug": "hash-index", "title": "Hash-Based Indexing: Static and Dynamic (Extendible) Hashing", "section": "Indexing and Storage", "difficulty": "intermediate"},
        {"slug": "bitmap-index", "title": "Bitmap Indexes and Column-Oriented Storage for OLAP", "section": "Indexing and Storage", "difficulty": "advanced"},
        {"slug": "storage-manager", "title": "Storage Manager: Buffer Pool, Page Replacement, and Disk Layout", "section": "Indexing and Storage", "difficulty": "intermediate"},
        {"slug": "query-processing", "title": "Query Processing: Iterator Model, Operator Algorithms, and Cost Models", "section": "Query Optimization", "difficulty": "advanced"},
        {"slug": "join-algorithms", "title": "Join Algorithms: Nested Loop, Sort-Merge, and Hash Join with Cost Analysis", "section": "Query Optimization", "difficulty": "advanced"},
        {"slug": "query-plan-execution", "title": "Query Plan Enumeration: System R Dynamic Programming and Heuristics", "section": "Query Optimization", "difficulty": "advanced"},
        {"slug": "nosql-databases", "title": "NoSQL Databases: Document, Key-Value, Column-Family, and Graph DBs", "section": "Modern Databases", "difficulty": "intermediate"},
        {"slug": "distributed-databases", "title": "Distributed Databases: Fragmentation, Replication, and CAP Theorem", "section": "Modern Databases", "difficulty": "advanced"},
        {"slug": "data-warehousing-olap", "title": "Data Warehousing and OLAP: Star Schema, Cube Operations, and ETL", "section": "Modern Databases", "difficulty": "intermediate"},
        {"slug": "newSQL-htap", "title": "NewSQL and HTAP Systems: Spanner, CockroachDB, and TiDB", "section": "Modern Databases", "difficulty": "advanced"},
        {"slug": "graph-databases", "title": "Graph Databases: Property Graph Model, Cypher Queries, and Neo4j", "section": "Modern Databases", "difficulty": "intermediate"},
        {"slug": "placement-guide", "title": "Placement Guide: Database Interview Questions and System Design", "section": "Career", "difficulty": "beginner"},
    ]
}

# ─────────────────────────────────────────────────────────────────────────────
# 8. DEEP LEARNING
# ─────────────────────────────────────────────────────────────────────────────
COURSES["deep-learning"] = {
    "course": "deep-learning",
    "title": "Deep Learning: From Foundations to Frontiers",
    "textbook_refs": ["Goodfellow, Bengio, Courville: Deep Learning (MIT Press)", "Bishop: Deep Learning (Cambridge)", "Howard & Gugger: Deep Learning for Coders"],
    "topics": [
        {"slug": "linear-algebra-dl", "title": "Linear Algebra for Deep Learning: Tensors, Eigenvalues, and SVD", "section": "Mathematical Foundations", "difficulty": "beginner"},
        {"slug": "calculus-dl", "title": "Calculus for Deep Learning: Gradients, Jacobians, and Hessians", "section": "Mathematical Foundations", "difficulty": "beginner"},
        {"slug": "probability-statistics-dl", "title": "Probability and Statistics for Deep Learning: MLE, MAP, and Information Theory", "section": "Mathematical Foundations", "difficulty": "intermediate"},
        {"slug": "perceptron-mlp", "title": "Perceptron to Multi-Layer Perceptron: Universal Approximation Theorem", "section": "Neural Network Basics", "difficulty": "beginner"},
        {"slug": "activation-functions", "title": "Activation Functions: Sigmoid, Tanh, ReLU, GELU, Swish, and Mish", "section": "Neural Network Basics", "difficulty": "beginner"},
        {"slug": "loss-functions-dl", "title": "Loss Functions: MSE, Cross-Entropy, Hinge, Focal Loss, and Contrastive Loss", "section": "Neural Network Basics", "difficulty": "beginner"},
        {"slug": "weight-initialization", "title": "Weight Initialization: Xavier, He, and Orthogonal Initialization Strategies", "section": "Training Deep Networks", "difficulty": "intermediate"},
        {"slug": "batch-normalization", "title": "Batch Normalization: Algorithm, Internal Covariate Shift, and Variants (LN, GN, IN)", "section": "Training Deep Networks", "difficulty": "intermediate"},
        {"slug": "dropout-regularization", "title": "Dropout and Regularization: L1/L2, Dropout, DropBlock, and Data Augmentation", "section": "Training Deep Networks", "difficulty": "intermediate"},
        {"slug": "optimizers-sgd-adam", "title": "Optimizers Deep Dive: SGD, Momentum, RMSProp, Adam, AdamW, and LAMB", "section": "Training Deep Networks", "difficulty": "intermediate"},
        {"slug": "learning-rate-scheduling", "title": "Learning Rate Scheduling: Warmup, Cosine Annealing, and Cyclical LR", "section": "Training Deep Networks", "difficulty": "intermediate"},
        {"slug": "convolutional-operations", "title": "Convolutional Operations: Stride, Padding, Dilation, Depthwise, and Transposed Convolutions", "section": "CNNs", "difficulty": "intermediate"},
        {"slug": "pooling-feature-maps", "title": "Pooling and Feature Maps: Max Pooling, Global Average Pooling, and Spatial Pyramid", "section": "CNNs", "difficulty": "intermediate"},
        {"slug": "resnet-densenet", "title": "ResNet and DenseNet: Skip Connections, Identity Shortcuts, and Feature Reuse", "section": "CNN Architectures", "difficulty": "intermediate"},
        {"slug": "efficientnet-mobilenet", "title": "EfficientNet and MobileNet: Compound Scaling and Lightweight CNNs", "section": "CNN Architectures", "difficulty": "advanced"},
        {"slug": "attention-mechanisms", "title": "Attention Mechanisms: Soft Attention, Hard Attention, and Self-Attention", "section": "Transformers", "difficulty": "intermediate"},
        {"slug": "positional-encoding", "title": "Positional Encoding: Sinusoidal, Learned, and Rotary Position Embeddings", "section": "Transformers", "difficulty": "intermediate"},
        {"slug": "bert-gpt-architectures", "title": "BERT and GPT Architectures: Encoder-Only, Decoder-Only, and Encoder-Decoder", "section": "Transformers", "difficulty": "intermediate"},
        {"slug": "variational-autoencoders", "title": "Variational Autoencoders: ELBO Objective, Reparameterization Trick, and β-VAE", "section": "Generative Models", "difficulty": "advanced"},
        {"slug": "gans-architecture", "title": "GANs In-Depth: DCGAN, Wasserstein GAN, StyleGAN, and Training Stability", "section": "Generative Models", "difficulty": "advanced"},
        {"slug": "semantic-segmentation", "title": "Semantic Segmentation: FCN, U-Net, DeepLab, and Panoptic Segmentation", "section": "Computer Vision DL", "difficulty": "advanced"},
        {"slug": "pose-estimation", "title": "Pose Estimation: OpenPose, HRNet, and 3D Human Pose Prediction", "section": "Computer Vision DL", "difficulty": "advanced"},
        {"slug": "speech-recognition-dl", "title": "Speech Recognition: CTC, RNN-T, Conformer, and Wav2Vec 2.0", "section": "Audio and Speech", "difficulty": "advanced"},
        {"slug": "sequence-to-sequence", "title": "Sequence-to-Sequence Models: Encoder-Decoder, Attention, and Beam Search", "section": "NLP Deep Learning", "difficulty": "intermediate"},
        {"slug": "text-classification-dl", "title": "Text Classification: BERT Fine-Tuning, Prompt Engineering, and Few-Shot", "section": "NLP Deep Learning", "difficulty": "intermediate"},
        {"slug": "multi-modal-learning", "title": "Multi-Modal Learning: CLIP, DALL-E, Flamingo, and Cross-Modal Alignment", "section": "Advanced Topics", "difficulty": "advanced"},
        {"slug": "knowledge-distillation", "title": "Knowledge Distillation: Teacher-Student Training and Born-Again Networks", "section": "Model Compression", "difficulty": "advanced"},
        {"slug": "quantization-pruning", "title": "Quantization and Pruning: INT8, Mixed Precision, Magnitude Pruning, and Lottery Ticket", "section": "Model Compression", "difficulty": "advanced"},
        {"slug": "neural-architecture-search", "title": "Neural Architecture Search: DARTS, One-Shot NAS, and Evolutionary Methods", "section": "AutoML", "difficulty": "advanced"},
        {"slug": "federated-learning-dl", "title": "Federated Learning: FedAvg, Differential Privacy, and Communication Efficiency", "section": "Advanced Topics", "difficulty": "advanced"},
        {"slug": "placement-guide", "title": "Placement Guide: Deep Learning Interview Questions and Research Directions", "section": "Career", "difficulty": "beginner"},
    ]
}

# ─────────────────────────────────────────────────────────────────────────────
# 9. DIGITAL LOGIC
# ─────────────────────────────────────────────────────────────────────────────
COURSES["digital-logic"] = {
    "course": "digital-logic",
    "title": "Digital Logic Design: Principles and Applications",
    "textbook_refs": ["Morris Mano: Digital Design 5th Ed", "Floyd: Digital Fundamentals 11th Ed", "Wakerly: Digital Design Principles and Practices 5th Ed"],
    "topics": [
        {"slug": "number-systems", "title": "Number Systems: Binary, Octal, Hexadecimal Conversions and BCD", "section": "Foundations", "difficulty": "beginner"},
        {"slug": "boolean-algebra-theorems", "title": "Boolean Algebra Theorems: Duality, De Morgan's Laws, and Consensus Theorem", "section": "Boolean Algebra", "difficulty": "beginner"},
        {"slug": "canonical-forms", "title": "Canonical Forms: SOP, POS, Minterms, Maxterms, and Conversion", "section": "Boolean Algebra", "difficulty": "beginner"},
        {"slug": "karnaugh-maps", "title": "Karnaugh Maps: 2, 3, 4 Variable Simplification and Don't-Care Conditions", "section": "Boolean Algebra", "difficulty": "intermediate"},
        {"slug": "quine-mccluskey", "title": "Quine–McCluskey Method: Tabular Minimization for Many Variables", "section": "Boolean Algebra", "difficulty": "intermediate"},
        {"slug": "logic-gate-families", "title": "Logic Gate Families: TTL, CMOS, ECL, and Electrical Characteristics", "section": "Logic Gates", "difficulty": "intermediate"},
        {"slug": "cmos-logic-gates", "title": "CMOS Logic Gate Implementation: Pull-Up/Pull-Down Networks", "section": "Logic Gates", "difficulty": "intermediate"},
        {"slug": "half-full-adder", "title": "Half and Full Adders: Ripple Carry, Carry Lookahead, and Carry Select", "section": "Combinational Circuits", "difficulty": "intermediate"},
        {"slug": "decoders-encoders", "title": "Decoders, Encoders, and Priority Encoders: Design and Applications", "section": "Combinational Circuits", "difficulty": "intermediate"},
        {"slug": "multiplexers-demultiplexers", "title": "Multiplexers and Demultiplexers: Design, Universal Logic, and Applications", "section": "Combinational Circuits", "difficulty": "intermediate"},
        {"slug": "comparators-shifters", "title": "Comparators and Barrel Shifters: Design and VLSI Implementations", "section": "Combinational Circuits", "difficulty": "intermediate"},
        {"slug": "sr-d-jk-t-flipflops", "title": "SR, D, JK, and T Flip-Flops: Characteristic Tables and Excitation Tables", "section": "Sequential Circuits", "difficulty": "intermediate"},
        {"slug": "registers-shift-registers", "title": "Registers and Shift Registers: SIPO, PISO, PIPO, and Ring Counters", "section": "Sequential Circuits", "difficulty": "intermediate"},
        {"slug": "synchronous-counters", "title": "Synchronous and Asynchronous Counters: Modulo-N and Up/Down Counters", "section": "Sequential Circuits", "difficulty": "intermediate"},
        {"slug": "mealy-moore-machines", "title": "Mealy and Moore Machines: State Minimization and State Assignment", "section": "Finite State Machines", "difficulty": "intermediate"},
        {"slug": "state-diagram-table", "title": "State Diagram to State Table to Logic Circuit: Complete Design Process", "section": "Finite State Machines", "difficulty": "intermediate"},
        {"slug": "hazards-timing", "title": "Hazards and Timing: Static, Dynamic Hazards, Glitches, and Elimination", "section": "Timing Analysis", "difficulty": "advanced"},
        {"slug": "synchronization-metastability", "title": "Synchronization, Metastability, and Clock Domain Crossing", "section": "Timing Analysis", "difficulty": "advanced"},
        {"slug": "rom-ram-pla", "title": "ROM, RAM, PLA, and PAL: Programmable Logic and Memory Devices", "section": "Memory Devices", "difficulty": "intermediate"},
        {"slug": "fpga-basics", "title": "FPGAs and CPLDs: LUT-Based Architecture and HDL Programming Introduction", "section": "Programmable Logic", "difficulty": "intermediate"},
        {"slug": "verilog-hdl-intro", "title": "Verilog HDL Introduction: Behavioral, Dataflow, and Structural Modeling", "section": "Hardware Description", "difficulty": "intermediate"},
        {"slug": "testbench-simulation", "title": "Testbench Design and Simulation: ModelSim and Waveform Analysis", "section": "Hardware Description", "difficulty": "intermediate"},
        {"slug": "placement-guide", "title": "Placement Guide: Digital Logic Interview Questions and GATE Preparation", "section": "Career", "difficulty": "beginner"},
    ]
}

# ─────────────────────────────────────────────────────────────────────────────
# 10. DSA-PLACEMENT
# ─────────────────────────────────────────────────────────────────────────────
# Existing (45): algorithmic-analysis, amortized-analysis, approximation-algorithms,
# arrays-and-strings, asymptotic-notation, avl-trees, b-trees, binary-search,
# binary-search-trees, binary-trees, bit-manipulation, computational-models-and-analysis,
# data-structures-introduction, dp-patterns-advanced, dynamic-arrays, dynamic-programming-fundamentals,
# fenwick-trees, graphs-bfs-dfs, greedy-algorithms, hash-tables, heaps-and-priority-queues,
# index, interval-problems, interview-prep, kmp-algorithm, linked-lists, minimum-spanning-trees,
# monotonic-stack-queue, network-flow, overview, rabin-karp, randomized-algorithms,
# recursion-and-backtracking, recursion-fundamentals, red-black-trees, segment-trees,
# shortest-paths-bellman-ford, shortest-paths-dijkstra, singly-doubly-circular-linked-lists,
# sorting-algorithms, stacks-and-queues, topological-sort, tries, two-pointers-sliding-window, union-find

COURSES["dsa-placement"] = {
    "course": "dsa-placement",
    "title": "DSA for Placement: Complete Interview Preparation",
    "textbook_refs": ["CLRS 4th Ed", "Narasimha Karumanchi: Data Structures and Algorithms Made Easy", "Aziz, Lee, Prakash: Elements of Programming Interviews"],
    "topics": [
        # ── NEW topics only (not in existing 45) ──
        {"slug": "matrix-problems", "title": "Matrix Problems: Spiral Order, Rotation, Flood Fill, and Word Search", "section": "Arrays and Strings", "difficulty": "intermediate"},
        {"slug": "string-hashing", "title": "String Hashing: Polynomial Rolling Hash and Anti-Hash Techniques", "section": "Arrays and Strings", "difficulty": "intermediate"},
        {"slug": "number-theory", "title": "Number Theory: GCD, LCM, Modular Arithmetic, and Euler's Totient", "section": "Mathematics", "difficulty": "intermediate"},
        {"slug": "sieve-of-eratosthenes", "title": "Sieve of Eratosthenes: Prime Generation and Segmented Sieve", "section": "Mathematics", "difficulty": "intermediate"},
        {"slug": "math-for-interviews", "title": "Mathematics for Coding Interviews: Combinatorics, Pigeonhole, and Probability", "section": "Mathematics", "difficulty": "intermediate"},
        {"slug": "stack-problems-advanced", "title": "Advanced Stack Problems: Largest Rectangle in Histogram, Stock Span, and Next Greater Element", "section": "Stacks and Queues", "difficulty": "intermediate"},
        {"slug": "queue-problems-advanced", "title": "Advanced Queue Problems: First Non-Repeating Character and Sliding Window with Deque", "section": "Stacks and Queues", "difficulty": "intermediate"},
        {"slug": "linked-list-advanced", "title": "Advanced Linked List: Merge K Sorted Lists, Flatten Multi-Level, and Copy with Random Pointer", "section": "Linked Lists", "difficulty": "intermediate"},
        {"slug": "binary-tree-advanced", "title": "Advanced Binary Tree Problems: LCA, Diameter, Max Path Sum, and Serialize/Deserialize", "section": "Trees", "difficulty": "intermediate"},
        {"slug": "tree-dp", "title": "Dynamic Programming on Trees: Subtree DP, Maximum Independent Set, and Tree Diameter", "section": "Trees", "difficulty": "advanced"},
        {"slug": "lca-algorithms", "title": "LCA Algorithms: Binary Lifting, Euler Tour + Sparse Table, and Farach-Colton-Bender", "section": "Trees", "difficulty": "advanced"},
        {"slug": "graph-advanced-algorithms", "title": "Advanced Graph Algorithms: Bridges, Articulation Points, and Biconnected Components", "section": "Graphs", "difficulty": "advanced"},
        {"slug": "strongly-connected-components-placement", "title": "Strongly Connected Components: Kosaraju's and Tarjan's Algorithms with Applications", "section": "Graphs", "difficulty": "advanced"},
        {"slug": "euler-path-circuit", "title": "Euler Path and Hamiltonian Cycle: Hierholzer's Algorithm and Ore's Theorem", "section": "Graphs", "difficulty": "advanced"},
        {"slug": "floyd-warshall", "title": "Floyd-Warshall Algorithm: All-Pairs Shortest Path and Transitive Closure", "section": "Graphs", "difficulty": "intermediate"},
        {"slug": "dp-strings", "title": "DP on Strings: Edit Distance, LCS, Palindrome Partitioning, and Regular Expression", "section": "Dynamic Programming", "difficulty": "intermediate"},
        {"slug": "dp-knapsack-variations", "title": "Knapsack Problem Variations: 0/1 Knapsack, Unbounded, Fractional, and Multiple Knapsack", "section": "Dynamic Programming", "difficulty": "intermediate"},
        {"slug": "dp-grid-problems", "title": "DP on Grids: Unique Paths, Minimum Path Sum, Dungeon Game, and Cherry Pickup", "section": "Dynamic Programming", "difficulty": "intermediate"},
        {"slug": "matrix-chain-dp", "title": "Matrix Chain Multiplication and Interval DP: Burst Balloons, Palindrome Removal", "section": "Dynamic Programming", "difficulty": "advanced"},
        {"slug": "bitmask-dp-placement", "title": "Bitmask DP: Travelling Salesman, Assignment Problem, and SOS (Sum over Subsets)", "section": "Dynamic Programming", "difficulty": "advanced"},
        {"slug": "digit-dp-placement", "title": "Digit DP: Count Numbers with Digit Constraints and Digit Sum Problems", "section": "Dynamic Programming", "difficulty": "advanced"},
        {"slug": "aho-corasick-placement", "title": "Aho–Corasick Algorithm: Multi-Pattern Search and Dictionary Matching", "section": "String Algorithms", "difficulty": "advanced"},
        {"slug": "z-algorithm", "title": "Z-Algorithm: Linear Preprocessing for Pattern Matching Applications", "section": "String Algorithms", "difficulty": "intermediate"},
        {"slug": "manacher-palindromes", "title": "Manacher's Algorithm: Longest Palindromic Substring in O(n)", "section": "String Algorithms", "difficulty": "intermediate"},
        {"slug": "suffix-array-placement", "title": "Suffix Arrays: SA-IS Construction, LCP Array, and Applications", "section": "String Algorithms", "difficulty": "advanced"},
        {"slug": "sqrt-decomposition", "title": "Square Root Decomposition: Range Queries, Block Preprocessing, and Mo's Algorithm", "section": "Advanced Data Structures", "difficulty": "advanced"},
        {"slug": "sparse-table-placement", "title": "Sparse Table: O(1) RMQ, Static Range Queries, and Disjoint Sparse Table", "section": "Advanced Data Structures", "difficulty": "intermediate"},
        {"slug": "heavy-light-decomp", "title": "Heavy-Light Decomposition: Path Queries and Updates on Trees", "section": "Advanced Data Structures", "difficulty": "advanced"},
        {"slug": "centroid-decomp", "title": "Centroid Decomposition: Distance Problems, Path Counting, and Centroid Tree", "section": "Advanced Data Structures", "difficulty": "advanced"},
        {"slug": "treap", "title": "Treap and Implicit Key Treap: Split, Merge, and Sequence Operations", "section": "Advanced Data Structures", "difficulty": "advanced"},
        {"slug": "persistent-segment-tree", "title": "Persistent Segment Tree: Versioned Updates and K-th Order Statistics", "section": "Advanced Data Structures", "difficulty": "advanced"},
        {"slug": "convex-hull-trick", "title": "Convex Hull Trick and Li Chao Tree: DP Optimization Techniques", "section": "DP Optimization", "difficulty": "advanced"},
        {"slug": "divide-conquer-dp-opt", "title": "Divide and Conquer DP Optimization: Opt-Monotone DP and SMAWK Algorithm", "section": "DP Optimization", "difficulty": "advanced"},
        {"slug": "game-theory", "title": "Game Theory: Nim, Sprague-Grundy Theorem, and Combinatorial Games", "section": "Mathematics", "difficulty": "advanced"},
        {"slug": "fast-fourier-transform-placement", "title": "FFT and NTT: Polynomial Multiplication, Convolution, and Number Theoretic Transform", "section": "Mathematics", "difficulty": "advanced"},
        {"slug": "xor-problems", "title": "XOR Tricks and Bit Manipulation Patterns: XOR Basis, Maximum XOR Subarray", "section": "Bit Manipulation", "difficulty": "intermediate"},
        {"slug": "meet-in-middle", "title": "Meet in the Middle: Divide-and-Enumerate and Birthday Attack Applications", "section": "Advanced Algorithms", "difficulty": "advanced"},
        {"slug": "two-sat", "title": "2-SAT: Implication Graph, SCC-Based Solution, and Applications", "section": "Advanced Algorithms", "difficulty": "advanced"},
        {"slug": "offline-algorithms", "title": "Offline Algorithms: Mo's Algorithm, CDQ Divide and Conquer, and Offline LCT", "section": "Advanced Algorithms", "difficulty": "advanced"},
        {"slug": "system-design-dsa", "title": "System Design for Interviews: LRU Cache, LFU Cache, and Consistent Hashing", "section": "System Design", "difficulty": "intermediate"},
        {"slug": "competitive-programming-tips", "title": "Competitive Programming Patterns: Template Code, I/O Optimization, and Problem Taxonomy", "section": "Competitive Programming", "difficulty": "intermediate"},
        {"slug": "top-interview-patterns", "title": "Top Interview Patterns: Two Pointers, Backtracking, BFS/DFS Templates", "section": "Interview Patterns", "difficulty": "intermediate"},
        {"slug": "faang-problem-patterns", "title": "FAANG Problem Patterns: Amazon, Google, Microsoft, and Meta Common Topics", "section": "Interview Patterns", "difficulty": "intermediate"},
        {"slug": "mock-interview-problems", "title": "Mock Interview Problems: Curated Set from Real Company Interviews", "section": "Practice", "difficulty": "advanced"},
        {"slug": "placement-guide", "title": "Placement Guide: Resume Tips, Coding Round Strategy, and Negotiation", "section": "Career", "difficulty": "beginner"},
    ]
}

# ─────────────────────────────────────────────────────────────────────────────
# 11. MACHINE LEARNING
# ─────────────────────────────────────────────────────────────────────────────
COURSES["machine-learning"] = {
    "course": "machine-learning",
    "title": "Machine Learning: Theory and Practice",
    "textbook_refs": ["Bishop: Pattern Recognition and Machine Learning", "Murphy: Probabilistic Machine Learning: An Introduction", "Hastie, Tibshirani, Friedman: Elements of Statistical Learning 2nd Ed"],
    "topics": [
        {"slug": "ml-foundations", "title": "ML Foundations: Statistical Learning Theory, PAC Learning, and VC Dimension", "section": "Theory", "difficulty": "intermediate"},
        {"slug": "bias-variance-tradeoff", "title": "Bias-Variance Trade-off: Decomposition, Model Complexity, and Regularization", "section": "Theory", "difficulty": "intermediate"},
        {"slug": "gradient-descent-variants", "title": "Gradient Descent Variants: Batch, Mini-Batch, SGD, Momentum, and AdaGrad", "section": "Optimization", "difficulty": "intermediate"},
        {"slug": "regularization-techniques", "title": "Regularization Techniques: L1 (Lasso), L2 (Ridge), Elastic Net, and Early Stopping", "section": "Optimization", "difficulty": "intermediate"},
        {"slug": "cross-validation-techniques", "title": "Cross-Validation: K-Fold, Stratified, Leave-One-Out, and Nested CV", "section": "Model Evaluation", "difficulty": "intermediate"},
        {"slug": "hyperparameter-tuning", "title": "Hyperparameter Tuning: Grid Search, Random Search, and Bayesian Optimization", "section": "Model Evaluation", "difficulty": "intermediate"},
        {"slug": "bayesian-linear-regression", "title": "Bayesian Linear Regression: Prior/Posterior Updates and Predictive Distribution", "section": "Probabilistic Models", "difficulty": "advanced"},
        {"slug": "gaussian-processes", "title": "Gaussian Processes: Kernel Functions, Posterior Inference, and GPR/GPC", "section": "Probabilistic Models", "difficulty": "advanced"},
        {"slug": "probabilistic-graphical-models", "title": "Probabilistic Graphical Models: Bayesian Networks, MRFs, and Inference Algorithms", "section": "Probabilistic Models", "difficulty": "advanced"},
        {"slug": "expectation-maximization", "title": "Expectation-Maximization Algorithm: GMMs, Missing Data, and K-Means as EM", "section": "Unsupervised Learning", "difficulty": "advanced"},
        {"slug": "clustering-algorithms", "title": "Clustering Algorithms: K-Means, DBSCAN, Hierarchical, Spectral, and Mean Shift", "section": "Unsupervised Learning", "difficulty": "intermediate"},
        {"slug": "anomaly-detection", "title": "Anomaly Detection: Isolation Forest, One-Class SVM, and Autoencoders", "section": "Unsupervised Learning", "difficulty": "intermediate"},
        {"slug": "kernel-methods", "title": "Kernel Methods: Kernel Trick, Mercer's Theorem, and Kernel PCA", "section": "Advanced Supervised", "difficulty": "advanced"},
        {"slug": "gradient-boosting-xgboost", "title": "Gradient Boosting: XGBoost, LightGBM, CatBoost — Algorithms and Tuning", "section": "Ensemble Methods", "difficulty": "intermediate"},
        {"slug": "random-forests-deep-dive", "title": "Random Forests In-Depth: Feature Importance, OOB Error, and Extremely Randomized Trees", "section": "Ensemble Methods", "difficulty": "intermediate"},
        {"slug": "multi-label-classification", "title": "Multi-Label Classification: Label Powerset, Classifier Chains, and Evaluation Metrics", "section": "Classification", "difficulty": "intermediate"},
        {"slug": "imbalanced-learning", "title": "Imbalanced Data Handling: SMOTE, Oversampling, Undersampling, and Cost-Sensitive Learning", "section": "Classification", "difficulty": "intermediate"},
        {"slug": "survival-analysis", "title": "Survival Analysis: Kaplan-Meier Estimator, Cox Regression, and Hazard Functions", "section": "Specialized Models", "difficulty": "advanced"},
        {"slug": "causal-inference-ml", "title": "Causal Inference in ML: Do-Calculus, Propensity Scores, and Double ML", "section": "Specialized Models", "difficulty": "advanced"},
        {"slug": "ranking-learning-to-rank", "title": "Learning-to-Rank: Pointwise, Pairwise, Listwise, and LambdaRank", "section": "Specialized Models", "difficulty": "advanced"},
        {"slug": "active-learning", "title": "Active Learning: Query Strategies, Uncertainty Sampling, and Pool-Based Selection", "section": "Learning Paradigms", "difficulty": "advanced"},
        {"slug": "semi-supervised-learning", "title": "Semi-Supervised Learning: Label Propagation, Self-Training, and Co-Training", "section": "Learning Paradigms", "difficulty": "advanced"},
        {"slug": "multi-task-learning", "title": "Multi-Task Learning: Hard Parameter Sharing, Soft Sharing, and Task Weighting", "section": "Learning Paradigms", "difficulty": "advanced"},
        {"slug": "meta-learning", "title": "Meta-Learning: MAML, Prototypical Networks, and Few-Shot Classification", "section": "Learning Paradigms", "difficulty": "advanced"},
        {"slug": "data-preprocessing-pipeline", "title": "Data Preprocessing Pipelines: Imputation, Scaling, Encoding, and Pipelines", "section": "Feature Engineering", "difficulty": "beginner"},
        {"slug": "feature-selection-methods", "title": "Feature Selection: Filter, Wrapper, Embedded Methods, and Mutual Information", "section": "Feature Engineering", "difficulty": "intermediate"},
        {"slug": "class-imbalance-metrics", "title": "ML Metrics for Imbalanced Classes: AUC-ROC, Precision-Recall Curve, and F1", "section": "Model Evaluation", "difficulty": "intermediate"},
        {"slug": "explainability-shap", "title": "ML Explainability: LIME, SHAP Values, Partial Dependence Plots, and Anchors", "section": "Responsible ML", "difficulty": "intermediate"},
        {"slug": "ml-privacy", "title": "Privacy in ML: Differential Privacy, Federated Learning, and Membership Inference", "section": "Responsible ML", "difficulty": "advanced"},
        {"slug": "tabular-deep-learning", "title": "Deep Learning for Tabular Data: TabNet, Entity Embeddings, and NODE", "section": "Advanced Topics", "difficulty": "advanced"},
    ]
}

# ─────────────────────────────────────────────────────────────────────────────
# 12. OBJECT-ORIENTED PROGRAMMING
# ─────────────────────────────────────────────────────────────────────────────
COURSES["object-oriented-programming"] = {
    "course": "object-oriented-programming",
    "title": "Object-Oriented Programming: Principles, Patterns, and Practices",
    "textbook_refs": ["Gamma et al.: Design Patterns (GoF)", "Martin: Clean Code", "Bloch: Effective Java 3rd Ed", "Horstmann: Core Java Vol 1 & 2"],
    "topics": [
        {"slug": "oop-history-paradigms", "title": "History of OOP Paradigms: Procedural vs Object-Oriented vs Functional", "section": "Introduction", "difficulty": "beginner"},
        {"slug": "object-class-fundamentals", "title": "Objects and Classes: Constructors, Instance Variables, and Class Variables", "section": "Core OOP", "difficulty": "beginner"},
        {"slug": "access-modifiers", "title": "Access Modifiers and Visibility: Public, Private, Protected, and Package", "section": "Encapsulation", "difficulty": "beginner"},
        {"slug": "interfaces-abstract-classes", "title": "Interfaces and Abstract Classes: Contracts, Default Methods, and When to Use Each", "section": "Abstraction", "difficulty": "intermediate"},
        {"slug": "single-inheritance", "title": "Single Inheritance: Method Overriding, super Keyword, and Method Resolution", "section": "Inheritance", "difficulty": "beginner"},
        {"slug": "multiple-inheritance-mixins", "title": "Multiple Inheritance, Interfaces, and Mixins: Diamond Problem and Solutions", "section": "Inheritance", "difficulty": "intermediate"},
        {"slug": "polymorphism-types", "title": "Polymorphism: Compile-Time (Overloading) and Runtime (Overriding) Dispatch", "section": "Polymorphism", "difficulty": "intermediate"},
        {"slug": "composition-over-inheritance", "title": "Composition Over Inheritance: Has-A vs Is-A and Delegation Pattern", "section": "OOP Principles", "difficulty": "intermediate"},
        {"slug": "design-patterns-behavioral", "title": "Behavioral Design Patterns: Observer, Strategy, Command, State, and Iterator", "section": "Design Patterns", "difficulty": "intermediate"},
        {"slug": "design-patterns-structural-advanced", "title": "Structural Patterns Deep Dive: Decorator, Bridge, Composite, Proxy, and Flyweight", "section": "Design Patterns", "difficulty": "intermediate"},
        {"slug": "dependency-injection", "title": "Dependency Injection: IoC Container, Constructor/Setter/Field Injection", "section": "OOP Principles", "difficulty": "intermediate"},
        {"slug": "dry-kiss-yagni", "title": "DRY, KISS, YAGNI Principles: Code Quality and Design Heuristics", "section": "OOP Principles", "difficulty": "beginner"},
        {"slug": "dip-lsp-isp", "title": "DIP, LSP, and ISP: Dependency Inversion, Liskov Substitution, Interface Segregation", "section": "SOLID Principles", "difficulty": "intermediate"},
        {"slug": "exception-handling-oop", "title": "Exception Handling: Checked/Unchecked Exceptions, Custom Exceptions, and Best Practices", "section": "OOP in Practice", "difficulty": "intermediate"},
        {"slug": "generics-templates", "title": "Generics and Templates: Type Bounds, Wildcards, and Type Erasure", "section": "OOP in Practice", "difficulty": "intermediate"},
        {"slug": "collections-framework", "title": "Collections Framework: List, Set, Map, Queue Implementations and Big-O Analysis", "section": "OOP in Practice", "difficulty": "intermediate"},
        {"slug": "concurrency-oop", "title": "Concurrency in OOP: Threads, Synchronization, Locks, and Thread-Safe Patterns", "section": "OOP in Practice", "difficulty": "advanced"},
        {"slug": "functional-oop", "title": "Functional Programming in OOP: Lambdas, Streams, and Function Objects", "section": "Modern OOP", "difficulty": "intermediate"},
        {"slug": "uml-class-diagrams", "title": "UML Class Diagrams: Notation, Relationships, and Design Documentation", "section": "Design Documentation", "difficulty": "beginner"},
        {"slug": "tdd-oop", "title": "Test-Driven Development: Unit Testing, Mocking, and Test Doubles in OOP", "section": "Testing OOP", "difficulty": "intermediate"},
        {"slug": "refactoring-code-smells", "title": "Refactoring: Code Smells, Extract Method, Replace Conditional with Polymorphism", "section": "OOP in Practice", "difficulty": "intermediate"},
        {"slug": "domain-driven-design", "title": "Domain-Driven Design: Aggregates, Value Objects, Repositories, and Bounded Contexts", "section": "Advanced OOP", "difficulty": "advanced"},
        {"slug": "oop-in-python-cpp", "title": "OOP in Python and C++: Language-Specific Features, Operator Overloading", "section": "Language-Specific OOP", "difficulty": "intermediate"},
        {"slug": "placement-guide", "title": "Placement Guide: OOP Interview Questions, LLD Rounds, and Design Practice", "section": "Career", "difficulty": "beginner"},
    ]
}

# ─────────────────────────────────────────────────────────────────────────────
# 13. OPERATING SYSTEMS
# ─────────────────────────────────────────────────────────────────────────────
COURSES["operating-systems"] = {
    "course": "operating-systems",
    "title": "Operating Systems: Three Easy Pieces",
    "textbook_refs": ["Arpaci-Dusseau: Operating Systems: Three Easy Pieces", "Silberschatz, Galvin, Gagne: Operating System Concepts 10th Ed", "Tanenbaum & Bos: Modern Operating Systems 5th Ed"],
    "topics": [
        {"slug": "os-history-structure", "title": "OS History and Structure: Monolithic, Microkernel, and Hybrid Architectures", "section": "Introduction", "difficulty": "beginner"},
        {"slug": "system-calls-api", "title": "System Calls and OS API: User Mode, Kernel Mode, and Trap Mechanism", "section": "Introduction", "difficulty": "beginner"},
        {"slug": "process-creation-fork-exec", "title": "Process Creation: fork(), exec(), wait(), and Process Lifecycle", "section": "Process Management", "difficulty": "intermediate"},
        {"slug": "threads-concurrency", "title": "Threads and Concurrency: POSIX Threads, Thread Models, and Concurrency Hazards", "section": "Concurrency", "difficulty": "intermediate"},
        {"slug": "inter-process-communication", "title": "Inter-Process Communication: Pipes, FIFOs, Message Queues, Shared Memory, Sockets", "section": "Process Management", "difficulty": "intermediate"},
        {"slug": "mutex-semaphores-monitors", "title": "Mutex, Semaphores, and Monitors: Classical Synchronization Primitives", "section": "Synchronization", "difficulty": "intermediate"},
        {"slug": "classical-sync-problems", "title": "Classical Synchronization Problems: Producer-Consumer, Readers-Writers, Dining Philosophers", "section": "Synchronization", "difficulty": "intermediate"},
        {"slug": "condition-variables", "title": "Condition Variables: Mesa vs Hoare Semantics and Spurious Wakeups", "section": "Synchronization", "difficulty": "intermediate"},
        {"slug": "lock-free-concurrent", "title": "Lock-Free Data Structures: CAS Operations, ABA Problem, and Memory Ordering", "section": "Advanced Synchronization", "difficulty": "advanced"},
        {"slug": "scheduling-algorithms-deep-dive", "title": "CPU Scheduling Algorithms: FCFS, SJF, SRTF, Round Robin, Multilevel Queues", "section": "CPU Scheduling", "difficulty": "intermediate"},
        {"slug": "real-time-scheduling", "title": "Real-Time Scheduling: EDF, RMS, and Hard vs Soft Real-Time Constraints", "section": "CPU Scheduling", "difficulty": "advanced"},
        {"slug": "multiprocessor-scheduling", "title": "Multiprocessor and Gang Scheduling: Load Balancing and CPU Affinity", "section": "CPU Scheduling", "difficulty": "advanced"},
        {"slug": "deadlock-detection-recovery", "title": "Deadlock Detection and Recovery: Resource Allocation Graphs and Banker's Algorithm", "section": "Deadlocks", "difficulty": "intermediate"},
        {"slug": "paging-segmentation", "title": "Paging and Segmentation: Address Translation, Page Tables, and Segfaults", "section": "Memory Management", "difficulty": "intermediate"},
        {"slug": "tlb-address-translation", "title": "TLB and Multi-Level Page Tables: CR3 Register, ASID, and Inverted Page Tables", "section": "Memory Management", "difficulty": "advanced"},
        {"slug": "page-replacement-algorithms", "title": "Page Replacement Algorithms: FIFO, LRU, Clock, Working Set, and Thrashing", "section": "Virtual Memory", "difficulty": "intermediate"},
        {"slug": "demand-paging-copy-on-write", "title": "Demand Paging and Copy-on-Write: mmap(), Memory-Mapped Files, and Swapping", "section": "Virtual Memory", "difficulty": "advanced"},
        {"slug": "memory-allocators", "title": "Memory Allocators: Buddy System, Slab Allocator, and dlmalloc Internals", "section": "Memory Management", "difficulty": "advanced"},
        {"slug": "file-system-implementation", "title": "File System Implementation: Inodes, Directory Structure, and Block Allocation", "section": "File Systems", "difficulty": "intermediate"},
        {"slug": "directory-structures", "title": "Directory Structures: Tree, Acyclic Graph, and Hard Links vs Symbolic Links", "section": "File Systems", "difficulty": "intermediate"},
        {"slug": "journaling-log-structured", "title": "Journaling and Log-Structured File Systems: Crash Consistency and Ext4/ZFS", "section": "File Systems", "difficulty": "advanced"},
        {"slug": "disk-scheduling", "title": "Disk Scheduling: FCFS, SSTF, SCAN, C-SCAN, and Look Algorithms", "section": "I/O Management", "difficulty": "intermediate"},
        {"slug": "io-management-devices", "title": "I/O Subsystem: Device Drivers, IRQs, DMA, and I/O Schedulers", "section": "I/O Management", "difficulty": "intermediate"},
        {"slug": "linux-kernel-internals", "title": "Linux Kernel Internals: Process Scheduler, VFS Layer, and Kernel Modules", "section": "OS Implementations", "difficulty": "advanced"},
        {"slug": "windows-internals", "title": "Windows OS Architecture: NT Kernel, HAL, Win32 API, and Registry", "section": "OS Implementations", "difficulty": "advanced"},
        {"slug": "boot-process-bios-uefi", "title": "Boot Process: BIOS/UEFI, GRUB, Kernel Initialization, and init/systemd", "section": "OS Internals", "difficulty": "intermediate"},
        {"slug": "virtualization-hypervisors", "title": "Virtualization: Type-1/Type-2 Hypervisors, KVM, VMware, and Paravirtualization", "section": "Virtualization", "difficulty": "advanced"},
        {"slug": "containers-namespaces", "title": "Containers and Namespaces: Linux cgroups, namespaces, Docker, and OCI", "section": "Virtualization", "difficulty": "advanced"},
        {"slug": "os-security-protection", "title": "OS Security: Access Control, Capabilities, SELinux, and Privilege Escalation", "section": "Security", "difficulty": "advanced"},
        {"slug": "garbage-collection-os", "title": "Memory Reclamation: Garbage Collection in OS Context and RCU Mechanism", "section": "Advanced Memory", "difficulty": "advanced"},
        {"slug": "distributed-os-concepts", "title": "Distributed OS Concepts: Remote Procedure Calls, Distributed Shared Memory", "section": "Advanced Topics", "difficulty": "advanced"},
        {"slug": "placement-guide", "title": "Placement Guide: OS Interview Questions, GATE Preparation, and Kernel Programming", "section": "Career", "difficulty": "beginner"},
    ]
}

# ─────────────────────────────────────────────────────────────────────────────
# 14. QUANTUM COMPUTING
# ─────────────────────────────────────────────────────────────────────────────
# Existing 29 pages:
# density-matrices-mixed-states, deutschs-jozsa-algorithm, fault-tolerant-quantum-computation,
# grovers-algorithm, index, interview-prep, linear-algebra-for-quantum,
# open-quantum-systems-decoherence, overview, qiskit-programming, quantum-approximate-optimization-algorithm,
# quantum-complexity-theory, quantum-entanglement-bell-states, quantum-error-correction,
# quantum-fourier-transform, quantum-gates-circuits, quantum-hardware-technologies,
# quantum-machine-learning, quantum-measurement, quantum-mechanics-foundations,
# quantum-phase-estimation, quantum-simulation-chemistry, quantum-teleportation-superdense-coding,
# quantum-walks, qubits-superposition-bloch-sphere, shors-algorithm, simons-algorithm,
# topological-quantum-computing, variational-quantum-algorithms

COURSES["quantum-computing"] = {
    "course": "quantum-computing",
    "title": "Quantum Computing: An Applied Approach",
    "textbook_refs": ["Nielsen & Chuang: Quantum Computation and Quantum Information", "Hidary: Quantum Computing: An Applied Approach 2nd Ed", "Mermin: Quantum Computer Science"],
    "topics": [
        {"slug": "bernstein-vazirani-algorithm", "title": "Bernstein–Vazirani Algorithm: Hidden String with One Query", "section": "Quantum Algorithms", "difficulty": "intermediate"},
        {"slug": "quantum-amplitude-amplification", "title": "Quantum Amplitude Amplification: Generalizing Grover's Search", "section": "Quantum Algorithms", "difficulty": "advanced"},
        {"slug": "hhl-algorithm", "title": "HHL Algorithm: Quantum Linear Systems and Speedup Conditions", "section": "Quantum Algorithms", "difficulty": "advanced"},
        {"slug": "quantum-counting", "title": "Quantum Counting Algorithm: Combining QPE and Grover's Search", "section": "Quantum Algorithms", "difficulty": "advanced"},
        {"slug": "adiabatic-quantum-computation", "title": "Adiabatic Quantum Computation: Adiabatic Theorem and Optimization Problems", "section": "Quantum Models", "difficulty": "advanced"},
        {"slug": "quantum-annealing", "title": "Quantum Annealing: D-Wave Architecture and Ising Model Formulation", "section": "Quantum Hardware", "difficulty": "intermediate"},
        {"slug": "stabilizer-formalism", "title": "Stabilizer Formalism: Pauli Group, Clifford Circuits, and Gottesman–Knill Theorem", "section": "Quantum Error Correction", "difficulty": "advanced"},
        {"slug": "surface-codes", "title": "Surface Codes: Toric Code, Logical Qubits, and Threshold Theorem", "section": "Quantum Error Correction", "difficulty": "advanced"},
        {"slug": "quantum-key-distribution", "title": "Quantum Key Distribution: BB84 Protocol, E91, and Quantum Cryptography", "section": "Quantum Cryptography", "difficulty": "intermediate"},
        {"slug": "quantum-random-number-generation", "title": "Quantum Random Number Generation: True Randomness and Certification", "section": "Quantum Applications", "difficulty": "beginner"},
        {"slug": "nisq-algorithms", "title": "NISQ Algorithms: Noise-Adapted Quantum Computing and Error Mitigation", "section": "Near-Term Quantum", "difficulty": "advanced"},
        {"slug": "quantum-chemistry-algorithms", "title": "Quantum Chemistry Algorithms: VQE for Molecular Energies", "section": "Quantum Applications", "difficulty": "advanced"},
        {"slug": "quantum-advantage-supremacy", "title": "Quantum Advantage and Supremacy: Boson Sampling and Random Circuit Sampling", "section": "Quantum Theory", "difficulty": "advanced"},
        {"slug": "photonic-quantum-computing", "title": "Photonic Quantum Computing: Linear Optical Circuits and Measurement-Based QC", "section": "Quantum Hardware", "difficulty": "advanced"},
        {"slug": "quantum-network-protocols", "title": "Quantum Networks: Quantum Repeaters, Entanglement Swapping, and Quantum Internet", "section": "Quantum Networking", "difficulty": "advanced"},
        {"slug": "cirq-pennylane-programming", "title": "Quantum Programming with Cirq and PennyLane: Gates, Circuits, and Gradients", "section": "Quantum Programming", "difficulty": "intermediate"},
        {"slug": "placement-guide", "title": "Placement Guide: Quantum Computing Career Paths and Research Directions", "section": "Career", "difficulty": "beginner"},
    ]
}

# ─────────────────────────────────────────────────────────────────────────────
# 15. ROBOTICS
# ─────────────────────────────────────────────────────────────────────────────
# Existing 30 pages (all listed above)

COURSES["robotics"] = {
    "course": "robotics",
    "title": "Robotics: Modelling, Planning, and Control",
    "textbook_refs": ["Siciliano et al.: Robotics: Modelling, Planning and Control", "Thrun, Burgard, Fox: Probabilistic Robotics", "LaValle: Planning Algorithms"],
    "topics": [
        {"slug": "euler-angles-quaternions", "title": "Euler Angles and Quaternions: Rotation Representations and Gimbal Lock", "section": "Math for Robotics", "difficulty": "intermediate"},
        {"slug": "homogeneous-transforms", "title": "Homogeneous Transformation Matrices: Composition of Rotations and Translations", "section": "Math for Robotics", "difficulty": "intermediate"},
        {"slug": "workspace-analysis", "title": "Workspace Analysis: Reachable and Dexterous Workspace of Robot Arms", "section": "Kinematics", "difficulty": "intermediate"},
        {"slug": "force-torque-control", "title": "Force and Torque Control: Impedance Control and Force-Position Hybrid Control", "section": "Control", "difficulty": "advanced"},
        {"slug": "mobile-robot-kinematics", "title": "Mobile Robot Kinematics: Differential Drive, Ackermann Steering, and Holonomic Robots", "section": "Mobile Robotics", "difficulty": "intermediate"},
        {"slug": "occupancy-grid-mapping", "title": "Occupancy Grid Mapping: Bayesian Updates and Log-Odds Representation", "section": "Mapping", "difficulty": "intermediate"},
        {"slug": "graph-slam", "title": "Graph-Based SLAM: Pose Graphs, g2o, and Factor Graph Optimization", "section": "SLAM", "difficulty": "advanced"},
        {"slug": "deep-learning-robotics", "title": "Deep Learning for Robotics: Object Grasping, Visual Servoing, and Scene Understanding", "section": "Learning-Based Robotics", "difficulty": "advanced"},
        {"slug": "motion-primitives", "title": "Motion Primitives and Trajectory Libraries: Dynamic Movement Primitives (DMP)", "section": "Motion Planning", "difficulty": "advanced"},
        {"slug": "soft-robotics", "title": "Soft Robotics: Continuum Mechanics, Actuation Mechanisms, and Control Challenges", "section": "Robot Design", "difficulty": "advanced"},
        {"slug": "human-robot-interaction", "title": "Human-Robot Interaction: Safety Standards, Cobots, and Intent Prediction", "section": "HRI", "difficulty": "intermediate"},
        {"slug": "multi-robot-systems", "title": "Multi-Robot Systems: Task Allocation, Formation Control, and Swarm Robotics", "section": "Multi-Robot", "difficulty": "advanced"},
        {"slug": "drone-uav-systems", "title": "Drone and UAV Systems: Quadrotor Dynamics, PX4, and Autonomous Navigation", "section": "Aerial Robotics", "difficulty": "advanced"},
        {"slug": "robotic-manipulation-advanced", "title": "Advanced Manipulation: Grasp Planning, Regrasping, and In-Hand Manipulation", "section": "Manipulation", "difficulty": "advanced"},
        {"slug": "placement-guide", "title": "Placement Guide: Robotics Industry Overview, Interview Topics, and Research Areas", "section": "Career", "difficulty": "beginner"},
    ]
}

# ─────────────────────────────────────────────────────────────────────────────
# 16. SOFTWARE ENGINEERING
# ─────────────────────────────────────────────────────────────────────────────
# Existing 38 pages (all listed above)

COURSES["software-engineering"] = {
    "course": "software-engineering",
    "title": "Software Engineering: Principles and Practice",
    "textbook_refs": ["Pressman & Maxim: Software Engineering 9th Ed", "Sommerville: Software Engineering 10th Ed", "Fowler: Patterns of Enterprise Application Architecture"],
    "topics": [
        {"slug": "software-process-models-advanced", "title": "Advanced Process Models: SAFe, LeSS, and Disciplined Agile Delivery", "section": "Process", "difficulty": "intermediate"},
        {"slug": "use-case-user-stories", "title": "Use Cases and User Stories: INVEST Criteria, Acceptance Criteria, and Story Mapping", "section": "Requirements", "difficulty": "beginner"},
        {"slug": "software-metrics", "title": "Software Metrics: Halstead Metrics, McCabe Complexity, and Code Churn", "section": "Quality", "difficulty": "intermediate"},
        {"slug": "formal-methods-verification", "title": "Formal Methods and Verification: Model Checking, Z Notation, and TLA+", "section": "Quality", "difficulty": "advanced"},
        {"slug": "event-driven-architecture", "title": "Event-Driven Architecture: Event Sourcing, CQRS, and Saga Pattern", "section": "Architecture", "difficulty": "advanced"},
        {"slug": "hexagonal-architecture", "title": "Hexagonal and Clean Architecture: Ports, Adapters, and Dependency Inversion", "section": "Architecture", "difficulty": "advanced"},
        {"slug": "microservices-patterns", "title": "Microservices Patterns: Service Mesh, Sidecar, Circuit Breaker, and Strangler Fig", "section": "Architecture", "difficulty": "advanced"},
        {"slug": "feature-flags-progressive-delivery", "title": "Feature Flags and Progressive Delivery: Canary Releases and A/B Testing", "section": "DevOps", "difficulty": "intermediate"},
        {"slug": "infrastructure-as-code", "title": "Infrastructure as Code: Terraform, Pulumi, and Cloud Formation Templates", "section": "DevOps", "difficulty": "intermediate"},
        {"slug": "site-reliability-engineering", "title": "Site Reliability Engineering: SLO/SLA/SLI, Error Budgets, and Toil Reduction", "section": "Reliability", "difficulty": "advanced"},
        {"slug": "chaos-engineering", "title": "Chaos Engineering: Principles, Netflix Chaos Monkey, and Resilience Testing", "section": "Reliability", "difficulty": "advanced"},
        {"slug": "technical-debt-management", "title": "Technical Debt Management: Identification, Measurement, and Strategic Repayment", "section": "Code Quality", "difficulty": "intermediate"},
        {"slug": "pair-programming-code-review", "title": "Pair Programming and Code Review: Best Practices, Psychological Safety", "section": "Development Practices", "difficulty": "beginner"},
        {"slug": "mutation-testing", "title": "Mutation Testing: Test Suite Quality and Mutation Score Analysis", "section": "Testing", "difficulty": "advanced"},
        {"slug": "property-based-testing", "title": "Property-Based Testing: QuickCheck, Hypothesis, and Shrinking Counterexamples", "section": "Testing", "difficulty": "advanced"},
        {"slug": "platform-engineering", "title": "Platform Engineering: Internal Developer Platforms and Golden Paths", "section": "Modern SE", "difficulty": "advanced"},
        {"slug": "ai-assisted-development", "title": "AI-Assisted Development: Copilot, Code Generation, and Prompt Engineering for SE", "section": "Modern SE", "difficulty": "intermediate"},
        {"slug": "placement-guide", "title": "Placement Guide: SE Interview Questions, LLD Design Rounds, and SDI Resources", "section": "Career", "difficulty": "beginner"},
    ]
}

# ─────────────────────────────────────────────────────────────────────────────
# 17. VLSI DESIGN
# ─────────────────────────────────────────────────────────────────────────────
# Existing 28 pages (all listed above)

COURSES["vlsi-design"] = {
    "course": "vlsi-design",
    "title": "VLSI Design: Circuits, Systems, and Applications",
    "textbook_refs": ["Weste & Harris: CMOS VLSI Design 4th Ed", "Rabaey, Chandrakasan, Nikolic: Digital Integrated Circuits 2nd Ed", "Uyemura: Introduction to VLSI Circuits and Systems"],
    "topics": [
        {"slug": "mos-transistor-theory", "title": "MOS Transistor Theory: Threshold Voltage, I-V Characteristics, and Short-Channel Effects", "section": "Device Physics", "difficulty": "intermediate"},
        {"slug": "transmission-gates-pass-transistors", "title": "Transmission Gates and Pass Transistor Logic: Design and Analysis", "section": "CMOS Circuits", "difficulty": "intermediate"},
        {"slug": "dynamic-cmos-circuits", "title": "Dynamic CMOS Circuits: Domino Logic, NORA, and Charge Sharing", "section": "CMOS Circuits", "difficulty": "advanced"},
        {"slug": "standard-cell-design", "title": "Standard Cell Library Design: Cell Layout, Characterization, and LEF/DEF", "section": "Physical Design", "difficulty": "advanced"},
        {"slug": "power-grid-design", "title": "Power Grid Design and IR Drop Analysis: Decoupling Capacitors and EM Rules", "section": "Physical Design", "difficulty": "advanced"},
        {"slug": "eda-tools-flow", "title": "EDA Tools and Design Flow: Synopsys, Cadence, and Mentor Toolchains", "section": "Design Flow", "difficulty": "intermediate"},
        {"slug": "functional-verification", "title": "Functional Verification: UVM Methodology, Assertions (SVA), and Coverage-Driven Verification", "section": "Verification", "difficulty": "advanced"},
        {"slug": "formal-verification-vlsi", "title": "Formal Verification: Equivalence Checking, Model Checking with CBMC and Cadence JasperGold", "section": "Verification", "difficulty": "advanced"},
        {"slug": "analog-mixed-signal", "title": "Analog and Mixed-Signal Design: ADC, DAC, PLLs, and Op-Amp Basics", "section": "Mixed-Signal", "difficulty": "advanced"},
        {"slug": "rf-vlsi", "title": "RF VLSI Design: LNA, Mixer, and PA Design for Wireless Chips", "section": "RF Design", "difficulty": "advanced"},
        {"slug": "advanced-packaging", "title": "Advanced Packaging: 2.5D/3D ICs, Chiplets, and HBM Memory Integration", "section": "Packaging", "difficulty": "advanced"},
        {"slug": "tcl-scripting-eda", "title": "TCL Scripting for EDA Automation: Synopsys DC, Innovus, and Calibre Scripts", "section": "Design Automation", "difficulty": "intermediate"},
        {"slug": "emulation-fpga-prototype", "title": "FPGA-Based Prototyping and Emulation: Veloce, Palladium, and Design Partitioning", "section": "Prototyping", "difficulty": "advanced"},
        {"slug": "placement-guide", "title": "Placement Guide: VLSI Industry Overview, Interview Topics, and Job Roles (DFT, PD, DV)", "section": "Career", "difficulty": "beginner"},
    ]
}

# ─────────────────────────────────────────────────────────────────────────────
# WRITE ALL FILES
# ─────────────────────────────────────────────────────────────────────────────
for course_id, data in COURSES.items():
    path = os.path.join(OUT, f"{course_id}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"Wrote {path}  ({len(data['topics'])} topics)")

print(f"\nDone. {len(COURSES)} files written to {OUT}")
