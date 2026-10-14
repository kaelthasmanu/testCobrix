import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'

@Injectable()
export class AuthGuard implements CanActivate {
	constructor(private readonly jwt: JwtService) {}

	canActivate(context: ExecutionContext): boolean {
		const request = context.switchToHttp().getRequest<{ headers: { authorization?: string }; user?: { sub: string } }>()
		const token = request.headers.authorization?.replace(/^Bearer\s+/i, '')
		if (!token) throw new UnauthorizedException('Falta el token de Cobrix.')
		try {
			request.user = this.jwt.verify<{ sub: string }>(token)
			return true
		} catch {
			throw new UnauthorizedException('El token de Cobrix es inválido o expiró.')
		}
	}
}
