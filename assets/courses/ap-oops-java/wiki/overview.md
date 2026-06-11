# Object-Oriented Programming with Java — Course Overview

## Overview
Object-Oriented Programming (OOP) with Java is a cornerstone of the AP Andhra Pradesh Intermediate Computer Science curriculum and is among the most heavily tested subjects in campus placements across TCS, Infosys, Wipro, Cognizant, and product-based companies. This course covers the complete AP CSE (Course Code 319) OOP syllabus and extends it with placement-critical patterns, Java standard library internals, and common interview problem types.

## Key Concepts

### Why OOP and Java Matter for Placements
Java is the most popular language for campus placement coding rounds in Andhra Pradesh colleges. OOP principles — Encapsulation, Inheritance, Polymorphism, Abstraction — are tested directly in aptitude rounds, MCQ assessments, and coding interviews. Understanding how Java implements these principles under the hood (method dispatch, vtable, JVM memory model) separates candidates who score vs. those who excel.

### The Four Pillars of OOP (AP Syllabus)
**Encapsulation** wraps data and behavior into a single unit (class). Access modifiers (`private`, `protected`, `public`, `default`) enforce information hiding. Java Bean pattern uses private fields with public getters/setters. **Inheritance** allows a subclass to reuse and extend a parent class. Java supports single inheritance for classes but multiple inheritance via interfaces. `super` keyword accesses parent members. **Polymorphism** allows a single interface to represent different underlying forms — compile-time (method overloading) and runtime (method overriding via dynamic dispatch). **Abstraction** hides implementation details; achieved via abstract classes and interfaces. Java 8+ interfaces can have default and static methods.

### Classes, Objects, and Memory
A class is a blueprint; an object is an instance allocated on the Java heap. The JVM stack holds method frames with local variables and object references. The heap holds actual objects. Static members live in the Method Area (PermGen/Metaspace). Understanding this is critical for answering "what is the output" style questions in placement papers.

### Java-Specific OOP Features
Java provides constructors (default, parameterized, copy), `this` and `super` references, constructor chaining with `this()` and `super()`, static and instance initializer blocks, and `final` keyword (for constants, preventing override, and preventing inheritance). The `Object` class is the root of Java's class hierarchy — understanding `equals()`, `hashCode()`, `toString()`, `clone()`, and `compareTo()` is essential.

### Collections Framework and Generics
The Java Collections Framework (JCF) is built entirely on OOP principles. `List`, `Set`, `Map`, `Queue` are interfaces. `ArrayList`, `LinkedList`, `HashSet`, `TreeSet`, `HashMap`, `TreeMap` are concrete implementations. Generics provide type safety at compile time. Understanding when to use each collection and their time complexities is tested in almost every placement drive.

## Examples
- Modeling a **Bank Account** system using encapsulation, with `deposit()`, `withdraw()`, and `getBalance()` methods.
- Implementing a **Shape hierarchy** — abstract class `Shape` with abstract `area()`, extended by `Circle`, `Rectangle`, `Triangle`.
- Using **polymorphism** to process a `List<Animal>` where each animal `speak()`s differently.
- Implementing a **LRU Cache** using `LinkedHashMap` — a classic Java OOP + Collections interview problem.

## Common Exam Questions
- What is the difference between method overloading and method overriding?
- Can a constructor be `private`? When would you use it?
- Explain the difference between an abstract class and an interface. When do you use each?
- What is the output of calling a virtual method from a constructor?
- How does Java achieve runtime polymorphism? Explain dynamic method dispatch.

## Related Topics
- [[java-classes-objects]] — Detailed class and object creation mechanics
- [[inheritance-polymorphism]] — Deep dive into extends, implements, and method dispatch
- [[interfaces-abstract-classes]] — AP syllabus topic on abstraction
- [[java-collections]] — Collections Framework and Generics
- [[oops-placement-interview]] — Placement interview patterns and MCQ prep
