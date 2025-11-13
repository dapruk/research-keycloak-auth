import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from 'src/prisma.service';
import { AuthController } from './auth-controller';
import { AuthService } from './auth.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  providers: [AuthService, PrismaService],
  controllers: [AuthController],
})
export class AuthModule {}
