# Control Flow and Methods

## Overview
Control flow determines the order in which statements execute. Java provides conditional branching (`if-else`, `switch`), looping (`for`, `while`, `do-while`), and method definitions for reusable logic. This is a foundational AP CSE syllabus topic and the basis for every coding problem in placement tests.

## Key Concepts

### if-else and Nested Conditions
```java
if (condition1) {
    // block 1
} else if (condition2) {
    // block 2
} else {
    // default block
}
```
**Dangling else:** In nested if-else without braces, `else` binds to the nearest preceding `if`. Always use braces `{}` to avoid confusion.

### switch Statement
```java
switch (variable) {
    case 1:
        // ...
        break;      // without break, falls through to next case
    case 2:
        // ...
        break;
    default:
        // ...
}
```
`switch` works with `byte`, `short`, `char`, `int`, `String` (Java 7+), and enums. **Fall-through** happens without `break` — a common MCQ trap. Java 14+ introduces `switch` expressions with `->` syntax.

### Loops

**for loop:** `for (init; condition; update)` — best when iteration count is known.
```java
for (int i = 0; i < n; i++) { ... }
```

**enhanced for (for-each):** Iterates over arrays and Collections. Cannot modify the collection during iteration.
```java
for (int x : arr) { System.out.println(x); }
```

**while loop:** Tests condition before execution. May execute 0 times.
```java
while (condition) { ... }
```

**do-while loop:** Tests condition after execution. Executes **at least once**.
```java
do { ... } while (condition);
```

**break and continue:** `break` exits the loop entirely. `continue` skips to the next iteration. With **labeled loops**, `break label` and `continue label` target an outer loop.

### Methods

**Method signature:** `returnType methodName(paramType param1, ...)`. Java is **pass-by-value** — for primitives, the value is copied. For objects, the reference is copied (so the object's state can be mutated, but the reference itself cannot be reassigned in the caller).

**Method overloading:** Same name, different parameter lists (type, number, or order). Return type alone does NOT differentiate overloaded methods. Resolved at **compile time** (static polymorphism).

**Variable arguments (varargs):** `void print(int... nums)` accepts 0 or more ints. Must be the last parameter.

**Recursion:** A method that calls itself. Requires a **base case** to prevent infinite recursion → `StackOverflowError`. Every recursive solution can be rewritten iteratively.

```java
// Recursive factorial
int factorial(int n) {
    if (n <= 1) return 1;  // base case
    return n * factorial(n - 1);  // recursive case
}
```

## Examples
```java
// Classic FizzBuzz — tests loops and conditions
for (int i = 1; i <= 100; i++) {
    if (i % 15 == 0) System.out.println("FizzBuzz");
    else if (i % 3 == 0) System.out.println("Fizz");
    else if (i % 5 == 0) System.out.println("Buzz");
    else System.out.println(i);
}

// Pass-by-value demonstration
void swap(int a, int b) { int t = a; a = b; b = t; }  // does NOT affect caller

// Pass-by-reference-value demonstration
void clear(int[] arr) { arr[0] = 0; }  // DOES modify the array object
```

## Common Exam Questions
- What is the output of a `switch` without `break` statements?
- What is the difference between `while` and `do-while`?
- Is Java pass-by-value or pass-by-reference? Explain with an example.
- Can you overload a method by changing only the return type? No — compile error.
- What is a `StackOverflowError`? How is it caused and prevented?

## Related Topics
- [[java-basics]] — Data types used in conditions and loop variables
- [[java-classes-objects]] — Methods inside classes
- [[java-collections]] — Iterating collections with enhanced for
