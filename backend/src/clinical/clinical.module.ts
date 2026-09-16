import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClinicalController } from './clinical.controller';
import { ClinicalService } from './clinical.service';

@Module({ imports: [AuthModule], controllers: [ClinicalController], providers: [ClinicalService] })
export class ClinicalModule {}
