import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AuthService, SESSION_COOKIE } from '../auth.service';

type AuthenticatedRequest = Request & { user?: unknown };

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session = await this.auth.findSession(request.cookies?.[SESSION_COOKIE]);
    request.user = { id: session.user.id, username: session.user.username, role: session.user.role, status: session.user.status };
    return true;
  }
}
