import { ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole, UserStatus } from '@prisma/client';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ProvisionUserDto } from './dto/provision-user.dto';
import { RecoverPasswordDto } from './dto/recover-password.dto';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';
import { AdminResetPasswordDto } from './dto/admin-reset-password.dto';

export const SESSION_COOKIE = 'triage_session';
type RecoveryAttempt = { count: number; firstAttemptAt: number };

@Injectable()
export class AuthService {
  private readonly recoveryAttempts = new Map<string, RecoveryAttempt>();

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  async register(dto: RegisterDto) {
    if (dto.password !== dto.passwordConfirmation) throw new ConflictException('Las contraseñas no coinciden');
    const existing = await this.prisma.user.findFirst({ where: { OR: [{ username: dto.username }, { nationalId: dto.nationalId }] }, select: { username: true, nationalId: true } });
    if (existing) throw new ConflictException(existing.username === dto.username ? 'El nombre de usuario ya existe' : 'El CI ya existe');
    const user = await this.prisma.user.create({ data: { fullName: dto.fullName.trim(), dateOfBirth: new Date(dto.dateOfBirth), sex: dto.sex, nationalId: dto.nationalId, address: dto.address?.trim(), username: dto.username, passwordHash: await bcrypt.hash(dto.password, 12), role: 'PATIENT', patientProfile: { create: {} } } });
    return this.createSession(user.id, user.username, user.role);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) throw new UnauthorizedException('Credenciales inválidas');
    if (user.status !== 'ACTIVE') throw new UnauthorizedException('La cuenta no está activa');
    return this.createSession(user.id, user.username, user.role);
  }

  async recoverPassword(dto: RecoverPasswordDto) { this.enforceRecoveryThrottle(dto.username, dto.nationalId); const generic = 'No se pudo restablecer la contraseña con los datos proporcionados'; const user = await this.prisma.user.findUnique({ where: { username: dto.username } }); if (!user || user.role !== 'PATIENT' || user.status !== 'ACTIVE' || user.nationalId !== dto.nationalId) throw new UnauthorizedException(generic); const passwordHash = await bcrypt.hash(dto.newPassword, 12); await this.prisma.$transaction([this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } }), this.prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } })]); this.clearRecoveryThrottle(dto.username, dto.nationalId); return { success: true };
  }

  async provision(dto: ProvisionUserDto) {
    const existing = await this.prisma.user.findFirst({ where: { OR: [{ username: dto.username }, { nationalId: dto.nationalId }] }, select: { username: true, nationalId: true } });
    if (existing) throw new ConflictException(existing.username === dto.username ? 'El nombre de usuario ya existe' : 'El CI ya existe');
    return this.prisma.user.create({ data: { fullName: dto.fullName.trim(), dateOfBirth: new Date(dto.dateOfBirth), sex: dto.sex, nationalId: dto.nationalId, address: dto.address?.trim(), username: dto.username, passwordHash: await bcrypt.hash(dto.password, 12), role: dto.role } , select: { id: true, fullName: true, username: true, role: true, status: true } });
  }

  async resetManagedPassword(id: string, dto: AdminResetPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
    if (!user || !['PHYSICIAN', 'ASSISTANT'].includes(user.role)) throw new NotFoundException('Usuario gestionado no encontrado');
    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { passwordHash } }),
      this.prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    return { success: true };
  }

  async updateUserIdentity(id: string, nationalId: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
    if (!user || !['PHYSICIAN', 'ASSISTANT'].includes(user.role)) throw new NotFoundException('Usuario gestionado no encontrado');
    const existing = await this.prisma.user.findUnique({ where: { nationalId }, select: { id: true } });
    if (existing && existing.id !== id) throw new ConflictException('El CI ya existe');
    return this.prisma.user.update({ where: { id }, data: { nationalId }, select: { id: true, username: true, fullName: true, nationalId: true, role: true, status: true } });
  }

  async currentUser(token?: string) {
    const session = await this.findSession(token);
    return { id: session.user.id, username: session.user.username, role: session.user.role, status: session.user.status };
  }

  async listUsers(filters: { role?: UserRole; status?: UserStatus }) { return this.prisma.user.findMany({ where: { ...(filters.role ? { role: filters.role } : {}), ...(filters.status ? { status: filters.status } : {}) }, select: { id: true, username: true, fullName: true, nationalId: true, role: true, status: true }, orderBy: { username: 'asc' } }); }

  async updateUserStatus(id: string, status: 'ACTIVE' | 'INACTIVE' | 'BLOCKED', currentUserId: string) { if (id === currentUserId && status !== 'ACTIVE') throw new ForbiddenException('Los administradores no pueden desactivar ni bloquear su propia cuenta'); const existing = await this.prisma.user.findUnique({ where: { id }, select: { id: true } }); if (!existing) throw new NotFoundException('Usuario no encontrado'); const updateUser = this.prisma.user.update({ where: { id }, data: { status }, select: { id: true, username: true, fullName: true, nationalId: true, role: true, status: true } }); if (status === 'ACTIVE') return updateUser; const [user] = await this.prisma.$transaction([updateUser, this.prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } })]); return user; }
  getPatientProfile(userId: string) { return this.prisma.patientProfile.upsert({ where: { userId }, create: { userId }, update: {}, select: { medicalHistory: true, allergies: true, currentMedications: true, chronicConditions: true } }); }
  updatePatientProfile(userId: string, dto: UpdatePatientProfileDto) { return this.prisma.patientProfile.upsert({ where: { userId }, create: { userId, ...dto }, update: dto, select: { medicalHistory: true, allergies: true, currentMedications: true, chronicConditions: true } }); }

  async logout(token?: string) {
    if (token) await this.prisma.session.updateMany({ where: { tokenHash: this.hashToken(token), revokedAt: null }, data: { revokedAt: new Date() } });
  }

  cookieOptions() { return { httpOnly: true, secure: this.cookieSecure(), sameSite: 'strict' as const, maxAge: this.ttlMs(), path: '/' }; }

  async findSession(token?: string) {
    if (!token) throw new UnauthorizedException('Se requiere una sesión');
    const session = await this.prisma.session.findUnique({ where: { tokenHash: this.hashToken(token) }, include: { user: true } });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.status !== 'ACTIVE') throw new UnauthorizedException('La sesión no es válida');
    return session;
  }

  private async createSession(userId: string, username: string, role: string) {
    const token = randomBytes(32).toString('hex');
    await this.prisma.session.create({ data: { userId, tokenHash: this.hashToken(token), expiresAt: new Date(Date.now() + this.ttlMs()) } });
    return { token, user: { id: userId, username, role } };
  }

  private hashToken(token: string) { return createHash('sha256').update(token).digest('hex'); }
  private ttlMs() { return Number(this.config.get('SESSION_TTL_HOURS', '8')) * 60 * 60 * 1000; }
  private recoveryKey(username: string, nationalId: string) { return `${username.trim().toLowerCase()}:${nationalId.trim()}`; }
  private enforceRecoveryThrottle(username: string, nationalId: string) { const limit = Number(this.config.get('PASSWORD_RECOVERY_LIMIT', '5')); const windowMs = Number(this.config.get('PASSWORD_RECOVERY_WINDOW_MINUTES', '15')) * 60 * 1000; const key = this.recoveryKey(username, nationalId); const now = Date.now(); const current = this.recoveryAttempts.get(key); if (!current || now - current.firstAttemptAt > windowMs) { this.recoveryAttempts.set(key, { count: 1, firstAttemptAt: now }); return; } if (current.count >= limit) throw new HttpException('Demasiados intentos de recuperación de contraseña. Intente nuevamente más tarde.', HttpStatus.TOO_MANY_REQUESTS); current.count += 1; }
  private clearRecoveryThrottle(username: string, nationalId: string) { this.recoveryAttempts.delete(this.recoveryKey(username, nationalId)); }
  private cookieSecure() { const configured = this.config.get<string>('COOKIE_SECURE'); const production = this.config.get('NODE_ENV') === 'production'; if (configured === undefined || configured === '') return production; if (!['true', 'false'].includes(configured)) throw new Error('COOKIE_SECURE must be "true" or "false"'); if (production && configured === 'false') throw new Error('COOKIE_SECURE=false is not allowed when NODE_ENV=production'); return configured === 'true'; }
}
