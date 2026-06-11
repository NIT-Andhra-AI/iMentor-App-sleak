# OOP Placement Interview Guide

## Overview
This page distills the top OOP and Java questions asked in placement drives at TCS, Infosys, Wipro, Cognizant, Accenture, HCL, and product-based companies recruiting from AP colleges. It covers MCQ patterns, output prediction questions, design questions, and hands-on coding problems with answers.

## Top 50 OOP Interview Questions

### Section 1: Core OOP Concepts (MCQ Style)

**Q1. What is the output?**
```java
class A { void show() { System.out.println("A"); } }
class B extends A { void show() { System.out.println("B"); } }
A obj = new B();
obj.show();
```
**Answer: B** — Runtime polymorphism. Actual type (B) determines which `show()` is called.

**Q2. What is the output?**
```java
String s1 = "java";
String s2 = "java";
String s3 = new String("java");
System.out.println(s1 == s2);    // true (same pool object)
System.out.println(s1 == s3);    // false (s3 is on heap, not pool)
System.out.println(s1.equals(s3)); // true (same content)
```

**Q3. Can we have multiple `main` methods in Java?**
Yes — via method overloading. But only `public static void main(String[] args)` is the JVM entry point.

**Q4. What is the output of this `finally` block?**
```java
int test() {
    try { return 1; }
    finally { return 2; }
}
System.out.println(test()); // 2 — finally's return overrides try's return
```

**Q5. Can abstract class have a constructor?**
Yes. It is called when a concrete subclass object is instantiated via `super()`.

### Section 2: Inheritance Questions

**Q6. What does the `super` keyword do?**
Accesses the parent class's fields, methods, and constructors. `super()` must be the first line in a constructor.

**Q7. Can we override a `static` method?**
No — static methods are **hidden**, not overridden. The method called depends on the reference type, not the object type (compile-time resolution).

**Q8. What is a covariant return type?**
An overriding method can return a **subtype** of the original return type. Example: parent returns `Animal`, override returns `Dog`.

**Q9. What is the diamond problem? How does Java solve it?**
Diamond problem: if A extends B and C, and both B and C override a method from a common parent, which version does A inherit? Java solves this by not allowing multiple class inheritance. Interfaces with default methods require explicit override if diamond ambiguity occurs.

### Section 3: Encapsulation & Abstraction

**Q10. Difference between abstraction and encapsulation?**
- **Abstraction**: hiding *what* the implementation does (what capabilities exist) — achieved via abstract classes, interfaces.
- **Encapsulation**: hiding *how* the implementation works (internal state) — achieved via private fields + public methods.

**Q11. What is the difference between an interface and an abstract class?**
Abstract classes can have state (instance fields), constructors, and concrete methods. Interfaces (pre-Java 8) are pure contracts. A class can extend only ONE abstract class but implement MULTIPLE interfaces.

### Section 4: Common Coding Problems

**Q12. Implement a Singleton class in Java.**
```java
class Singleton {
    private static Singleton instance;
    private Singleton() {}  // private constructor
    public static synchronized Singleton getInstance() {
        if (instance == null) instance = new Singleton();
        return instance;
    }
}
```

**Q13. Reverse a string without using StringBuilder.reverse().**
```java
String reverse(String s) {
    char[] arr = s.toCharArray();
    int l = 0, r = arr.length - 1;
    while (l < r) { char t = arr[l]; arr[l++] = arr[r]; arr[r--] = t; }
    return new String(arr);
}
```

**Q14. Check if two strings are anagrams.**
```java
boolean isAnagram(String a, String b) {
    if (a.length() != b.length()) return false;
    int[] freq = new int[26];
    for (char c : a.toCharArray()) freq[c - 'a']++;
    for (char c : b.toCharArray()) { if (--freq[c - 'a'] < 0) return false; }
    return true;
}
```

**Q15. Implement a stack using two queues.**
Use two Queues. On `push`, add to q1. On `pop`, move all elements from q1 to q2 except the last, pop the last, swap q1 and q2.

### Section 5: Tricky Output Questions

**Q16.** `System.out.println(1 + 2 + "3");` → **"33"** (left-to-right: 1+2=3, then "3"+"3"="33")
**Q17.** `System.out.println("3" + 1 + 2);` → **"312"** (left-to-right: "3"+1="31", "31"+2="312")
**Q18.** `System.out.println(0.1 + 0.2 == 0.3);` → **false** (floating-point precision issue)
**Q19.** `Integer a = 127; Integer b = 127; a == b;` → **true** (Integer cache: -128 to 127)
**Q20.** `Integer a = 128; Integer b = 128; a == b;` → **false** (outside cache range, different objects)

### Section 6: Design Questions (Higher Package Companies)

**Q21. Design a library management system using OOP.**
Classes: `Book` (title, author, ISBN, isAvailable), `Member` (id, name, List<Book> borrowed), `Library` (List<Book>, addBook(), issueBook(), returnBook(), searchByAuthor()). Use HashMap for O(1) ISBN lookup.

**Q22. Explain the Factory design pattern.**
A Factory method returns an instance of the correct subclass based on input, hiding the instantiation logic from the client.
```java
abstract class Animal { static Animal create(String type) {
    return type.equals("dog") ? new Dog() : new Cat(); } }
```

## AP Placement Strategy
1. **TCS NQT**: Focus on OOP MCQs, Java output questions, logical reasoning
2. **Infosys**: Focus on pattern-based output, String manipulation, basic OOPS concepts
3. **Wipro**: Java basics, Exception handling, Collections
4. **Product companies (startups)**: DSA + OOP design questions, system design basics

## Related Topics
- [[inheritance-polymorphism]] — Review before this page
- [[interfaces-abstract-classes]] — Abstract class vs Interface questions
- [[java-collections]] — Collections placement patterns
- [[java-strings]] — String MCQ traps
