# 🔐 Keycloak Auth Proof of Concept (NestJS + Prisma)

A backend proof-of-concept demonstrating how to integrate **Keycloak authentication** with a **NestJS** backend and **Prisma** database.

This project covers:

- Registering users in Keycloak via Admin API  
- Secure login using the **Password Grant Flow**  
- Cookie-based session management in NestJS  
- Syncing user profiles with your business database  

---

## 🧩 Tech Stack

| Layer | Description |
|--------|-------------|
| **Auth Provider** | [Keycloak](https://www.keycloak.org/) – OAuth2 / OpenID Connect |
| **Backend** | [NestJS](https://nestjs.com/) |
| **ORM** | [Prisma](https://www.prisma.io/) |
| **Database** | SQLite (default) — easily switchable to PostgreSQL/MySQL |
| **Package Manager** | pnpm |
| **Runtime** | Node.js (v18+) |

---

## 🚀 Getting Started

### 1. Clone and Install

```bash
git clone https://github.com/your-org/keycloak-auth-poc.git
cd keycloak-auth-poc
pnpm install
```

---

### 2. Environment Setup

Copy `.env.example` → `.env`, then fill in:

```env
# Server
PORT=3000

# Database
DATABASE_URL="file:./dev.db"

# Cookie / Session
SESSION_COOKIE_NAME=app_sess
SESSION_COOKIE_SECRET=dev-secret-change-me

# Keycloak
KC_BASE_URL=http://localhost:8080
KC_REALM=myrealm

# Client for password grant
KC_CLIENT_ID=my-confidential-bff
KC_CLIENT_SECRET=CHANGE_ME

# Admin client (service account)
KC_ADMIN_CLIENT_ID=admin-cli
KC_ADMIN_CLIENT_SECRET=CHANGE_ME
```

> 💡 The admin client’s **service account** must have realm-management roles:  
> `manage-users`, `view-users`, and optionally `impersonation`.

---

### 3. Database Setup

Run the initial migration and seed demo data:

```bash
pnpm prisma migrate dev -n init
pnpm prisma db seed
```

Inspect data via Prisma Studio:

```bash
pnpm prisma studio
```

---

### 4. Run the Server

```bash
pnpm start:dev
```

Expected output:

```
🚀 Server running on http://localhost:3000
```

---

## 🔑 Keycloak Setup

1. Start Keycloak locally (example using Docker):

   ```bash
   docker run -d \
     -p 8080:8080 \
     -e KEYCLOAK_ADMIN=admin \
     -e KEYCLOAK_ADMIN_PASSWORD=admin \
     quay.io/keycloak/keycloak:26.0 start-dev
   ```

2. Create a new **realm** (e.g. `myrealm`).

3. Create clients:

   - **Client 1:** `my-confidential-bff`  
     - Access Type: Confidential  
     - Enable “Direct Access Grants” ✅  
     - Copy the *Client Secret*
   - **Client 2:** `admin-cli` (service account enabled)  
     - Add realm role: `manage-users`

4. Fill `.env` with the correct values.

---
