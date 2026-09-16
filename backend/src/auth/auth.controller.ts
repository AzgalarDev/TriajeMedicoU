import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService, SESSION_COOKIE } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ProvisionUserDto } from './dto/provision-user.dto';
import { CurrentUser } from './decorators/current-user.decorator';
import { Roles } from './decorators/roles.decorator';
import { RolesGuard } from './guards/roles.guard';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { ListUsersDto } from './dto/list-users.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { RecoverPasswordDto } from './dto/recover-password.dto';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';
import { AdminResetPasswordDto } from './dto/admin-reset-password.dto';
import { UpdateUserIdentityDto } from './dto/update-user-identity.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post('register') async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) { const result = await this.auth.register(dto); res.cookie(SESSION_COOKIE, result.token, this.auth.cookieOptions()); return { user: result.user }; }
  @Post('login') async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) { const result = await this.auth.login(dto); res.cookie(SESSION_COOKIE, result.token, this.auth.cookieOptions()); return { user: result.user }; }
  @Post('recover-password') recoverPassword(@Body() dto: RecoverPasswordDto) { return this.auth.recoverPassword(dto); }
  @Post('logout') async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) { await this.auth.logout(req.cookies?.[SESSION_COOKIE]); res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: this.auth.cookieOptions().secure, sameSite: 'strict', path: '/' }); return { success: true }; }
  @Get('session') @UseGuards(SessionAuthGuard) session(@CurrentUser() user: unknown) { return user; }
  @Post('users') @UseGuards(SessionAuthGuard, RolesGuard) @Roles('ADMINISTRATOR') provision(@Body() dto: ProvisionUserDto) { return this.auth.provision(dto); }
  @Get('users') @UseGuards(SessionAuthGuard, RolesGuard) @Roles('ADMINISTRATOR') listUsers(@Query() query: ListUsersDto) { return this.auth.listUsers(query); }
  @Patch('users/:id/status') @UseGuards(SessionAuthGuard, RolesGuard) @Roles('ADMINISTRATOR') updateStatus(@Param('id') id: string, @Body() dto: UpdateUserStatusDto, @CurrentUser() user: { id: string }) { return this.auth.updateUserStatus(id, dto.status, user.id); }
  @Post('users/:id/reset-password') @UseGuards(SessionAuthGuard, RolesGuard) @Roles('ADMINISTRATOR') resetPassword(@Param('id') id: string, @Body() dto: AdminResetPasswordDto) { return this.auth.resetManagedPassword(id, dto); }
  @Patch('users/:id/identity') @UseGuards(SessionAuthGuard, RolesGuard) @Roles('ADMINISTRATOR') updateIdentity(@Param('id') id: string, @Body() dto: UpdateUserIdentityDto) { return this.auth.updateUserIdentity(id, dto.nationalId); }
  @Get('patient-profile') @UseGuards(SessionAuthGuard, RolesGuard) @Roles('PATIENT') patientProfile(@CurrentUser() user: { id: string }) { return this.auth.getPatientProfile(user.id); }
  @Patch('patient-profile') @UseGuards(SessionAuthGuard, RolesGuard) @Roles('PATIENT') updatePatientProfile(@CurrentUser() user: { id: string }, @Body() dto: UpdatePatientProfileDto) { return this.auth.updatePatientProfile(user.id, dto); }
}
