# Java Basics: Data Types, Variables, and Operators

## Overview
Java is a statically-typed, strongly-typed, platform-independent language. Every variable must be declared with a type before use. Java has two categories of types: **primitive types** (stored directly on the stack) and **reference types** (objects stored on the heap, with a reference/pointer on the stack). This page covers the complete AP CSE Java basics syllabus topic and extends it with placement-critical nuances.

## Key Concepts

### Primitive Data Types (8 Types)
Java has exactly 8 primitive types:

| Type | Size | Range | Default |
|------|------|-------|---------|
| `byte` | 1 byte | -128 to 127 | 0 |
| `short` | 2 bytes | -32,768 to 32,767 | 0 |
| `int` | 4 bytes | -2³¹ to 2³¹-1 | 0 |
| `long` | 8 bytes | -2⁶³ to 2⁶³-1 | 0L |
| `float` | 4 bytes | ~±3.4×10³⁸ (7 digits) | 0.0f |
| `double` | 8 bytes | ~±1.7×10³⁰⁸ (15 digits) | 0.0 |
| `char` | 2 bytes | 0 to 65,535 (Unicode) | '\u0000' |
| `boolean` | JVM-dependent | true / false | false |

**Key placement trick:** `char` in Java is an unsigned 16-bit integer. `char c = 'A'; int i = c;` gives `i = 65`. Arithmetic on `char` works: `'A' + 1 = 66` (promotes to int).

### Type Casting
**Widening (implicit):** `byte → short → int → long → float → double`. No data loss. `int i = 100; double d = i;` works automatically.

**Narrowing (explicit):** Must be done manually. May lose data. `double d = 9.99; int i = (int) d;` gives `i = 9` (truncation, not rounding).

**Integer overflow:** `int max = Integer.MAX_VALUE; int overflow = max + 1;` gives `-2147483648` (wraps around). Common trap in placement MCQs.

### Operators
**Arithmetic:** `+`, `-`, `*`, `/`, `%`. Integer division truncates: `7/2 = 3`. Modulo for negatives: `-7 % 2 = -1` in Java (sign follows dividend).

**Relational:** `==`, `!=`, `<`, `>`, `<=`, `>=`. For objects, `==` compares references, NOT values — use `.equals()` for content comparison.

**Logical:** `&&` (short-circuit AND), `||` (short-circuit OR), `!`. Short-circuit means the right operand is NOT evaluated if the left already determines the result.

**Bitwise:** `&`, `|`, `^`, `~`, `<<` (left shift), `>>` (signed right shift), `>>>` (unsigned right shift). Placement: `n & 1` checks if n is odd. `n >> 1` divides by 2.

**Ternary:** `condition ? expr1 : expr2` — equivalent to if-else in one line.

**instanceof:** `obj instanceof ClassName` returns `true` if obj is an instance of ClassName or its subclass.

### Variable Scope and Lifetime
**Local variables:** Declared inside methods or blocks. No default value — must be initialized before use. Compiler error if used uninitialized.

**Instance variables:** Declared in a class but outside methods. Have default values. Exist as long as the object exists on the heap.

**Static (class) variables:** Shared across all objects. Only one copy. Initialized when the class is loaded.

**Block scope:** Variables declared inside `{}` blocks (if/while/for) are not accessible outside them.

## Examples
```java
// Widening vs narrowing
int x = 100;
long y = x;          // widening — automatic
double z = x;        // widening — automatic
int back = (int) z;  // narrowing — explicit cast needed

// Integer overflow trap
int max = Integer.MAX_VALUE;  // 2147483647
System.out.println(max + 1);  // prints -2147483648 (overflow)

// Short-circuit evaluation
int a = 0;
boolean result = (a != 0) && (10 / a > 1);  // safe, no ArithmeticException
```

## Common Exam Questions
- What is the output of `System.out.println(10 / 3);`? Answer: 3 (integer division)
- What is the output of `System.out.println('A' + 1);`? Answer: 66 (char promoted to int)
- Will `int x; System.out.println(x);` compile? Answer: No — local variable may not be initialized
- What is the default value of a `boolean` instance variable? Answer: `false`
- Explain the difference between `==` and `.equals()` for String comparison in Java.

## Related Topics
- [[control-flow-methods]] — Using variables in conditions and loops
- [[java-classes-objects]] — Instance vs static variables
- [[java-strings]] — String vs StringBuilder, string pool
