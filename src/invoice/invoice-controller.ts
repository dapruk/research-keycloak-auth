import { Controller, Get, UseGuards } from '@nestjs/common';
import { KeycloakAuthGuard } from 'src/auth/keycloak-auth.guard';
import { RequiresPermission } from 'src/auth/permission-decorator';
import { PrismaService } from 'src/prisma.service';

@Controller('invoice')
@UseGuards(KeycloakAuthGuard)
export class InvoiceController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('internal/view-table')
  @RequiresPermission('invoice-api#view')
  async getInternalInvoiceTable() {
    const invoices = await this.prisma.invoice.findMany({
      include: { company: true, client: true },
      orderBy: { issuedAt: 'desc' },
    });

    const data = invoices.map((inv) => ({
      id: inv.id,
      code: inv.code,
      status: inv.status,
      amountCents: inv.amountCents,
      currency: inv.currency,
      issuedAt: inv.issuedAt,
      dueAt: inv.dueAt,
      description: inv.description,
      company: {
        id: inv.company.id,
        name: inv.company.name,
        phone: inv.company.phone,
        address: inv.company.address,
      },
      client: inv.client
        ? {
            id: inv.client.id,
            name: inv.client.name,
            phone: inv.client.phone,
            role: inv.client.role,
          }
        : null,
    }));

    return { ok: true, data };
  }

  @Get('external/view-table')
  @RequiresPermission('invoice-api#view-external')
  async getExternalInvoiceTable() {
    const invoices = await this.prisma.invoice.findMany({
      include: { company: true, client: true },
      orderBy: { issuedAt: 'desc' },
    });

    const data = invoices.map((inv) => ({
      id: inv.id,
      code: inv.code,
      status: inv.status,
      issuedAt: inv.issuedAt,
      dueAt: inv.dueAt,
      description: inv.description,
      company: {
        id: inv.company.id,
        name: inv.company.name,
      },
      client: inv.client
        ? {
            id: inv.client.id,
            name: inv.client.name,
          }
        : null,
    }));

    return { ok: true, data };
  }
}
