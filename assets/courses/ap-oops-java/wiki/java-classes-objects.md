# Classes and Objects in Java

## Overview
A **class** is a template or blueprint defining state (fields/attributes) and behavior (methods). An **object** is a runtime instance of a class created with `new`. Understanding Java's object model — memory allocation, constructor chaining, `this` keyword, and `static` vs instance members — is essential for both the AP CSE exam and for placement interviews at TCS, Infosys, Wipro, and product companies.

## Key Concepts

### Class Definition
```java
public class Student {
    // Fields (instance variables)
    private String name;
    private int rollNo;
    private double gpa;

    // Static variable (shared across all instances)
    private static int count = 0;

    // Constructor
    public Student(String name, int rollNo, double gpa) {
        this.name = name;         // 'this' disambiguates field from parameter
        this.rollNo = rollNo;
        this.gpa = gpa;
        count++;                  // count every object created
    }

    // Default constructor (provided by compiler ONLY if no constructor defined)
    // Once you define ANY constructor, the compiler no longer provides the default

    // Instance method
    public void display() {
        System.out.println(rollNo + ": " + name + " GPA=" + gpa);
    }

    // Static method (cannot access instance fields without an object reference)
    public static int getCount() {
        return count;
    }

    // Getter/Setter (encapsulation)
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
}
```

### Constructors
- A constructor has the **same name as the class** and **no return type** (not even `void`).
- **Default constructor:** Compiler provides only if NO constructor is explicitly defined. Initializes fields to defaults.
- **Parameterized constructor:** Takes arguments to initialize fields.
- **Constructor overloading:** Multiple constructors with different parameters. Call another constructor using `this(args)` — must be the first statement.
- **Copy constructor:** Takes a same-type object as parameter. Java does not provide one automatically.

```java
public class Point {
    int x, y;
    Point() { this(0, 0); }                    // delegates to parameterized
    Point(int x, int y) { this.x = x; this.y = y; }
    Point(Point p) { this(p.x, p.y); }         // copy constructor
}
```

### The `this` Keyword
- `this` refers to the **current object instance**.
- Used to disambiguate fields from parameters with the same name.
- `this()` calls another constructor in the same class (constructor chaining).
- `this` cannot be used in static methods (no object context).

### `static` vs Instance Members
| Feature | Static | Instance |
|---------|--------|----------|
| Belongs to | Class | Object |
| Memory | One copy | Per object |
| Accessed via | ClassName.member | object.member |
| Can access instance members? | No (without object ref) | Yes |
| Initialized | When class loads | When object is created |

### Object Creation and JVM Memory
```java
Student s = new Student("Ravi", 101, 8.5);
```
1. `new Student(...)` allocates memory on the **heap** for the object.
2. The constructor runs to initialize fields.
3. A **reference** `s` is stored on the **stack** pointing to the heap object.
4. Multiple references can point to the same object — modifying through one affects all.

### Garbage Collection
Java automatically reclaims memory for objects with no live references. You cannot force GC (calling `System.gc()` is just a hint). The `finalize()` method is deprecated in Java 9+.

### `final` Keyword
- `final` variable: constant — cannot be reassigned after initialization.
- `final` method: cannot be overridden in subclass.
- `final` class: cannot be extended (e.g., `String`, `Integer`).

## Examples
```java
// Creating and using objects
Student s1 = new Student("Asha", 201, 9.1);
Student s2 = new Student("Ravi", 202, 8.4);
s1.display();
System.out.println("Total students: " + Student.getCount());  // static call

// Reference assignment — both point to same object
Student ref1 = new Student("Copy", 999, 7.5);
Student ref2 = ref1;
ref2.setName("Modified");
System.out.println(ref1.getName());  // prints "Modified"
```

## Common Exam Questions
- What is the difference between a class and an object?
- When does the compiler not provide a default constructor?
- What is the output when a `final` field is re-assigned? (Compile error)
- What is `NullPointerException` and when does it occur?
- Explain why `static` methods cannot call instance methods directly.

## Related Topics
- [[inheritance-polymorphism]] — extends, super, and method dispatch
- [[encapsulation-access]] — access modifiers and data hiding
- [[java-strings]] — String is a special immutable class
