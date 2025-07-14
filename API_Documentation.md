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
- `clientType` (string, required for clients): residential or commercial
- `serviceStartDate` (string, required for clients): YYYY-MM-DD format
- `monthlyRate` (number, required for clients): Monthly service fee in KES

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

### 8. Payment Management Endpoints

#### POST /payments/process
Process payment via M-Pesa/Paybill.

**Request Body:**
```json
{
  "accountNumber": "RES123456",
  "amount": 2500,
  "paymentMethod": "paybill",
  "mpesaReceiptNumber": "QA12B3C4D5",
  "phoneNumber": "+254712345678",
  "transactionId": "TXN123456789"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment processed successfully",
  "data": {
    "payment": {
      "userId": "user_id",
      "accountNumber": "RES123456",
      "amount": 2500,
      "status": "completed"
    },
    "invoice": {
      "invoiceNumber": "INV-202401-1234",
      "totalAmount": 2500,
      "amountPaid": 2500,
      "status": "paid"
    },
    "overpayment": 0
  }
}
```

#### POST /payments/generate-invoices
Generate monthly invoices for all active clients (Admin/Organization only).

**Authorization:** Required (Admin or Organization role)

**Response:**
```json
{
  "success": true,
  "message": "Generated 25 invoices",
  "invoices": [
    {
      "invoiceNumber": "INV-202401-1234",
      "userId": "client_id",
      "accountNumber": "RES123456",
      "totalAmount": 2500,
      "dueDate": "2024-02-07"
    }
  ]
}
```

#### GET /payments/history/{accountNumber}
Get payment history for an account.

**Authorization:** Required (Admin, Organization, or Client role)

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)

**Response:**
```json
{
  "success": true,
  "data": {
    "payments": [
      {
        "amount": 2500,
        "paymentMethod": "paybill",
        "mpesaReceiptNumber": "QA12B3C4D5",
        "status": "completed",
        "paidAt": "2024-01-15T10:30:00Z",
        "invoiceId": {
          "invoiceNumber": "INV-202401-1234",
          "billingPeriod": {
            "start": "2024-01-01",
            "end": "2024-01-31"
          }
        }
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 3,
      "totalPayments": 25,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

#### GET /payments/statement/{accountNumber}
Get detailed account statement.

**Authorization:** Required (Admin, Organization, or Client role)

**Query Parameters:**
- `startDate` (optional): Start date (YYYY-MM-DD)
- `endDate` (optional): End date (YYYY-MM-DD)

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "name": "John Client",
      "accountNumber": "RES123456",
      "clientType": "residential"
    },
    "summary": {
      "totalInvoiced": 7500,
      "totalPaid": 5000,
      "totalOverpayment": 0,
      "outstandingBalance": 2500
    },
    "invoices": [
      {
        "invoiceNumber": "INV-202401-1234",
        "totalAmount": 2500,
        "amountPaid": 2500,
        "remainingBalance": 0,
        "status": "paid",
        "dueDate": "2024-02-07"
      }
    ],
    "payments": [
      {
        "amount": 2500,
        "paymentMethod": "paybill",
        "paidAt": "2024-01-15T10:30:00Z"
      }
    ],
    "overpayments": []
  }
}
```

## Enhanced Data Models

### Updated User Model
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
  "clientType": "residential|commercial (for clients only)",
  "accountNumber": "string (for clients only)",
  "serviceStartDate": "date (for clients only)",
  "monthlyRate": "number (for clients only)",
  "documents": ["array of file paths"],
  "createdAt": "date",
  "updatedAt": "date"
}
```

### Invoice Model
```json
{
  "id": "string",
  "invoiceNumber": "string",
  "userId": "string",
  "accountNumber": "string",
  "billingPeriod": {
    "start": "date",
    "end": "date"
  },
  "totalAmount": "number",
  "amountPaid": "number",
  "remainingBalance": "number",
  "status": "pending|partial|paid|overdue",
  "dueDate": "date",
  "issuedDate": "date",
  "emailSent": "boolean",
  "emailSentAt": "date"
}
```

### Payment Model
```json
{
  "id": "string",
  "userId": "string",
  "accountNumber": "string",
  "amount": "number",
  "currency": "string",
  "paymentMethod": "mpesa|paybill|card|bank_transfer|cash",
  "transactionId": "string",
  "mpesaReceiptNumber": "string",
  "phoneNumber": "string",
  "invoiceId": "string",
  "status": "pending|completed|failed|cancelled",
  "paidAt": "date",
  "createdAt": "date"
}
```

### Overpayment Model
```json
{
  "id": "string",
  "userId": "string",
  "accountNumber": "string",
  "paymentId": "string",
  "amount": "number",
  "currency": "string",
  "status": "available|applied|refunded",
  "appliedToInvoiceId": "string",
  "appliedAmount": "number",
  "remainingAmount": "number",
  "notes": "string"
}
```

## Payment Logic Explained

### How Payment Processing Works:

1. **Client Registration**: When registering a client, system generates unique account number (RES123456 for residential, COM123456 for commercial)

2. **Invoice Generation**: Monthly invoices are generated based on service start date and monthly rate

3. **Payment Processing**: 
   - Payment is applied to oldest unpaid invoice first
   - If payment exceeds invoice amount, excess is stored as overpayment
   - Overpayments are automatically applied to future invoices

4. **Account Numbers**: 
   - Residential clients: RES + 6-digit random number
   - Commercial clients: COM + 6-digit random number

5. **M-Pesa Integration**: System accepts paybill payments with account number as reference

## Cron Jobs

### Monthly Invoice Generation
Run monthly to generate invoices for all active clients:
```bash
POST /payments/generate-invoices
```

### Batch Mark Unpicked
Run daily to mark unpicked garbage:
```bash
POST /pickUps/batch-mark-unpicked
```

## Environment Variables
Set up the following environment variables in Postman:
- `base_url`: http://localhost:3000/api
- `auth_token`: Your JWT token (automatically set after login)