import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // two Keycloak-linked identities (pretend subs)
  const kcIssuer = 'http://localhost:8080/realms/myrealm';

  const adminAuth = await prisma.auth.upsert({
    where: { issuer_subject: { issuer: kcIssuer, subject: 'sub-admin-001' } },
    update: {},
    create: {
      issuer: kcIssuer,
      subject: 'sub-admin-001',
      email: 'admin@example.com',
      username: 'admin01',
    },
  });

  const providerOwnerAuth = await prisma.auth.upsert({
    where: { issuer_subject: { issuer: kcIssuer, subject: 'sub-owner-001' } },
    update: {},
    create: {
      issuer: kcIssuer,
      subject: 'sub-owner-001',
      email: 'owner@acme.co.id',
      username: 'acme_owner',
    },
  });

  const clientAuth = await prisma.auth.upsert({
    where: { issuer_subject: { issuer: kcIssuer, subject: 'sub-client-001' } },
    update: {},
    create: {
      issuer: kcIssuer,
      subject: 'sub-client-001',
      email: 'op1@acme.co.id',
      username: 'acme_op1',
    },
  });

  // admin profile
  await prisma.admin.upsert({
    where: { userId: adminAuth.userId },
    update: {},
    create: {
      userId: adminAuth.userId,
      name: 'Super Admin',
      phone: '081234567890',
      role: 'SUPER_ADMIN',
    },
  });

  // company owned by providerOwnerAuth
  const company = await prisma.company.create({
    data: {
      userId: providerOwnerAuth.userId, // owner link (diagram)
      name: 'Acme Nusantara',
      address: 'Jl. Mawar No. 123, Bandung',
      phone: '022-555-1234',
    },
  });

  // client user under the company
  const client = await prisma.client.create({
    data: {
      companyId: company.id,
      userId: clientAuth.userId,
      name: 'Operator Satu',
      phone: '0813-555-0001',
      role: 'OPERATOR',
    },
  });

  // sample invoices
  await prisma.invoice.createMany({
    data: [
      {
        companyId: company.id,
        clientId: client.id,
        code: 'INV-0001',
        amountCents: 2500000,
        currency: 'IDR',
        status: 'SENT',
        description: 'Setup fee and first month service',
      },
      {
        companyId: company.id,
        clientId: client.id,
        code: 'INV-0002',
        amountCents: 1750000,
        currency: 'IDR',
        status: 'DRAFT',
        description: 'Hardware maintenance',
      },
    ],
  });

  console.log('Seed complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
