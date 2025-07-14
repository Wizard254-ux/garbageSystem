# Garbage System API Documentation

## Overview
This API provides comprehensive functionality for managing a garbage collection system with role-based access control. The system supports four user roles: Admin, Organization, Driver, and Client.

## Base URL
```
http://localhost:3000/api
```

## Authentication
The API uses JWT (JSON Web Token) for authentication. Include the token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

## User Roles & Permissions

### Admin
- Create and manage organizations
- View system-wide statistics
- Full access to all endpoints

### Organization
- Create and manage drivers and clients
- Manage routes
- View pickup reports and statistics
- Cannot create other organizations

### Driver
- Mark pickups as completed
- View assigned routes and clients
- Cannot create users or manage routes

### Client
- View their own profile
- Receive pickup notifications
- Limited access to system

## API Endpoints

### 1. Authentication Endpoints

#### POST /auth/login
Login to the system.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "message": "Login successful.",
  "user": {
    "id": "user_id",
    "name": "User Name",
    "email": "user@example.com",
    "role": "admin",
    "documents": []
  },
  "token": "jwt_token_here"
}
```

#### POST /auth/logout
Logout from the system.

**Response:**
```json
{
  "message": "Logged out successfully."
}
```

#### GET /auth/profile
Get current user profile (requires authentication).

**Response:**
```json
{
  "user": {
    "id": "user_id",
    "name": "User Name",
    "email": "user@example.com",
    "role": "admin",
    "documents": [],
    "organizationId": "org_id"
  }
}
```

### 2. User Registration Endpoints

#### POST /auth/register
General registration endpoint (for initial admin setup).

**Content-Type:** `multipart/form-data`

**Form Fields:**
- `name` (string, required)
- `email` (string, required)
- `password` (string, required)
- `role` (string, required): admin, organization, driver, client
- `phone` (string, required)
- `documents` (file, optional): Up to 5 files

**Additional fields for clients:**
- `route` (string, required for clients)
- `pickUpDay` (string, required for clients): monday, tuesday, etc.
- `address` (string, required for clients)

#### POST /auth/register/organization
Register a new organization (Admin only).

**Content-Type:** `multipart/form-data`
**Authorization:** Required (Admin role)

#### POST /auth/register/driver
Register a new driver (Organization only).

**Content-Type:** `multipart/form-data`
**Authorization:** Required (Organization role)

#### POST /auth/register/client
Register a new client (Organization only).

**Content-Type:** `multipart/form-data`
**Authorization:** Required (Organization role)

### 3. Organization Management Endpoints

#### POST /auth/organization/manage
Manage organizations (Admin only).

**Authorization:** Required (Admin role)

**Actions:**

##### List Organizations
```json
{
  "action": "list",
  "page": 1,
  "limit": 10,
  "search": "",
  "isActive": true,
  "sortBy": "createdAt",
  "sortOrder": "desc"
}
```

##### Get Organization Details
```json
{
  "action": "get",
  "organizationId": "org_id_here"
}
```

##### Edit Organization
```json
{
  "action": "edit",
  "organizationId": "org_id_here",
  "updateData": {
    "name": "Updated Name",
    "email": "updated@example.com",
    "phone": "+1234567890",
    "isActive": true
  }
}
```

##### Delete Organization
```json
{
  "action": "delete",
  "organizationId": "org_id_here"
}
```

##### Organization Statistics
```json
{
  "action": "stats",
  "organizationId": "org_id_here"
}
```

### 4. User Management Endpoints (Organization)

#### POST /auth/organization/users/manage
Manage drivers and clients (Organization only).

**Authorization:** Required (Organization role)

**Actions:**

##### List Users
```json
{
  "action": "list",
  "userType": "driver" // or "client"
}
```

##### Edit User
```json
{
  "action": "edit",
  "userType": "driver", // or "client"
  "userId": "user_id_here",
  "updateData": {
    "name": "Updated Name",
    "email": "updated@example.com",
    "phone": "+1234567890",
    "isActive": true,
    // Additional fields for clients:
    "route": "route_id",
    "pickUpDay": "monday",
    "address": "123 Main St"
  }
}
```

##### Delete User
```json
{
  "action": "delete",
  "userType": "driver", // or "client"
  "userId": "user_id_here"
}
```

### 5. Password Management Endpoints

#### POST /auth/send-verification-code
Send verification code to user's email.

**Authorization:** Required

#### POST /auth/verify-code
Verify the received code.

**Authorization:** Required

**Request Body:**
```json
{
  "verificationCode": "123456"
}
```

#### POST /auth/change-password
Change user password with verification.

**Authorization:** Required

**Request Body:**
```json
{
  "verificationCode": "123456",
  "currentPassword": "oldpassword123",
  "newPassword": "newpassword123"
}
```

### 6. Route Management Endpoints

#### POST /routes
Manage routes (Organization only).

**Authorization:** Required (Organization role)

**Actions:**

##### Create Route
```json
{
  "action": "create",
  "name": "Route A",
  "path": "Downtown Area",
  "description": "Main downtown collection route",
  "isActive": true
}
```

##### Get All Routes
```json
{
  "action": "read"
}
```

##### Get Route by ID
```json
{
  "action": "get",
  "id": "route_id_here"
}
```

##### Update Route
```json
{
  "action": "update",
  "id": "route_id_here",
  "name": "Updated Route A",
  "path": "Updated Downtown Area",
  "description": "Updated description"
}
```

##### Delete Route
```json
{
  "action": "delete",
  "id": "route_id_here"
}
```

##### Activate/Deactivate Route
```json
{
  "action": "activate", // or "deactivate"
  "id": "route_id_here"
}
```

##### Search Routes
```json
{
  "action": "search",
  "query": "downtown"
}
```

### 7. Pickup Management Endpoints

#### POST /pickUps/mark-picked
Mark a pickup as completed.

**Authorization:** Required (Organization or Driver role)

**Request Body:**
```json
{
  "user_id": "client_id_here",
  "date": "2024-01-15",
  "notes": "Garbage collected successfully"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Pickup marked as completed and notification sent",
  "data": {
    "user_id": "client_id_here",
    "date": "2024-01-15",
    "status": "picked",
    "user_email": "client@example.com",
    "week": {
      "start": "2024-01-15",
      "end": "2024-01-21"
    }
  }
}
```

#### GET /pickUps/{routeId}/{pickStatus}
Get users by pickup status for a specific route.

**Authorization:** Required (Organization or Driver role)

**Path Parameters:**
- `routeId`: The route ID
- `pickStatus`: picked, unpicked, not_yet_marked, or all

**Query Parameters:**
- `date` (optional): Specific date in DD-MM-YYYY format (e.g., 15-01-2024)
- `startDate` & `endDate` (optional): Date range in DD-MM-YYYY format
- `day` (optional): Filter by pickup day (monday, tuesday, etc.)

**Examples:**
```
GET /pickUps/route123/picked
GET /pickUps/route123/unpicked?date=15-01-2024
GET /pickUps/route123/all?day=monday
GET /pickUps/route123/picked?startDate=15-01-2024&endDate=20-01-2024
```

**Response:**
```json
{
  "success": true,
  "users": [
    {
      "_id": "user_id",
      "name": "Client Name",
      "address": "123 Main St",
      "pickUpDay": "monday",
      "phone": "+1234567890",
      "email": "client@example.com"
    }
  ],
  "filters": {
    "routeId": "route123",
    "pickStatus": "picked",
    "date": "15-01-2024"
  }
}
```

#### POST /pickUps/batch-mark-unpicked
Batch job to mark unpicked garbage (typically run as a cron job).

**Response:**
```json
{
  "success": true,
  "message": "Batch job completed successfully"
}
```

## Error Responses

### Common Error Codes
- `400` - Bad Request (validation errors, missing fields)
- `401` - Unauthorized (invalid credentials, missing token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (resource doesn't exist)
- `409` - Conflict (duplicate email/phone)
- `500` - Internal Server Error

### Error Response Format
```json
{
  "success": false,
  "error": "Error message here",
  "details": "Additional error details (optional)"
}
```

## Data Models

### User Model
```json
{
  "id": "string",
  "name": "string",
  "email": "string",
  "phone": "string",
  "role": "admin|organization|driver|client",
  "isActive": "boolean",
  "organizationId": "string (for drivers and clients)",
  "route": "string (for clients only)",
  "pickUpDay": "string (for clients only)",
  "address": "string (for clients only)",
  "documents": ["array of file paths"],
  "createdAt": "date",
  "updatedAt": "date"
}
```

### Route Model
```json
{
  "id": "string",
  "name": "string",
  "path": "string",
  "description": "string",
  "isActive": "boolean",
  "createdAt": "date",
  "updatedAt": "date"
}
```

### Pickup Record Model
```json
{
  "user_id": "string",
  "pickup_dates": {
    "2024-01-15": {
      "status": "picked|unpicked",
      "timestamp": "date",
      "notes": "string"
    }
  }
}
```

## Usage Examples

### 1. Complete User Registration Flow
```bash
# 1. Register admin (initial setup)
POST /auth/register
{
  "name": "System Admin",
  "email": "admin@system.com",
  "password": "admin123",
  "role": "admin",
  "phone": "+1234567890"
}

# 2. Admin creates organization
POST /auth/register/organization
{
  "name": "Green Waste Co",
  "email": "org@greenwaste.com",
  "password": "org123",
  "role": "organization",
  "phone": "+1234567891"
}

# 3. Organization creates driver
POST /auth/register/driver
{
  "name": "John Driver",
  "email": "john@greenwaste.com",
  "password": "driver123",
  "role": "driver",
  "phone": "+1234567892"
}

# 4. Organization creates client
POST /auth/register/client
{
  "name": "Jane Client",
  "email": "jane@example.com",
  "password": "client123",
  "role": "client",
  "phone": "+1234567893",
  "route": "route_id_here",
  "pickUpDay": "monday",
  "address": "123 Main St, City"
}
```

### 2. Daily Pickup Operations
```bash
# 1. Get all clients for Monday pickup on Route A
GET /pickUps/route_a_id/all?day=monday

# 2. Mark pickup as completed
POST /pickUps/mark-picked
{
  "user_id": "client_id",
  "date": "2024-01-15",
  "notes": "Collected successfully"
}

# 3. Check unpicked clients
GET /pickUps/route_a_id/unpicked?date=15-01-2024
```

### 3. Route Management
```bash
# 1. Create new route
POST /routes
{
  "action": "create",
  "name": "Route B",
  "path": "Suburban Area",
  "description": "Suburban collection route"
}

# 2. Search routes
POST /routes
{
  "action": "search",
  "query": "suburban"
}

# 3. Update route
POST /routes
{
  "action": "update",
  "id": "route_id",
  "name": "Updated Route B"
}
```

## Security Considerations

1. **Authentication**: All protected endpoints require valid JWT tokens
2. **Role-based Access**: Each endpoint checks user roles before allowing access
3. **File Upload**: Document uploads are limited to 5 files per request
4. **Password Security**: Passwords are hashed using bcrypt
5. **Email Verification**: Password changes require email verification codes
6. **Input Validation**: All inputs are validated before processing

## Rate Limiting
Consider implementing rate limiting for production use, especially for:
- Login attempts
- Password reset requests
- File uploads
- Batch operations

## Postman Collection
Import the provided `Garbage_System_API.postman_collection.json` file into Postman to test all endpoints with pre-configured requests.

## Environment Variables
Set up the following environment variables in Postman:
- `base_url`: http://localhost:3000/api
- `auth_token`: Your JWT token (automatically set after login)