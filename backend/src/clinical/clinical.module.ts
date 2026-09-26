import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClinicalController } from './clinical.controller';
import { ClinicalService } from './clinical.service';
import { CLINICAL_LLM_PROVIDER } from './llm.provider';
import { OllamaProvider } from './ollama.provider';

@Module({ imports: [AuthModule], controllers: [ClinicalController], providers: [ClinicalService, OllamaProvider, { provide: CLINICAL_LLM_PROVIDER, useExisting: OllamaProvider }] })
export class ClinicalModule {}
