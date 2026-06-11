# Encapsulation and Access Modifiers

## Overview
Encapsulation bundles data (fields) and the methods that operate on that data into a single unit (class), and restricts direct access to internal state. It is one of the four pillars of OOP in the AP CSE syllabus. In practice, encapsulation is achieved using Java's access modifiers combined with getters and setters — a pattern used in every enterprise Java application.

## Key Concepts

### Access Modifiers (Visibility)

| Modifier | Same Class | Same Package | Subclass | Everywhere |
|----------|-----------|--------------|----------|------------|
| `private` | ✓ | ✗ | ✗ | ✗ |
| `default` (package-private) | ✓ | ✓ | ✗ (if different package) | ✗ |
| `protected` | ✓ | ✓ | ✓ | ✗ |
| `public` | ✓ | ✓ | ✓ | ✓ |

**Key point for placement exams:** `protected` is accessible in subclasses even if they are in a different package, BUT it is NOT accessible to non-subclass classes in a different package.

### Getters and Setters (JavaBean Pattern)
```java
public class BankAccount {
    private String accountNumber;
    private double balance;
    private String owner;

    public BankAccount(String accountNumber, String owner, double initialDeposit) {
        this.accountNumber = accountNumber;
        this.owner = owner;
        if (initialDeposit < 0) throw new IllegalArgumentException("Negative deposit");
        this.balance = initialDeposit;
    }

    // Getter — only read access
    public double getBalance() { return balance; }
    public String getOwner()   { return owner; }

    // No setter for balance — controlled mutation through methods
    public void deposit(double amount) {
        if (amount <= 0) throw new IllegalArgumentException("Deposit must be positive");
        balance += amount;
    }

    public void withdraw(double amount) {
        if (amount > balance) throw new IllegalStateException("Insufficient funds");
        balance -= amount;
    }
}
```
**Why encapsulate?** Without encapsulation, code like `account.balance = -999` would be valid Java. Encapsulation forces all mutations through validated methods, maintaining object invariants.

### Packages and Import
Packages organize classes into namespaces. Package declaration is the first statement in a file:
```java
package com.myapp.banking;
```
Import statements bring other classes into scope:
```java
import java.util.ArrayList;
import java.util.*;        // wildcard — imports all public classes in java.util
```
`java.lang` is automatically imported (contains `String`, `Integer`, `Math`, `Object`, `System`, etc.).

### `final` Revisited
- `final` field: must be initialized in declaration or constructor. Creates an effectively constant field.
- `final` local variable: can be assigned only once.
- Immutability: make a class immutable by making all fields `private final`, providing no setters, and returning defensive copies of mutable fields.

### `static` in Encapsulation Context
- `private static` fields are class-level secrets (e.g., a singleton instance).
- `public static final` fields are global constants (e.g., `Math.PI`).
- Utility classes (like `Math`, `Collections`) have all static methods and a private constructor to prevent instantiation.

### Builder Pattern (Advanced — Used in Interviews)
When a class has many optional fields, the constructor becomes unwieldy. The builder pattern provides a fluent API:
```java
Student student = new Student.Builder("Ravi")
    .rollNo(101)
    .gpa(8.5)
    .branch("CSE")
    .build();
```

## Examples
```java
// Demonstration of encapsulation violation vs proper encapsulation
// BAD — no encapsulation
class BadStudent { public int age; }
BadStudent bs = new BadStudent();
bs.age = -5;  // allowed! invalid state

// GOOD — encapsulation with validation
class GoodStudent {
    private int age;
    public void setAge(int age) {
        if (age < 0 || age > 120) throw new IllegalArgumentException("Invalid age");
        this.age = age;
    }
    public int getAge() { return age; }
}
```

## Common Exam Questions
- What is the default access modifier in Java? (package-private — no keyword)
- Can a private member of a parent class be accessed in a child class? No — not directly.
- What is the purpose of `private` constructor? To prevent instantiation (e.g., Singleton, utility class).
- What is an immutable class? Name a Java example. (String, Integer, LocalDate)
- How is encapsulation different from abstraction?

## Related Topics
- [[java-classes-objects]] — Fields and methods context
- [[inheritance-polymorphism]] — `protected` in action
- [[interfaces-abstract-classes]] — Abstraction vs encapsulation distinction
