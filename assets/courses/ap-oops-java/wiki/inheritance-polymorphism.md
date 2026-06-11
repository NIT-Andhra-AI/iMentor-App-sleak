# Inheritance and Polymorphism

## Overview
Inheritance and polymorphism are the most tested OOP concepts in AP CSE exams and placement drives. **Inheritance** enables code reuse by allowing a subclass to inherit fields and methods from a parent class. **Polymorphism** allows a single reference type to behave differently based on the actual object it points to at runtime. These two concepts together form the backbone of design patterns and frameworks used in industry.

## Key Concepts

### Inheritance with `extends`
```java
class Animal {
    String name;
    Animal(String name) { this.name = name; }
    void speak() { System.out.println(name + " makes a sound"); }
    void eat()   { System.out.println(name + " eats"); }
}

class Dog extends Animal {
    String breed;
    Dog(String name, String breed) {
        super(name);         // calls Animal constructor — MUST be first statement
        this.breed = breed;
    }
    @Override
    void speak() {           // method overriding
        System.out.println(name + " barks");
    }
}
```

**Rules of Inheritance:**
- Java supports **single inheritance** (one class can only extend one parent).
- Java supports **multilevel inheritance** (A extends B extends C).
- Java does NOT support **multiple inheritance** via classes (diamond problem) — use interfaces instead.
- Constructors are **not inherited**, but the subclass must call the parent constructor via `super()`.
- `private` members of parent are NOT accessible in child (even though they exist in memory).

### `super` Keyword
- `super()` calls the parent constructor — must be the first statement in child constructor.
- `super.method()` calls the parent's version of an overridden method.
- If you don't explicitly call `super()`, the compiler inserts `super()` (no-arg) automatically — compile error if parent has no no-arg constructor.

### Method Overriding (Runtime Polymorphism)
- Subclass provides a new implementation for a method already defined in the parent.
- Method signature (name + parameters) must be **exactly the same**.
- Return type must be same or a **covariant subtype** (Java 5+).
- Access modifier can be **same or wider** (cannot be more restrictive).
- `@Override` annotation is optional but strongly recommended — catches signature mismatches at compile time.

### Dynamic Method Dispatch
```java
Animal a = new Dog("Rex", "Labrador");  // reference type = Animal, actual type = Dog
a.speak();  // prints "Rex barks" — Dog's speak() is called, NOT Animal's
```
Java resolves overridden method calls at **runtime** based on the actual object type (not the reference type). This is the mechanism of **runtime polymorphism** / **dynamic dispatch**.

### Method Overloading (Compile-Time Polymorphism)
Same method name, different parameter lists. Resolved at compile time by the compiler based on argument types. NOT the same as overriding.

```java
class Calculator {
    int add(int a, int b)       { return a + b; }
    double add(double a, double b) { return a + b; }  // overloaded
    int add(int a, int b, int c) { return a + b + c;  // overloaded
}
```

### `instanceof` and Casting
```java
Animal a = new Dog("Rex", "Lab");
if (a instanceof Dog) {
    Dog d = (Dog) a;     // downcast — safe because we checked
    System.out.println(d.breed);
}
```
Casting up the hierarchy (upcasting) is implicit and safe. Casting down (downcasting) requires explicit cast and can throw `ClassCastException` if wrong.

### Inheritance Hierarchy and `Object` Class
Every class in Java implicitly extends `java.lang.Object`. Key `Object` methods:
- `toString()` — default returns `ClassName@hashcode`; usually overridden for readable output
- `equals(Object o)` — default checks reference equality; override for value equality
- `hashCode()` — must be consistent with `equals()`; objects that are `.equals()` must have same `hashCode()`
- `clone()` — shallow copy (protected; implement `Cloneable` to make accessible)

## Examples
```java
// Polymorphic method
void makeAllSpeak(Animal[] animals) {
    for (Animal a : animals) {
        a.speak();  // correct overridden version called for each actual type
    }
}

Animal[] zoo = { new Dog("Rex", "Lab"), new Cat("Whiskers"), new Animal("Generic") };
makeAllSpeak(zoo);
// Output:
// Rex barks
// Whiskers meows
// Generic makes a sound
```

## Common Exam Questions
- What is the difference between method overloading and method overriding?
- Can we override a `static` method? No — static methods are resolved at compile time (method hiding).
- Can we override a `final` method? No — compile error.
- What is `ClassCastException`? How do you avoid it?
- Explain why `super()` must be the first statement in a subclass constructor.

## Related Topics
- [[interfaces-abstract-classes]] — Another mechanism of polymorphism
- [[java-classes-objects]] — Parent class fundamentals
- [[oops-placement-interview]] — Inheritance-heavy MCQs and tricky output questions
