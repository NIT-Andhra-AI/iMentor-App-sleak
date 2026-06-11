# Interfaces and Abstract Classes

## Overview
Abstraction in Java is achieved through **abstract classes** and **interfaces**. Both prevent direct instantiation and force subclasses to provide implementations for abstract methods. Choosing between them is one of the most common design questions in placement interviews. This page covers the complete AP CSE abstraction topic and the Java 8+ interface enhancements used in modern frameworks.

## Key Concepts

### Abstract Classes
- Declared with the `abstract` keyword.
- Can have **both abstract and concrete methods**.
- Can have **instance variables** and **constructors** (called via `super()` from subclass).
- A class that extends an abstract class must implement ALL abstract methods, or itself be abstract.

```java
abstract class Shape {
    String color;

    Shape(String color) { this.color = color; }   // constructor

    abstract double area();                         // abstract — no body
    abstract double perimeter();

    void display() {                                // concrete method
        System.out.printf("%s — Area: %.2f%n", color, area());
    }
}

class Circle extends Shape {
    double radius;
    Circle(String color, double radius) { super(color); this.radius = radius; }

    @Override double area()      { return Math.PI * radius * radius; }
    @Override double perimeter() { return 2 * Math.PI * radius; }
}
```

### Interfaces
- An interface is a **pure contract** — defines what a class must do, not how.
- All methods are implicitly `public abstract` (before Java 8).
- All fields are implicitly `public static final` (constants).
- A class implements an interface with `implements` keyword.
- **Multiple implementation:** A single class can implement multiple interfaces (solves the multiple inheritance issue).

```java
interface Drawable { void draw(); }
interface Resizable { void resize(double factor); }

class Rectangle extends Shape implements Drawable, Resizable {
    double width, height;

    Rectangle(String color, double w, double h) { super(color); width=w; height=h; }

    @Override double area()      { return width * height; }
    @Override double perimeter() { return 2*(width+height); }
    @Override public void draw() { System.out.println("Drawing rectangle"); }
    @Override public void resize(double f) { width*=f; height*=f; }
}
```

### Java 8+ Interface Enhancements
**Default methods:** Concrete methods in interfaces with `default` keyword. Allow adding new methods to interfaces without breaking existing implementations.
```java
interface Printable {
    void print();
    default void printUpperCase() { print(); /* can delegate */ }
}
```

**Static methods:** Interface can have static utility methods.
```java
interface MathOps {
    static int square(int n) { return n * n; }
}
```

**Functional interfaces:** Interfaces with exactly one abstract method. Can be implemented with **lambda expressions**.
```java
@FunctionalInterface
interface Greeting { void greet(String name); }
Greeting g = name -> System.out.println("Hello, " + name);
g.greet("Ravi");  // Hello, Ravi
```

### Abstract Class vs Interface — When to Use Which

| Feature | Abstract Class | Interface |
|---------|---------------|-----------|
| Instantiation | Cannot be instantiated | Cannot be instantiated |
| Methods | Abstract + concrete | Abstract + default + static |
| Fields | Instance + static | Only `public static final` |
| Constructor | Yes | No |
| Inheritance | Single (`extends`) | Multiple (`implements`) |
| Access modifiers | Any | `public` only |
| Use when | Shared state + partial implementation | Pure contract, multiple types |

**Rule of thumb:** Use abstract class when classes share common state and behavior. Use interface when unrelated classes should share a capability (e.g., `Serializable`, `Comparable`, `Runnable`).

## Examples
```java
// Polymorphism via interface
List<Shape> shapes = new ArrayList<>();
shapes.add(new Circle("Red", 5));
shapes.add(new Rectangle("Blue", 4, 6));

for (Shape s : shapes) {
    s.display();   // calls overridden area() for each actual type
}

// Functional interface with lambda
Comparator<Student> byGpa = (s1, s2) -> Double.compare(s2.gpa, s1.gpa);
students.sort(byGpa);
```

## Common Exam Questions
- Can an abstract class have a constructor? Yes — called via `super()` from subclass.
- Can an interface have a constructor? No.
- What happens if a class implements two interfaces with the same default method? Must override it.
- Can an interface extend another interface? Yes, using `extends`.
- Can an abstract class implement an interface? Yes, and it doesn't have to implement interface methods.

## Related Topics
- [[inheritance-polymorphism]] — extends and runtime dispatch
- [[java-collections]] — Collection interfaces (List, Set, Map, Comparable, Comparator)
- [[encapsulation-access]] — Access modifiers interaction with abstract/interface
