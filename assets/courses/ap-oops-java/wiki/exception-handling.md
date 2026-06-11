# Exception Handling in Java

## Overview
Exception handling is Java's mechanism for dealing with runtime errors gracefully. Rather than crashing, programs can detect problems, respond appropriately, and recover or communicate the error clearly. Exception handling is tested in AP CSE exams and is a common source of "what is the output?" questions in placement MCQ rounds — especially around `finally` block behavior and exception hierarchy.

## Key Concepts

### Exception Hierarchy
```
Throwable
├── Error (JVM-level, unrecoverable — don't catch these)
│   ├── StackOverflowError
│   ├── OutOfMemoryError
│   └── VirtualMachineError
└── Exception (recoverable)
    ├── Checked Exceptions (must be handled or declared)
    │   ├── IOException
    │   ├── FileNotFoundException
    │   ├── SQLException
    │   └── ClassNotFoundException
    └── RuntimeException (unchecked — optional to catch)
        ├── NullPointerException
        ├── ArrayIndexOutOfBoundsException
        ├── ClassCastException
        ├── NumberFormatException
        ├── ArithmeticException
        └── IllegalArgumentException
```

### try-catch-finally
```java
try {
    // Code that might throw
    int result = 10 / 0;  // throws ArithmeticException
} catch (ArithmeticException e) {
    System.out.println("Caught: " + e.getMessage());
} catch (Exception e) {
    // More general — catches anything Exception or subclass
    System.out.println("General: " + e.getMessage());
} finally {
    // ALWAYS executes — even if return is called in try/catch
    System.out.println("Finally block");
}
```

**Critical `finally` rule:** `finally` always executes unless `System.exit()` is called or the JVM crashes. Even a `return` in the `try` block does NOT prevent `finally` from running. If `finally` has a `return`, it overrides the `try` block's `return`.

### Checked vs Unchecked Exceptions
**Checked exceptions** are checked by the compiler. You must either:
1. `catch` them in a `try-catch`, OR
2. Declare them in the method signature with `throws`
```java
void readFile(String path) throws IOException {
    // ...
}
```

**Unchecked exceptions** (RuntimeExceptions) do not need to be declared. They represent programming bugs (null access, bad index, etc.).

### `throw` vs `throws`
- `throw` (statement): manually throws an exception object `throw new IllegalArgumentException("msg");`
- `throws` (method declaration): declares that a method MAY throw certain checked exceptions.

### Custom Exceptions
```java
class InsufficientFundsException extends Exception {
    private double amount;
    InsufficientFundsException(double amount) {
        super("Insufficient funds: need " + amount + " more");
        this.amount = amount;
    }
    public double getAmount() { return amount; }
}

// Usage
class BankAccount {
    private double balance = 100;
    void withdraw(double amount) throws InsufficientFundsException {
        if (amount > balance) throw new InsufficientFundsException(amount - balance);
        balance -= amount;
    }
}
```

### Try-with-Resources (Java 7+)
Automatically closes resources that implement `AutoCloseable`:
```java
try (FileReader fr = new FileReader("file.txt");
     BufferedReader br = new BufferedReader(fr)) {
    String line = br.readLine();
} catch (IOException e) {
    e.printStackTrace();
}
// fr and br are automatically closed even if exception occurs
```

### Multi-catch (Java 7+)
```java
catch (IOException | SQLException e) {
    System.out.println("DB or IO error: " + e.getMessage());
}
```

## Common Exam Questions (Placement Traps)
1. **What is the output?**
```java
try { return 1; } finally { return 2; }  // Output: 2 (finally overrides try's return)
```
2. `NullPointerException` — accessing a method or field on a null reference.
3. `ArrayIndexOutOfBoundsException` — accessing index < 0 or >= array.length.
4. Can `finally` block be skipped? Only with `System.exit()`.
5. What is the difference between `throw` and `throws`?

## Related Topics
- [[java-io-streams]] — Exceptions in file I/O
- [[java-classes-objects]] — Custom exception class design
- [[oops-placement-interview]] — Exception-based MCQs
