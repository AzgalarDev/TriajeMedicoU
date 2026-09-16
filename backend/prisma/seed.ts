import { PrismaClient, Sex, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const required = ['DEFAULT_ADMIN_USERNAME', 'DEFAULT_ADMIN_PASSWORD', 'DEFAULT_ADMIN_FULL_NAME', 'DEFAULT_ADMIN_DATE_OF_BIRTH', 'DEFAULT_ADMIN_NATIONAL_ID'] as const;

function env(name: string) { const value = process.env[name]?.trim(); if (!value) throw new Error(`Missing required environment variable: ${name}`); return value; }

export function readDefaultAdminEnv() {
  const values = Object.fromEntries(required.map((name) => [name, env(name)])) as Record<(typeof required)[number], string>;
  if (!/^[A-Za-z0-9._-]+$/.test(values.DEFAULT_ADMIN_USERNAME)) throw new Error('DEFAULT_ADMIN_USERNAME is invalid.');
  if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(values.DEFAULT_ADMIN_PASSWORD)) throw new Error('DEFAULT_ADMIN_PASSWORD must be at least 8 characters and contain a letter and a number.');
  if (Number.isNaN(Date.parse(values.DEFAULT_ADMIN_DATE_OF_BIRTH))) throw new Error('DEFAULT_ADMIN_DATE_OF_BIRTH must be an ISO date.');
  if (!/^\d+$/.test(values.DEFAULT_ADMIN_NATIONAL_ID)) throw new Error('DEFAULT_ADMIN_NATIONAL_ID must contain only digits.');
  const sex = (process.env.DEFAULT_ADMIN_SEX?.trim() || 'MALE') as Sex;
  if (!Object.values(Sex).includes(sex)) throw new Error('DEFAULT_ADMIN_SEX must be MALE or FEMALE.');
  return { ...values, sex };
}

export async function seedDefaultAdmin(prisma: PrismaClient) {
  const input = readDefaultAdminEnv();
  const existing = await prisma.user.findUnique({ where: { username: input.DEFAULT_ADMIN_USERNAME }, select: { id: true, role: true } });
  if (existing) { if (existing.role !== UserRole.ADMINISTRATOR) throw new Error('Default admin username belongs to a non-administrator.'); return prisma.user.findUniqueOrThrow({ where: { id: existing.id }, select: { id: true, username: true, role: true, status: true } }); }
  return prisma.user.create({ data: { fullName: input.DEFAULT_ADMIN_FULL_NAME, dateOfBirth: new Date(input.DEFAULT_ADMIN_DATE_OF_BIRTH), sex: input.sex, nationalId: input.DEFAULT_ADMIN_NATIONAL_ID, username: input.DEFAULT_ADMIN_USERNAME, passwordHash: await bcrypt.hash(input.DEFAULT_ADMIN_PASSWORD, 12), role: UserRole.ADMINISTRATOR }, select: { id: true, username: true, role: true, status: true } });
}

if (require.main === module) { const prisma = new PrismaClient(); seedDefaultAdmin(prisma).then((admin) => { console.log(`Default administrator ready: ${admin.username}`); }).catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect()); }
