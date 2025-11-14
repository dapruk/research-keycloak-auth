import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth-module';
import { PrismaService } from 'src/prisma.service';
import { InvoiceController } from './invoice-controller';

@Module({
  imports: [AuthModule],
  controllers: [InvoiceController],
  providers: [PrismaService],
})
export class InvoiceModule {}
