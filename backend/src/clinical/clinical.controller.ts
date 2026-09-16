import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ClinicalService, assertStaff } from './clinical.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { SearchPatientsDto } from './dto/search-patients.dto';
import { UpdateClinicalProfileDto } from './dto/update-clinical-profile.dto';
import { CreateTriageDto } from './dto/create-triage.dto';

@Controller('clinical')
@UseGuards(SessionAuthGuard, RolesGuard)
export class ClinicalController {
  constructor(private readonly clinical: ClinicalService) {}
  @Get('patients') @Roles('PHYSICIAN', 'ASSISTANT') search(@Query() dto: SearchPatientsDto) { return this.clinical.searchPatients(dto); }
  @Get('patients/:id') @Roles('PHYSICIAN', 'ASSISTANT') patient(@Param('id') id: string) { return this.clinical.getPatient(id); }
  @Patch('patients/:id/profile') @Roles('PHYSICIAN') profile(@Param('id') id: string, @Body() dto: UpdateClinicalProfileDto) { return this.clinical.updateProfile(id, dto); }
  @Post('patients/:id/triages') @Roles('PHYSICIAN') triage(@Param('id') patientId: string, @Headers('idempotency-key') idempotencyKey: string | undefined, @CurrentUser() user: { id: string; role: string }, @Body() dto: CreateTriageDto) { assertStaff(user.role); return this.clinical.createTriage(patientId, user.id, dto, idempotencyKey); }
}
