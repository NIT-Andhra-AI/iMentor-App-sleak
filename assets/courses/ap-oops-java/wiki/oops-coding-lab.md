# OOP Coding Lab: Hands-on Java Design Exercises

## Overview
This lab contains progressive coding exercises for solidifying OOP concepts. Each exercise is based on real-world scenarios from AP placement coding rounds. Attempt each problem before reading the solution hints.

## Lab Exercises

### Lab 1: Bank Account System (Encapsulation + Inheritance)
**Task:** Design a bank account system with:
- `BankAccount` base class: `accountNumber`, `balance`, `owner`; methods `deposit()`, `withdraw()`, `getBalance()`
- `SavingsAccount` extends `BankAccount`: add `interestRate`; add `addInterest()` method
- `CurrentAccount` extends `BankAccount`: add `overdraftLimit`; override `withdraw()` to allow overdraft

**Test:**
```java
SavingsAccount sa = new SavingsAccount("SBI001", "Ravi", 10000, 0.05);
sa.deposit(5000);
sa.addInterest();
System.out.println(sa.getBalance());  // 15000 + 5% interest = 15750.0

CurrentAccount ca = new CurrentAccount("HDFC001", "Asha", 5000, 10000);
ca.withdraw(14000);                    // allowed up to 5000 + 10000 overdraft
System.out.println(ca.getBalance());   // -9000.0
```

**Solution Hint:**
```java
abstract class BankAccount {
    protected String accountNumber, owner;
    protected double balance;
    BankAccount(String an, String o, double b) { accountNumber=an; owner=o; balance=b; }
    void deposit(double amt) { if(amt>0) balance+=amt; }
    void withdraw(double amt) { if(amt>0&&amt<=balance) balance-=amt; }
    double getBalance() { return balance; }
}

class SavingsAccount extends BankAccount {
    double interestRate;
    SavingsAccount(String an, String o, double b, double r) { super(an,o,b); interestRate=r; }
    void addInterest() { balance += balance * interestRate; }
}
```

### Lab 2: Shape Calculator (Abstract Class + Polymorphism)
**Task:** Create an abstract `Shape` class with abstract methods `area()` and `perimeter()`. Implement `Circle`, `Rectangle`, and `Triangle`. Write a method that accepts a `List<Shape>` and prints total area.

**Expected Output:**
```
Circle: area=78.54, perimeter=31.42
Rectangle: area=24.00, perimeter=20.00
Triangle: area=6.00, perimeter=12.00
Total area: 108.54
```

### Lab 3: Student Sorter (Comparable + Collections)
**Task:**
1. Create a `Student` class with `name`, `rollNo`, `gpa`
2. Make it `Comparable` by GPA (descending)
3. Add 5 students to a list, sort it, print top 3

### Lab 4: Library System (Interface + HashMap)
**Task:**
1. Define `Searchable` interface with `search(String query): List<Book>`
2. Implement `Library` class that maintains `Map<String, Book>` (ISBN → Book)
3. Implement `searchByTitle()` and `searchByAuthor()`
4. Add, remove, issue, and return books

### Lab 5: Design Pattern — Observer
**Task:** Implement a simple event notification system:
- `Subject` interface: `addObserver()`, `removeObserver()`, `notifyObservers()`
- `Observer` interface: `update(String event)`
- `ResultBoard` as Subject, `Student` and `Parent` as Observers

**When a result is published, all registered observers are notified.**

## Assessment Rubric
- ✅ Correct output
- ✅ Proper use of OOP (encapsulation, inheritance, polymorphism)
- ✅ No public fields (use getters/setters)
- ✅ Appropriate exception handling
- ✅ Clean, readable code

## Related Topics
- [[java-classes-objects]] — Class design fundamentals
- [[inheritance-polymorphism]] — extends and method dispatch
- [[java-collections]] — Collections used in labs
- [[oops-placement-interview]] — Interview context for lab concepts
