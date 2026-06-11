# Java File I/O and Streams

## Overview
File I/O (Input/Output) allows Java programs to read from and write to files and other data sources. This is part of the AP CSE syllabus and also relevant for placement coding rounds that involve reading input from files. Java's I/O system is built on streams — sequences of data. Understanding byte streams vs. character streams, buffered I/O, and the modern `try-with-resources` pattern is essential.

## Key Concepts

### Stream Types
**Byte Streams** (operate on raw bytes — for binary data like images):
- `InputStream` / `OutputStream` (abstract base)
- `FileInputStream` / `FileOutputStream` — reads/writes bytes to files

**Character Streams** (operate on characters — for text data with encoding):
- `Reader` / `Writer` (abstract base)
- `FileReader` / `FileWriter` — reads/writes characters to files
- `BufferedReader` / `BufferedWriter` — buffers character I/O for efficiency

### Reading a File (Most Common Pattern)
```java
// Modern: try-with-resources (Java 7+) — auto-closes resources
try (BufferedReader br = new BufferedReader(new FileReader("students.txt"))) {
    String line;
    while ((line = br.readLine()) != null) {
        System.out.println(line);
    }
} catch (FileNotFoundException e) {
    System.out.println("File not found: " + e.getMessage());
} catch (IOException e) {
    System.out.println("IO error: " + e.getMessage());
}
```

### Writing to a File
```java
try (BufferedWriter bw = new BufferedWriter(new FileWriter("output.txt"))) {
    bw.write("Name: Ravi Kumar");
    bw.newLine();                    // OS-agnostic newline
    bw.write("Roll: 101");
} catch (IOException e) {
    e.printStackTrace();
}
// FileWriter("file.txt", true) — append mode (second arg = true)
```

### `PrintWriter` — Formatted Output
```java
try (PrintWriter pw = new PrintWriter(new FileWriter("report.txt"))) {
    pw.printf("Name: %s, GPA: %.2f%n", "Asha", 9.1);
    pw.println("Department: CSE");
}
```

### `File` Class — File Metadata
```java
File f = new File("students.txt");
f.exists()           // true/false
f.length()           // size in bytes
f.getName()          // "students.txt"
f.getAbsolutePath()  // full path
f.isFile()           // true for files, false for directories
f.isDirectory()      // true for directories
f.delete()           // deletes the file
f.mkdir()            // creates directory
f.listFiles()        // returns File[] of contents (for directories)
```

### Reading All Lines at Once (Java 8+ NIO)
```java
import java.nio.file.*;
List<String> lines = Files.readAllLines(Paths.get("students.txt"));
// Or as stream:
Files.lines(Paths.get("students.txt"))
     .filter(line -> line.contains("CSE"))
     .forEach(System.out::println);
```

### Standard Input (Console)
```java
// Scanner — convenient for parsing input in placement coding rounds
import java.util.Scanner;
Scanner sc = new Scanner(System.in);
int n = sc.nextInt();
String name = sc.next();       // reads one token
String line = sc.nextLine();   // reads whole line
sc.close();
```

**Common trap:** After `nextInt()` or `nextDouble()`, call `sc.nextLine()` once to consume the trailing newline before calling `sc.nextLine()` for string input.

## Examples
```java
// Read numbers from file, compute average
try (Scanner sc = new Scanner(new File("numbers.txt"))) {
    int sum = 0, count = 0;
    while (sc.hasNextInt()) {
        sum += sc.nextInt();
        count++;
    }
    System.out.println("Average: " + (count > 0 ? (double) sum / count : 0));
} catch (FileNotFoundException e) {
    System.out.println("File not found");
}
```

## Common Exam Questions
- What is the difference between byte streams and character streams?
- What does `try-with-resources` do? Who closes the resource?
- What is `FileNotFoundException`? Is it checked or unchecked? (Checked — extends IOException)
- What is the difference between `FileWriter("f.txt")` and `FileWriter("f.txt", true)`?
- What is `BufferedReader` used for? Why is buffering important?

## Related Topics
- [[exception-handling]] — IOException handling in I/O
- [[java-classes-objects]] — File as a Java class
- [[java-strings]] — Reading strings from files
