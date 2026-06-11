# Strings in Java

## Overview
`String` in Java is one of the most important and most misunderstood classes. It is immutable, interned in a special pool, and used in virtually every Java program. String-related questions appear in nearly every placement MCQ round — testing knowledge of `==` vs `.equals()`, string pool behavior, `StringBuilder` performance, and common string manipulation methods.

## Key Concepts

### String Immutability
Once a `String` object is created, its content cannot be changed. Every operation that appears to modify a string actually creates a new `String` object.

```java
String s = "Hello";
s.concat(" World");          // creates new String, s is unchanged!
System.out.println(s);       // prints "Hello"

s = s.concat(" World");      // reassign s to the new String
System.out.println(s);       // prints "Hello World"
```

**Why immutable?** Thread safety, security (strings used in passwords, network paths), and enabling the String Pool.

### String Pool (Interning)
Java maintains a pool of string literals in the heap (PermGen / Metaspace). Literal strings are automatically interned:

```java
String a = "hello";    // goes into pool
String b = "hello";    // reuses same pool object
String c = new String("hello");  // always creates NEW heap object outside pool

System.out.println(a == b);       // true  — same pool reference
System.out.println(a == c);       // false — different objects
System.out.println(a.equals(c));  // true  — same content

String d = c.intern();            // manually intern c → returns pool reference
System.out.println(a == d);       // true
```

**Key placement MCQ:** Always use `.equals()` to compare string content. `==` compares references.

### StringBuilder vs StringBuffer vs String
| Feature | String | StringBuilder | StringBuffer |
|---------|--------|---------------|--------------|
| Mutability | Immutable | Mutable | Mutable |
| Thread-safe | Yes (immutable) | No | Yes (synchronized) |
| Performance | Slow for many ops | Fast | Moderate |
| Use when | Few/no modifications | Single-thread | Multi-thread |

```java
// String concatenation in a loop — BAD (creates n new objects)
String result = "";
for (int i = 0; i < 1000; i++) result += i;  // O(n²) time

// StringBuilder — GOOD (O(n) time)
StringBuilder sb = new StringBuilder();
for (int i = 0; i < 1000; i++) sb.append(i);
String result = sb.toString();
```

### Common String Methods (AP Syllabus)
```java
String s = "Andhra Pradesh";
s.length()                    // 14
s.charAt(0)                   // 'A'
s.indexOf("Pradesh")          // 7
s.substring(7)                // "Pradesh"
s.substring(0, 6)             // "Andhra"
s.toUpperCase()               // "ANDHRA PRADESH"
s.toLowerCase()               // "andhra pradesh"
s.trim()                      // removes leading/trailing whitespace
s.replace("Pradesh", "AP")    // "Andhra AP"
s.split(" ")                  // ["Andhra", "Pradesh"]
s.contains("Pradesh")         // true
s.startsWith("Andhra")        // true
s.endsWith("h")               // true
String.valueOf(42)            // "42" (int to String)
Integer.parseInt("42")        // 42 (String to int)
```

### String Comparison Best Practices
```java
// Correct — case-sensitive content comparison
s1.equals(s2)

// Correct — case-insensitive content comparison
s1.equalsIgnoreCase(s2)

// Avoid — reference comparison (tricky with string pool)
s1 == s2

// Null-safe comparison
Objects.equals(s1, s2)         // returns false if either is null, no NPE
"literal".equals(variable)    // "Yoda condition" — no NPE even if variable is null
```

## Examples
```java
// Reverse a string using StringBuilder
String reversed = new StringBuilder("Hello").reverse().toString();  // "olleH"

// Count character frequency
Map<Character, Integer> freq = new HashMap<>();
for (char c : "andhra".toCharArray()) {
    freq.put(c, freq.getOrDefault(c, 0) + 1);
}

// Check palindrome
String s = "racecar";
String rev = new StringBuilder(s).reverse().toString();
boolean isPalindrome = s.equals(rev);  // true
```

## Common Exam Questions
- What is the output of `"hello" == new String("hello")`? `false`
- Is `String` a primitive or object? Object — but behaves like a value type due to immutability.
- What is the difference between `length` for arrays and `length()` for strings? `length` is a field (arrays), `length()` is a method (String).
- When should you use `StringBuilder` over `String`? When performing repeated concatenation.
- What is `StringIndexOutOfBoundsException`? Accessing index < 0 or >= length().

## Related Topics
- [[java-basics]] — String as a reference type vs primitives
- [[java-collections]] — Using String as Map key (interning and hashCode)
- [[oops-placement-interview]] — String MCQ patterns
