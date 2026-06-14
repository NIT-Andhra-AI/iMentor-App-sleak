# iMentor Native App API Documentation

This directory (`native-app/api`) contains the backend services and routes for the iMentor Native Application, built following the MVC (Model-View-Controller) architecture using Node.js, Express, and MongoDB.

## Available Routes

### 1. Authentication: Signup
**Endpoint:** `POST /api/signup`

Registers a new user in the system, securely hashes their password using `bcryptjs`, stores their details in the local MongoDB database, and returns a JSON Web Token (JWT) for authentication.

#### Request Body
The request expects a JSON payload with the following fields:
- `name` *(String, Required)*: The full name of the user.
- `email` *(String, Required)*: A valid email address. Must be unique across the database.
- `password` *(String, Required)*: The user's desired password. Must be at least 6 characters long.

#### Success Response
- **Status Code:** `201 Created`
- **Payload:**
  ```json
  {
    "message": "User created successfully",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "64abcdef1234567890abcdef",
      "name": "John Doe",
      "email": "john.doe@example.com"
    }
  }
  ```

#### Error Responses
- **`400 Bad Request`**: 
  - If required fields are missing.
  - If the password is shorter than 6 characters.
  - If a user with the provided email already exists.
- **`500 Internal Server Error`**: 
  - In case of unexpected server or database connection failures.

---

### 2. Authentication: Login
**Endpoint:** `POST /api/login`

Authenticates an existing user by verifying their email and password against the securely hashed data in MongoDB, and returns a JSON Web Token (JWT) for subsequent authenticated requests.

#### Request Body
The request expects a JSON payload with the following fields:
- `email` *(String, Required)*: The user's registered email address.
- `password` *(String, Required)*: The user's password.

#### Success Response
- **Status Code:** `200 OK`
- **Payload:**
  ```json
  {
    "message": "Login successful",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "64abcdef1234567890abcdef",
      "name": "John Doe",
      "email": "john.doe@example.com"
    }
  }
  ```

#### Error Responses
- **`400 Bad Request`**: Missing email or password.
- **`401 Unauthorized`**: Incorrect email or password.
- **`500 Internal Server Error`**: Unexpected server or database connection failures.

---
*Note: Additional routes (e.g., profile management) will be documented here as they are developed.*