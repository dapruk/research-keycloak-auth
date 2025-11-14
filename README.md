# 🔐 Keycloak Auth Proof of Concept (NestJS + Prisma + Keycloak Authorization)

This project is a **complete authentication + authorization POC** showing how to integrate:

- Keycloak (Auth + Authorization Services)
- NestJS (API)
- Prisma (ORM)
- Cookie-based authentication
- Scope-based permissions (internal vs external)
- User registration + login flows
- Realm import/export for easy setup

The repository includes a working example of **invoice APIs** with two access levels:

- Internal invoice view → requires internal admin policies  
- External invoice view → requires client admin policies  

---

## 🧩 Tech Stack

| Layer | Description |
|-------|-------------|
| Auth Provider | Keycloak 26.x |
| Backend | NestJS |
| ORM | Prisma |
| Database | SQLite (default) |
| Package Manager | pnpm |
| Runtime | Node.js v18+ |
| Infra | Docker Compose |

---

## 📁 Project Structure

```
keycloak-auth/
├─ docker-compose.dev.yml
├─ Dockerfile.dev
├─ prisma/
│  └─ schema.prisma
├─ keycloak/
│  └─ realm-export.json        # Imported automatically on first startup
├─ src/
│  ├─ auth/
│  ├─ invoice/
│  ├─ prisma.service.ts
│  ├─ app.module.ts
│  └─ main.ts
└─ .env.example
```

---

# 🚀 Getting Started

## 1. Requirements

- Docker & Docker Compose
- pnpm (only required if running API manually without Docker)
- Node.js v18+

---

## 2. Environment Setup

Create a `.env` file:

```
cp .env.example .env
```

Edit `.env` and set your values:

```
PORT=3000

DATABASE_URL="file:./dev.db"

SESSION_COOKIE_NAME=app_sess
SESSION_COOKIE_SECRET=dev-secret-change-me

KC_BASE_URL=http://keycloak-dev:8080
KC_REALM=ghm-app

KC_CLIENT_ID=ghm-app
KC_CLIENT_SECRET=CHANGE_ME

KC_ADMIN_CLIENT_ID=ghm-app-admin
KC_ADMIN_CLIENT_SECRET=CHANGE_ME

KC_BOOTSTRAP_ADMIN_USERNAME=admin
KC_BOOTSTRAP_ADMIN_PASSWORD=admin
```

### Important Notes

- Everything related to Keycloak (realm, clients, roles, groups, scopes, permissions, policies) is stored inside:
  ```
  keycloak/realm-export.json
  ```
- This file is **auto-imported** into Keycloak on the first run.

---

## 3. Start the Stack

Run both Keycloak + API:

```
docker compose -f docker-compose.dev.yml up -d --build
```

This will run:

- Keycloak → http://localhost:8080  
- NestJS API → http://localhost:3000  
- Auto-import the realm from `keycloak/realm-export.json`

Check logs:

```
docker logs -f keycloak-dev
```

If you see **"Script upload is disabled"**, it means the realm was imported successfully and Keycloak restarted.

---

## 4. Initialize Database

Run migrations and seeds inside the API container:

```
docker exec -it nest-api-dev pnpm prisma migrate dev -n init
docker exec -it nest-api-dev pnpm prisma db seed
```

The seed includes:

- A demo company  
  `d23f7b33-f02f-4b7d-9f9c-8218d717f987`
- Test invoices
- No default users (they are created via API registration)

---

# 👤 Authentication Flow

This project uses **session cookies** + curl.

## 5. Register an Internal Admin User

```
curl -i -c admin.cookies.txt \
  -H "Content-Type: application/json" \
  -d '{
    "email":"admin1@example.com",
    "password":"P@ssw0rd!",
    "username":"admin1",
    "firstName":"Admin",
    "lastName":"One",
    "actorType":"internal",
    "internalRole":"ADMIN",
    "name":"Admin One",
    "phone":"628111111111"
  }' \
  http://localhost:3000/auth/register
```

This registers a Keycloak user and assigns the correct **internal admin** role + group.

---

## 6. Access the Internal Invoice View

```
curl -i -b admin.cookies.txt \
  "http://localhost:3000/invoice/internal/view-table"
```

If policies are correct, this returns invoice data.

If Keycloak denies access, you'll see:

```
KeycloakAuthorizationError: Unauthorized
```

---

## 7. Register a Client Admin User

```
curl -i -c client.cookies.txt \
  -H "Content-Type: application/json" \
  -d '{
    "email":"client99@example.com",
    "password":"P@ssw0rd!",
    "username":"client99",
    "firstName":"Client",
    "lastName":"NinetyNine",
    "actorType":"external",
    "companyId":"d23f7b33-f02f-4b7d-9f9c-8218d717f987",
    "name":"Client Admin 99",
    "phone":"628111111199",
    "externalRole":"ADMIN"
  }' \
  http://localhost:3000/auth/register
```

---

## 8. Access the External Invoice View

```
curl -i -b client.cookies.txt \
  "http://localhost:3000/invoice/external/view-table"
```

Only users with:

- The correct group  
- External admin role  
- `view-external` scope permission  

…can pass.

---

# 🧩 Keycloak Authorization Model (Summary)

The realm export contains:

### Resources
- `invoice-api`

### Scopes
- `view` (internal)
- `view-external` (external)

### Policies
- `admin-role-policy`
- `internal-view-policy`
- `external-view-policy`
- `internal-admin-view-policy`
- `admin-external-view-policy`

### Permissions
- `internal-view-permission`
- `external-view-permission`

Each endpoint in NestJS checks:

```
@Permissions({
  resource: 'invoice-api',
  scope: 'view' | 'view-external',
})
```

---

# 🔄 How Realm Import Works

- On **first startup**, Keycloak imports:
  ```
  /opt/keycloak/data/import/realm-export.json
  ```
- After import, it disables further script uploads.
- To reset Keycloak and re-import:
  ```
  docker compose down -v
  ```
  (removes volumes)
- Then start again:
  ```
  docker compose up -d
  ```

This ensures teammates can start the stack immediately without manual configuration.

---

# 🧹 Reset Everything

If you want a clean environment:

```
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up -d --build
```

---
